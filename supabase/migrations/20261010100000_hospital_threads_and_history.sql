-- Conversations are part of the medical record and are now kept, read-only, by
-- both sides after a relationship ends. A hospital thread can say it is the
-- hospital's. And moving someone to a non-clinical role hands over their
-- clinical work the way leaving does. Three founder decisions.
--
-- 1. Message history is kept (docs/plans/sharing-infrastructure-v2.md G3).
--
-- The canonical model said both sides keep read-only access to their messages;
-- the code did not. Every rule that limited it, found by searching the
-- migrations and the functions for 90-day intervals and for the message read
-- policies:
--
--   * clinician_had_patient_access_at() (20260819154827, recreated in
--     20261003000000 and 20261010050000) gave a private clinician "a bounded
--     90-day wind-down for read access" after a share was revoked or expired,
--     then nothing. The 90-day clause is removed. What remains is what it
--     always asked: a clinician account, a share with this patient, and a
--     message written while that share was live. So the clinician keeps the
--     thread permanently and reads nothing written outside it.
--   * The hospital read policy (20261010070000) asked practice_clinical_access(),
--     which needs the patient's share to be live, so a hospital lost every
--     thread the moment the patient stopped sharing. 20260820120000 said so on
--     purpose ("loses it when it ends"); that is reversed. A hospital thread is
--     now read by the clinical staff on the patient's care there (an assignment
--     still open, or the wide view), whether or not the patient still shares,
--     under the same rule as before about whose thread it is: its own clinician
--     while they work there, the care team once they have gone. After the
--     patient has stopped sharing, the hospital's owners and admins read it too,
--     for governance. They do not while the patient shares; the care team
--     answers for a live relationship. The hospital's own suspension of its
--     staff's access to a patient still stops its clinical staff.
--   * The attachment files behind messages were readable by whoever's id was in
--     the storage path. That let a leaver keep opening files from the hospital's
--     threads, and never let the care team covering a departed colleague's
--     thread open them. A file is now readable by the patient, or by anyone who
--     may read the message it belongs to.
--   * Unrelated 90-day windows, left alone: the vitals shown in a snapshot link
--     (20261010060000), a founder dashboard metric (20261004000000), and seed
--     data.
--
-- Nobody can write in a thread that has ended: the INSERT policies are
-- unchanged (20261010090000), and so are the read-receipt paths, which ask for
-- live access. The patient always reads their own. Leavers still lose the
-- hospital's threads, their own included: a hospital thread is the hospital's.
-- History ends only with an account (auth.users cascades) or, for a file, its
-- withdrawal, which leaves the message in place with a marker (20260923100000);
-- there is no other deletion of messages.
--
-- The rule is one helper, message_readable_by_caller(), used by the policy, by
-- the attachment policy, and by my_message_history_patients(), which gives a
-- clinician the names of the patients whose ended threads they still hold.
-- Without it the clinician's Messages screen, built from live relationships,
-- had no way to reach a history the database now keeps for them. Names only:
-- contact details still need a live relationship (20261009010000).
--
-- 2. Hospital threads speak as the hospital. my_message_counterparties() gains
-- clinician_status for a hospital thread: active, left, or non_clinical (still
-- a member, no longer seeing patients). With practice_id and practice_name the
-- patient's screen can title a thread whose clinician has gone with the
-- hospital's name, and word its notices and next steps for the hospital rather
-- than for a departed clinician. Its return type changes, so it is dropped and
-- recreated.
--
-- 3. A move to a non-clinical role is leaving clinical work. 20261010070000
-- froze a member's unsigned drafts and unfiled dictations only when they left,
-- and said so. Now a member whose role goes from clinical to non-clinical
-- (practice_role_is_clinical) is handed over the same way: the same freeze, the
-- same routing to owners, admins and department leads, and the notice says
-- they moved to a non-clinical role rather than that they left. They remain a
-- member. Their assignments already end (trg_end_assignments_of_departed_member,
-- 20261009030000), and every clinical read and write already asks for a
-- clinical role, so both are unchanged and proven in offboarding_handover.
-- The needs-cover list counts a patient left with nobody by such a move, and
-- lists pending proposals of someone no longer clinical there. Moving back to
-- a clinical role does not unfreeze anything, as with a returning leaver.

-- ---------------------------------------------------------------------------
-- 1. Who reads a conversation
-- ---------------------------------------------------------------------------

-- The window stays; the wind-down goes.
CREATE OR REPLACE FUNCTION public.clinician_had_patient_access_at(patient_user_id uuid, at_time timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL OR NOT public.caller_is_clinician() THEN false
  ELSE EXISTS (
    SELECT 1
    FROM public.provider_shares ps
    WHERE ps.user_id = patient_user_id
      AND (
        ps.clinician_user_id = auth.uid()
        OR lower(ps.provider_email) = public.confirmed_email()
      )
      -- Written while that share was live: from its start to its end, or now.
      AND at_time >= ps.created_at
      AND at_time <= COALESCE(
            ps.revoked_at,
            CASE WHEN ps.is_active AND (ps.expires_at IS NULL OR ps.expires_at > now())
                 THEN now() ELSE ps.expires_at END,
            ps.created_at
          )
  )
  END
$$;

/**
 * Whether the caller reads the hospital thread (_patient, _thread_clinician)
 * belonging to _practice_id. Clinical staff on the patient's care there read
 * it whether or not the patient still shares; the thread is its own
 * clinician's while they are an active clinician there, and the care team's
 * once they are not. Owners and admins read it once the patient has stopped
 * sharing. Leavers, and anyone not clinical, read nothing.
 */
CREATE OR REPLACE FUNCTION public.practice_thread_readable(_practice_id uuid, _patient uuid, _thread_clinician uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL AND _practice_id IS NOT NULL AND _patient IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.practice_shares ps
      JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
      JOIN public.practices p ON p.id = ps.practice_id
     WHERE ps.practice_id = _practice_id
       AND ps.user_id = _patient
       AND pm.user_id = auth.uid()
       AND pm.status = 'active'
       AND (
         (public.practice_role_is_clinical(pm.role)
          AND ps.practice_suspended_at IS NULL
          AND (pm.can_view_all_patients
               OR (p.is_active AND EXISTS (
                     SELECT 1 FROM public.practice_patient_assignments a
                      WHERE a.practice_id = _practice_id
                        AND a.patient_user_id = _patient
                        AND a.clinician_user_id = auth.uid()
                        AND a.effective_from <= now()
                        AND (a.effective_to IS NULL OR a.effective_to > now()))))
          AND (_thread_clinician = auth.uid()
               OR NOT public.member_is_active_clinician(_practice_id, _thread_clinician)))
         OR (pm.role IN ('owner', 'admin') AND ps.is_active IS NOT TRUE)
       )
  );
$$;

REVOKE ALL ON FUNCTION public.practice_thread_readable(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.practice_thread_readable(uuid, uuid, uuid) TO authenticated;

/**
 * Whether the caller, on the clinical side, reads a message with these
 * columns. The one rule for message history: the row policy, the attachment
 * policy and my_message_history_patients() all ask it.
 */
CREATE OR REPLACE FUNCTION public.message_readable_by_caller(
  _patient uuid, _clinician uuid, _practice_id uuid, _created_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR _patient IS NULL THEN false
    WHEN _practice_id IS NULL THEN
      auth.uid() = _clinician
      AND (public.clinician_had_patient_access_at(_patient, _created_at)
           OR public.institution_has_patient_access(_patient))
    ELSE public.practice_thread_readable(_practice_id, _patient, _clinician)
  END;
$$;

REVOKE ALL ON FUNCTION public.message_readable_by_caller(uuid, uuid, uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.message_readable_by_caller(uuid, uuid, uuid, timestamptz) TO authenticated;

-- The two clinician read policies become one, so the private and hospital
-- halves cannot be changed apart. The patient's own policy is untouched.
DROP POLICY IF EXISTS "Clinicians can read message history they took part in" ON public.messages;
DROP POLICY IF EXISTS "The practice's clinicians read its threads" ON public.messages;
DROP POLICY IF EXISTS "The clinical side reads the conversations it keeps" ON public.messages;
CREATE POLICY "The clinical side reads the conversations it keeps"
ON public.messages FOR SELECT TO authenticated
USING (public.message_readable_by_caller(patient_user_id, clinician_user_id, practice_id, created_at));

-- The file behind a message goes with the message. The withdrawal check stays.
DROP POLICY IF EXISTS "Chat participants can read attachments" ON storage.objects;
CREATE POLICY "Chat participants can read attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND array_length(storage.foldername(name), 1) >= 2
  AND NOT EXISTS (
    SELECT 1 FROM public.messages m
     WHERE m.attachment_path = storage.objects.name
       AND m.attachment_retracted_at IS NOT NULL
  )
  AND (
    -- Paths are <patient>/<clinician>/...: the patient's own files.
    auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM public.messages m
       WHERE m.attachment_path = storage.objects.name
         AND public.message_readable_by_caller(m.patient_user_id, m.clinician_user_id, m.practice_id, m.created_at)
    )
  )
);

COMMENT ON POLICY "Chat participants can read attachments" ON storage.objects IS
  'The patient, and whoever may read the message the file belongs to (message_readable_by_caller), minus anything withdrawn. '
  'Not the storage path alone: that let a leaver keep a hospital thread''s files and kept them from the covering care team.';

/**
 * For a clinician: each patient whose conversation they still read, with the
 * patient's name and the hospital it belongs to (NULL: private). Lets the
 * Messages screen show threads whose relationship has ended, read-only. Name
 * only; contact details still need a live relationship.
 */
CREATE OR REPLACE FUNCTION public.my_message_history_patients()
RETURNS TABLE(patient_user_id uuid, patient_name text, practice_id uuid, practice_name text, last_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT h.patient_user_id, h.patient_name, h.practice_id, h.practice_name, h.last_at
    FROM (
      SELECT DISTINCT ON (m.patient_user_id)
             m.patient_user_id,
             (SELECT nullif(btrim(p.name), '') FROM public.profiles p WHERE p.user_id = m.patient_user_id) AS patient_name,
             m.practice_id,
             pr.name AS practice_name,
             m.created_at AS last_at
        FROM public.messages m
        LEFT JOIN public.practices pr ON pr.id = m.practice_id
       WHERE auth.uid() IS NOT NULL
         AND m.patient_user_id <> auth.uid()
         AND (m.clinician_user_id = auth.uid()
              OR m.practice_id IN (SELECT pm.practice_id FROM public.practice_members pm
                                    WHERE pm.user_id = auth.uid() AND pm.status = 'active'))
         AND public.message_readable_by_caller(m.patient_user_id, m.clinician_user_id, m.practice_id, m.created_at)
       ORDER BY m.patient_user_id, m.created_at DESC
    ) h
   ORDER BY h.last_at DESC;
$$;

REVOKE ALL ON FUNCTION public.my_message_history_patients() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_message_history_patients() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. What the patient's Messages screen is told
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.my_message_counterparties();

/**
 * As in 20261010090000, plus clinician_status for a hospital thread:
 *   active        still a clinician at that hospital
 *   non_clinical  still a member there, in a role that does not see patients
 *   left          no longer a member there
 * NULL for a private thread.
 */
CREATE FUNCTION public.my_message_counterparties()
RETURNS TABLE(
  clinician_user_id uuid,
  clinician_name text,
  practice_id uuid,
  practice_name text,
  can_send boolean,
  reason text,
  ended_at timestamptz,
  ended_by_patient boolean,
  continues_with jsonb,
  clinician_status text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  _me   uuid := auth.uid();
  _c    uuid;
  _ps   record;
  _pr   record;
  _prac record;
BEGIN
  IF _me IS NULL THEN
    RETURN;
  END IF;

  FOR _c IN
    SELECT DISTINCT x.id FROM (
      SELECT ps.clinician_user_id AS id FROM public.provider_shares ps WHERE ps.user_id = _me
      UNION
      SELECT m.clinician_user_id FROM public.messages m WHERE m.patient_user_id = _me
      UNION
      SELECT a.clinician_user_id FROM public.practice_patient_assignments a
       WHERE a.patient_user_id = _me
         AND public.is_assigned_to_patient_in_practice(a.clinician_user_id, _me, a.practice_id)
    ) x
    WHERE x.id IS NOT NULL AND x.id <> _me
  LOOP
    clinician_user_id := _c;
    practice_id := public.message_thread_practice(_me, _c);
    can_send := public.message_thread_readers_exist(_me, _c, practice_id);
    practice_name := NULL;
    ended_at := NULL;
    ended_by_patient := false;
    continues_with := '[]'::jsonb;
    clinician_status := NULL;

    -- The most relevant private share: a live one first, else the latest to end.
    SELECT ps.* INTO _ps
      FROM public.provider_shares ps
      LEFT JOIN auth.users u ON u.id = _c AND u.email_confirmed_at IS NOT NULL
     WHERE ps.user_id = _me
       AND (ps.clinician_user_id = _c
            OR (u.email IS NOT NULL AND lower(ps.provider_email) = lower(u.email)))
     ORDER BY (ps.is_active AND (ps.expires_at IS NULL OR ps.expires_at > now())) DESC,
              COALESCE(ps.revoked_at, ps.expires_at, ps.created_at) DESC
     LIMIT 1;

    clinician_name := COALESCE(
      (SELECT nullif(btrim(concat_ws(' ', nullif(btrim(cp.title), ''), nullif(btrim(cp.first_name), ''),
                                     nullif(btrim(cp.last_name), ''))), '')
         FROM public.clinician_profiles cp WHERE cp.user_id = _c LIMIT 1),
      nullif(btrim(_ps.provider_name), ''),
      (SELECT nullif(btrim(p.name), '') FROM public.profiles p WHERE p.user_id = _c LIMIT 1),
      'Your clinician');

    IF practice_id IS NULL THEN
      reason := CASE
        WHEN can_send THEN 'open'
        WHEN _ps.id IS NULL THEN 'no_connection'
        WHEN NOT public.is_clinician_account(_c) THEN 'not_a_clinician'
        WHEN NOT _ps.is_active THEN 'sharing_stopped'
        WHEN _ps.expires_at IS NOT NULL AND _ps.expires_at <= now() THEN 'share_expired'
        ELSE 'no_connection'
      END;
      IF reason = 'sharing_stopped' THEN
        ended_at := _ps.revoked_at;
        ended_by_patient := COALESCE(_ps.revoked_by = _me, false);
      ELSIF reason = 'share_expired' THEN
        ended_at := _ps.expires_at;
      END IF;
    ELSE
      SELECT pr.name, pr.is_active INTO _prac FROM public.practices pr WHERE pr.id = practice_id;
      practice_name := _prac.name;
      SELECT s.* INTO _pr FROM public.practice_shares s WHERE s.practice_id = practice_id AND s.user_id = _me;

      clinician_status := CASE
        WHEN public.member_is_active_clinician(practice_id, _c) THEN 'active'
        WHEN EXISTS (SELECT 1 FROM public.practice_members pm
                      WHERE pm.practice_id = practice_id AND pm.user_id = _c AND pm.status = 'active')
          THEN 'non_clinical'
        ELSE 'left'
      END;

      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'user_id', a.clinician_user_id,
               'name', COALESCE(
                 (SELECT nullif(btrim(concat_ws(' ', nullif(btrim(cp.title), ''), nullif(btrim(cp.first_name), ''),
                                                nullif(btrim(cp.last_name), ''))), '')
                    FROM public.clinician_profiles cp WHERE cp.user_id = a.clinician_user_id LIMIT 1),
                 'A clinician')) ORDER BY a.effective_from), '[]'::jsonb)
        INTO continues_with
        FROM (SELECT DISTINCT ON (x.clinician_user_id) x.clinician_user_id, x.effective_from
                FROM public.practice_patient_assignments x
               WHERE x.practice_id = practice_id
                 AND x.patient_user_id = _me
                 AND x.clinician_user_id <> _c
                 AND public.is_assigned_to_patient_in_practice(x.clinician_user_id, _me, x.practice_id)
               ORDER BY x.clinician_user_id, x.effective_from) a;

      reason := CASE
        WHEN can_send AND clinician_status = 'active' THEN 'open'
        WHEN can_send THEN 'covered'
        WHEN _pr.id IS NULL THEN 'no_connection'
        WHEN NOT _pr.is_active THEN 'sharing_stopped'
        WHEN _pr.practice_suspended_at IS NOT NULL OR _prac.is_active IS NOT TRUE THEN 'practice_paused'
        WHEN clinician_status <> 'active' THEN 'clinician_left'
        ELSE 'not_on_care_team'
      END;
      IF reason = 'sharing_stopped' THEN
        ended_at := _pr.revoked_at;
        ended_by_patient := COALESCE(_pr.revoked_by = _me, false);
      ELSIF reason = 'practice_paused' THEN
        ended_at := _pr.practice_suspended_at;
      ELSIF reason IN ('covered', 'clinician_left') AND clinician_status = 'left' THEN
        SELECT pm.ended_at INTO ended_at FROM public.practice_members pm
         WHERE pm.practice_id = practice_id AND pm.user_id = _c;
      END IF;
    END IF;

    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.my_message_counterparties() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_message_counterparties() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Moving to a non-clinical role hands over clinical work
-- ---------------------------------------------------------------------------

/** Nobody but resolve_departed_draft changes a frozen draft or dictation. */
CREATE OR REPLACE FUNCTION public.guard_departed_draft()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF OLD.author_departed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This was left unfinished by someone who has since left the practice or moved to a non-clinical role, and is kept as they left it. A lead can sign it off, mark it entered in error, or archive it.'
      USING ERRCODE = '42501';
  END IF;

  IF ROW(NEW.author_departed_at, NEW.disposition, NEW.disposition_by, NEW.disposition_at, NEW.disposition_note)
     IS DISTINCT FROM
     ROW(OLD.author_departed_at, OLD.disposition, OLD.disposition_by, OLD.disposition_at, OLD.disposition_note) THEN
    RAISE EXCEPTION 'Only a departure or a move to a non-clinical role freezes a record, and only resolve_departed_draft resolves one'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

/**
 * On departure, or on a move from a clinical to a non-clinical role: freeze
 * the member's unfinished work in that practice and route each item to the
 * people who answer for it. One notice per item per recipient, sharing
 * related_id = the item, so resolving it closes every copy.
 */
CREATE OR REPLACE FUNCTION public.hand_over_departed_work()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _frozen    jsonb;
  _item      jsonb;
  _patient   uuid;
  _who       uuid;
  _leaver    text := public.notice_person_name(NEW.user_id);
  _practice  text;
  _message   text;
  _left      boolean := OLD.status = 'active' AND NEW.status IS DISTINCT FROM 'active';
  _moved     boolean := OLD.status = 'active' AND NEW.status = 'active'
                        AND public.practice_role_is_clinical(OLD.role)
                        AND NOT public.practice_role_is_clinical(NEW.role);
BEGIN
  IF NOT (_left OR _moved) THEN
    RETURN NULL;
  END IF;

  SELECT name INTO _practice FROM public.practices WHERE id = NEW.practice_id;
  _practice := COALESCE(_practice, 'the practice');

  -- Collected first: a loop cannot run over a statement that writes.
  WITH frozen_notes AS (
      UPDATE public.encounters
         SET author_departed_at = now()
       WHERE practice_id = NEW.practice_id
         AND clinician_user_id = NEW.user_id
         AND signed_at IS NULL
         AND author_departed_at IS NULL
         AND COALESCE(status, '') NOT IN ('entered-in-error', 'cancelled')
      RETURNING id, patient_user_id, created_at, 'note'::text AS kind
    ), frozen_dictations AS (
      UPDATE public.clinician_dictations
         SET author_departed_at = now()
       WHERE practice_id = NEW.practice_id
         AND clinician_user_id = NEW.user_id
         AND filed_at IS NULL
         AND status <> 'filed'
         AND archived_at IS NULL
         AND author_departed_at IS NULL
      RETURNING id, patient_user_id, created_at, 'dictation'::text AS kind
    )
  SELECT COALESCE(jsonb_agg(to_jsonb(f)), '[]'::jsonb) INTO _frozen
    FROM (SELECT * FROM frozen_notes UNION ALL SELECT * FROM frozen_dictations) f;

  FOR _item IN SELECT * FROM jsonb_array_elements(_frozen)
  LOOP
    _patient := (_item ->> 'patient_user_id')::uuid;
    _message := format(
      '%s %s with an %s for %s, started %s. It is kept as they left it until someone signs it off, marks it entered in error, or archives it.',
      _leaver,
      CASE WHEN _moved THEN 'moved to a non-clinical role at ' || _practice ELSE 'left ' || _practice END,
      CASE _item ->> 'kind' WHEN 'note' THEN 'unsigned note' ELSE 'unfiled dictation' END,
      public.notice_patient_name(_patient),
      to_char((_item ->> 'created_at')::timestamptz, 'DD Mon YYYY'));

    FOR _who IN
      SELECT pm.user_id
        FROM public.practice_members pm
       WHERE pm.practice_id = NEW.practice_id
         AND pm.status = 'active'
         AND pm.role IN ('owner', 'admin')
      UNION
      SELECT pdm.user_id
        FROM public.practice_patient_departments ppd
        JOIN public.practice_department_members pdm
          ON pdm.department_id = ppd.department_id AND pdm.is_lead
        JOIN public.practice_members pm
          ON pm.practice_id = pdm.practice_id AND pm.user_id = pdm.user_id AND pm.status = 'active'
       WHERE ppd.practice_id = NEW.practice_id
         AND ppd.patient_user_id = _patient
         AND ppd.effective_to IS NULL
    LOOP
      CONTINUE WHEN _who = NEW.user_id;
      CONTINUE WHEN NOT public.notification_allowed(_who, 'departed_work_handover', 'in_app');
      INSERT INTO public.clinician_guidance_notifications (
        clinician_user_id, patient_user_id, notification_type, practice_id, message, related_id
      ) VALUES (
        _who, _patient, 'departed_author_drafts', NEW.practice_id, _message, (_item ->> 'id')::uuid
      );
    END LOOP;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.hand_over_departed_work() FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.encounters.author_departed_at IS
  'Set when the author left the practice, or moved to a non-clinical role there, with this note unsigned. From then no client may change it; a lead resolves it through resolve_departed_draft.';
COMMENT ON COLUMN public.clinician_dictations.author_departed_at IS
  'Set when the author left the practice, or moved to a non-clinical role there, with this dictation unfiled. Frozen from then; resolved through resolve_departed_draft.';

/**
 * The needs-cover list, as in 20261010070000, now also counting a move to a
 * non-clinical role as the end of someone's clinical work there: a patient
 * left with nobody by it, and a pending proposal made by someone no longer
 * clinical there. Frozen drafts say which of the two happened. Tasks and
 * appointments are still listed for leavers only: a member in a
 * non-clinical role can still hold a task, and a booking with them is the
 * hospital's to review in its diary.
 */
CREATE OR REPLACE FUNCTION public.practice_handover_queue(_practice_id uuid)
RETURNS TABLE (
  kind text,
  item_id uuid,
  patient_user_id uuid,
  patient_name text,
  departed_user_id uuid,
  departed_name text,
  detail text,
  since timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  _manager boolean := public.can_manage_practice(_practice_id);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;
  IF NOT (_manager OR public.is_department_lead(_practice_id)) THEN
    RAISE EXCEPTION 'Only this practice''s owners, admins and department leads see the handover list'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH departed AS (
    SELECT pm.user_id FROM public.practice_members pm
     WHERE pm.practice_id = _practice_id AND pm.status <> 'active'
  ),
  -- The moments someone's clinical work here ended: they left, or were moved
  -- to a role that does not see patients.
  clinical_ends AS (
    SELECT e.user_id, e.created_at, (e.event_type = 'role_changed') AS moved
      FROM public.practice_membership_events e
     WHERE e.practice_id = _practice_id
       AND (e.event_type = 'ended'
            OR (e.event_type = 'role_changed'
                AND public.practice_role_is_clinical((e.details ->> 'from_role')::public.practice_role)
                AND NOT public.practice_role_is_clinical((e.details ->> 'to_role')::public.practice_role)))
  ),
  needs_cover AS (
    -- Patients whose clinician's work here ended and who now have nobody. An
    -- assignment is taken to have ended with it when it closed at that moment
    -- (the same transaction stamps both).
    SELECT DISTINCT ON (ps.user_id)
           'patient'::text AS kind, ps.user_id AS item_id, ps.user_id AS patient_user_id,
           a.clinician_user_id AS departed_user_id,
           'Was with ' || public.notice_person_name(a.clinician_user_id)
             || CASE WHEN e.moved THEN ', who moved to a non-clinical role on ' ELSE ', who left on ' END
             || to_char(e.created_at, 'DD Mon YYYY') || '. Nobody is assigned now.' AS detail,
           e.created_at AS since
      FROM public.practice_shares ps
      JOIN public.practice_patient_assignments a
        ON a.practice_id = ps.practice_id AND a.patient_user_id = ps.user_id AND a.effective_to <= now()
      JOIN clinical_ends e
        ON e.user_id = a.clinician_user_id
       AND a.effective_to BETWEEN e.created_at - interval '1 second' AND e.created_at + interval '1 second'
     WHERE ps.practice_id = _practice_id
       AND ps.is_active AND ps.practice_suspended_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.practice_patient_assignments c
          WHERE c.practice_id = _practice_id AND c.patient_user_id = ps.user_id
            AND (c.effective_to IS NULL OR c.effective_to > now()))
     ORDER BY ps.user_id, e.created_at DESC
  ),
  items AS (
    SELECT nc.kind, nc.item_id, nc.patient_user_id, nc.departed_user_id, nc.detail, nc.since
      FROM needs_cover nc

    UNION ALL
    SELECT 'draft', en.id, en.patient_user_id, en.clinician_user_id,
           CASE WHEN en.clinician_user_id IN (SELECT user_id FROM departed)
                THEN 'Unsigned — author departed. Started '
                ELSE 'Unsigned — author moved to a non-clinical role. Started ' END
             || to_char(en.created_at, 'DD Mon YYYY') || '.',
           en.author_departed_at
      FROM public.encounters en
     WHERE en.practice_id = _practice_id AND en.author_departed_at IS NOT NULL AND en.disposition IS NULL
       AND public.may_resolve_departed_work(_practice_id, en.patient_user_id)

    UNION ALL
    SELECT 'dictation', d.id, d.patient_user_id, d.clinician_user_id,
           CASE WHEN d.clinician_user_id IN (SELECT user_id FROM departed)
                THEN 'Unfiled dictation — author departed. Recorded '
                ELSE 'Unfiled dictation — author moved to a non-clinical role. Recorded ' END
             || to_char(d.created_at, 'DD Mon YYYY') || '.',
           d.author_departed_at
      FROM public.clinician_dictations d
     WHERE d.practice_id = _practice_id AND d.author_departed_at IS NOT NULL AND d.disposition IS NULL
       AND public.may_resolve_departed_work(_practice_id, d.patient_user_id)

    UNION ALL
    SELECT 'task', t.id, t.patient_user_id, t.assignee_user_id,
           'Open task: ' || t.title,
           t.created_at
      FROM public.practice_tasks t
     WHERE _manager
       AND t.practice_id = _practice_id
       AND t.status IN ('open', 'in_progress', 'snoozed')
       AND t.assignee_user_id IN (SELECT user_id FROM departed)

    UNION ALL
    SELECT 'appointment', ap.id, ap.patient_user_id, ap.clinician_user_id,
           'Booked for ' || to_char(ap.start_time, 'DD Mon YYYY HH24:MI') || ' with someone who has left.',
           ap.start_time
      FROM public.fhir_appointments ap
     WHERE _manager
       AND ap.practice_id = _practice_id
       AND ap.start_time > now()
       AND ap.status IN ('proposed', 'pending', 'booked', 'waitlist')
       AND ap.clinician_user_id IN (SELECT user_id FROM departed)

    UNION ALL
    SELECT 'proposal', r.id, r.patient_user_id, r.proposed_by_user_id,
           CASE WHEN r.proposed_by_user_id IN (SELECT user_id FROM departed)
                THEN 'Medication proposal still waiting for the patient, from someone who has left.'
                ELSE 'Medication proposal still waiting for the patient, from someone no longer in a clinical role here.' END,
           r.created_at
      FROM public.record_change_proposals r
     WHERE _manager
       AND r.practice_id = _practice_id
       AND r.status = 'pending'
       AND NOT public.member_is_active_clinician(_practice_id, r.proposed_by_user_id)
  )
  SELECT i.kind, i.item_id, i.patient_user_id,
         (SELECT COALESCE(nullif(btrim(p.name), ''), p.email) FROM public.profiles p WHERE p.user_id = i.patient_user_id),
         i.departed_user_id, public.notice_person_name(i.departed_user_id),
         i.detail, i.since
    FROM items i
   WHERE _manager
      OR i.kind IN ('draft', 'dictation')
      OR (i.kind = 'patient' AND (
            NOT EXISTS (SELECT 1 FROM public.practice_patient_departments ppd
                         WHERE ppd.practice_id = _practice_id AND ppd.patient_user_id = i.patient_user_id
                           AND ppd.effective_to IS NULL)
            OR EXISTS (SELECT 1 FROM public.practice_patient_departments ppd
                        WHERE ppd.practice_id = _practice_id AND ppd.patient_user_id = i.patient_user_id
                          AND ppd.effective_to IS NULL
                          AND ppd.department_id = ANY (public.led_department_ids()))))
   ORDER BY CASE i.kind WHEN 'patient' THEN 0 WHEN 'draft' THEN 1 WHEN 'dictation' THEN 2 ELSE 3 END,
            i.since;
END;
$$;

REVOKE ALL ON FUNCTION public.practice_handover_queue(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.practice_handover_queue(uuid) TO authenticated;
