-- When someone leaves a hospital: the hospital keeps its record and its
-- conversations, the open work lands with someone, the leaver keeps nothing of
-- it, and the patient is told who has taken over.
--
-- These are the founder's decisions on docs/plans/clinician-offboarding.md §7,
-- and they follow from docs/sharing-access-consent-model.md: the patient holds
-- the power (P1), nothing is deleted (P2), hidden is not deleted (P3), and
-- there is no break-glass (P4). On pathway B the patient's relationship is with
-- the institution, and a clinician's access derives from being assigned there.
-- So a person who leaves loses the institution's patients entirely, including
-- what they wrote about them; any legal need for those records goes through
-- the hospital, which keeps them. The clinician's own patients (pathway A) are
-- untouched.
--
-- What was wrong, checked on a replayed database:
--
--   * A leaver kept reading every hospital note, addendum, internal note,
--     dictation, managed record, task, appointment and proposal they had
--     authored or been given. 20261010000000 and 20261010030000 kept the
--     author's read deliberately; the decision is now the other way for
--     hospital records.
--   * Most of those rows could not say which context they were written in.
--     encounters.practice_id was only set if the client passed it, which the
--     app does not; internal_notes, clinician_dictations, messages and
--     record_change_proposals had no practice at all. Without it, "the
--     hospital's record" could not be told apart from the clinician's own.
--   * An unsigned draft or unfiled dictation left behind was editable by
--     nobody, visible to nobody at the hospital, and signed by nobody.
--   * The hospital could never read the messages its patients had exchanged
--     with one of its clinicians, so after a departure the patient wrote into a
--     thread nobody read (plan G2).
--   * Ending a membership showed the admin nothing of what it would leave
--     behind, the open work went nowhere, and the patient was never told.
--   * The last-owner refusal was correct but its words told an owner nothing
--     about what to do next.
--
-- The fix:
--
--   1. Context, stamped by the server. practice_id is added to internal_notes,
--      clinician_dictations, messages and record_change_proposals, and a
--      BEFORE INSERT trigger fills it on those and on encounters from the
--      author's standing at the moment of writing: a live private share with
--      the patient means private (NULL); otherwise the practice through which
--      the author has clinical access. A client-supplied practice must be one
--      the author is an active member of. A client can never change it after.
--      Existing rows are back-filled only where there is exactly one answer.
--   2. The author reads a hospital row only while an active member there
--      (clinical member for clinical content; any member for the managed
--      records front desk files). Tasks, appointments and proposals likewise.
--   3. Leaving freezes the author's unsigned drafts and unfiled dictations in
--      that practice. Frozen means no client may change them, including their
--      author if they return. Each is routed to the practice's owners and
--      admins and to the lead of any department the patient sits in, through
--      the clinician_guidance_notifications inbox (type departed_author_drafts).
--      One of those people decides, through resolve_departed_draft: sign it off
--      (an addendum under their own name; the note stays the author's), mark it
--      entered in error, or archive it. Nothing is deleted, and no deletion is
--      built: that waits for a retention policy.
--   4. offboarding_impact() previews what ending a membership leaves behind.
--      practice_handover_queue() is the needs-cover list the Coverage tab shows:
--      patients left with nobody, open tasks, future appointments and pending
--      proposals of people who have left, and frozen drafts. Flagged, not
--      cancelled. A manager may withdraw a departed member's proposal.
--   5. A hospital thread belongs to the hospital. Once its clinician has left,
--      the patient's currently assigned or view-all clinical staff read it and
--      carry on. Private-share threads are unchanged.
--   6. When a patient whose clinician left is assigned someone new, they are
--      told once, in a new patient_notices table, naming who has taken over.
--      Not at departure: a patient should not learn of staff changes that do
--      not change their care.
--   7. leave_practice and end_practice_membership tell the only owner to make
--      a co-owner first.
--
-- Deliberately not here: provider_shares gates and snapshot links (other
-- work), deletion of anything, account closure, and freezing on a move to a
-- non-clinical role (only departure freezes).

-- ---------------------------------------------------------------------------
-- 0. Context columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.internal_notes
  ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES public.practices(id) ON DELETE SET NULL;
ALTER TABLE public.clinician_dictations
  ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES public.practices(id) ON DELETE SET NULL;
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES public.practices(id) ON DELETE SET NULL;
ALTER TABLE public.record_change_proposals
  ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES public.practices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_internal_notes_practice ON public.internal_notes (practice_id) WHERE practice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clinician_dictations_practice ON public.clinician_dictations (practice_id) WHERE practice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_practice_patient ON public.messages (practice_id, patient_user_id) WHERE practice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rcp_practice ON public.record_change_proposals (practice_id) WHERE practice_id IS NOT NULL;

COMMENT ON COLUMN public.internal_notes.practice_id IS
  'The practice this note was written for, set by the server at insert (stamp_record_context). NULL: the author''s own practice. Not client-writable.';
COMMENT ON COLUMN public.clinician_dictations.practice_id IS
  'The practice this dictation was made for, set by the server at insert. NULL: the author''s own practice, or no patient chosen yet.';
COMMENT ON COLUMN public.messages.practice_id IS
  'The practice whose thread this is, set by the server at insert (stamp_message_context). NULL: a private-share thread.';
COMMENT ON COLUMN public.record_change_proposals.practice_id IS
  'The practice this proposal was made through, set by the server at insert. NULL: a private share.';

-- The freeze, on the two kinds of unfinished work.
ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS author_departed_at timestamptz,
  ADD COLUMN IF NOT EXISTS disposition text,
  ADD COLUMN IF NOT EXISTS disposition_by uuid,
  ADD COLUMN IF NOT EXISTS disposition_at timestamptz,
  ADD COLUMN IF NOT EXISTS disposition_note text;
ALTER TABLE public.clinician_dictations
  ADD COLUMN IF NOT EXISTS author_departed_at timestamptz,
  ADD COLUMN IF NOT EXISTS disposition text,
  ADD COLUMN IF NOT EXISTS disposition_by uuid,
  ADD COLUMN IF NOT EXISTS disposition_at timestamptz,
  ADD COLUMN IF NOT EXISTS disposition_note text;

ALTER TABLE public.encounters DROP CONSTRAINT IF EXISTS encounters_disposition_check;
ALTER TABLE public.encounters ADD CONSTRAINT encounters_disposition_check
  CHECK (disposition IS NULL OR (disposition IN ('cosigned', 'entered_in_error', 'archived') AND author_departed_at IS NOT NULL));
ALTER TABLE public.clinician_dictations DROP CONSTRAINT IF EXISTS clinician_dictations_disposition_check;
ALTER TABLE public.clinician_dictations ADD CONSTRAINT clinician_dictations_disposition_check
  CHECK (disposition IS NULL OR (disposition IN ('cosigned', 'entered_in_error', 'archived') AND author_departed_at IS NOT NULL));

COMMENT ON COLUMN public.encounters.author_departed_at IS
  'Set when the author left the practice with this note unsigned. From then no client may change it; a lead resolves it through resolve_departed_draft. Shown as "unsigned — author departed".';
COMMENT ON COLUMN public.encounters.disposition IS
  'How a departed author''s draft was resolved: cosigned (signed off by disposition_by, with an addendum; authorship unchanged), entered_in_error, or archived. Never deleted.';
COMMENT ON COLUMN public.clinician_dictations.author_departed_at IS
  'Set when the author left the practice with this dictation unfiled. Frozen from then; resolved through resolve_departed_draft.';
COMMENT ON COLUMN public.clinician_dictations.disposition IS
  'How a departed author''s dictation was resolved: cosigned (written up as a draft note under disposition_by''s own name), entered_in_error, or archived.';

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------

/** The caller is an active clinical member of this practice. */
CREATE OR REPLACE FUNCTION public.is_clinical_practice_member(_practice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN auth.uid() IS NULL OR _practice_id IS NULL THEN false ELSE EXISTS (
    SELECT 1 FROM public.practice_members pm
     WHERE pm.practice_id = _practice_id
       AND pm.user_id = auth.uid()
       AND pm.status = 'active'
       AND public.practice_role_is_clinical(pm.role)
  ) END;
$$;

REVOKE ALL ON FUNCTION public.is_clinical_practice_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_clinical_practice_member(uuid) TO authenticated;

/** A named person is still an active clinical member of this practice. */
CREATE OR REPLACE FUNCTION public.member_is_active_clinician(_practice_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.practice_members pm
     WHERE pm.practice_id = _practice_id
       AND pm.user_id = _user_id
       AND pm.status = 'active'
       AND public.practice_role_is_clinical(pm.role)
  );
$$;

REVOKE ALL ON FUNCTION public.member_is_active_clinician(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_is_active_clinician(uuid, uuid) TO authenticated;

/**
 * The caller's clinical access to this patient through this one practice:
 * institution_has_clinical_access narrowed to a practice. The patient's share
 * must be live and unsuspended now (P4: no break-glass).
 */
CREATE OR REPLACE FUNCTION public.practice_clinical_access(_practice_id uuid, _patient_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN auth.uid() IS NULL OR _practice_id IS NULL OR _patient_user_id IS NULL THEN false ELSE EXISTS (
    SELECT 1
      FROM public.practice_shares ps
      JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
     WHERE ps.practice_id = _practice_id
       AND ps.user_id = _patient_user_id
       AND ps.is_active = true
       AND ps.practice_suspended_at IS NULL
       AND pm.user_id = auth.uid()
       AND pm.status = 'active'
       AND public.practice_role_is_clinical(pm.role)
       AND (pm.can_view_all_patients
            OR public.is_assigned_to_patient_in_practice(auth.uid(), _patient_user_id, _practice_id))
  ) END;
$$;

REVOKE ALL ON FUNCTION public.practice_clinical_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.practice_clinical_access(uuid, uuid) TO authenticated;

/**
 * Who answers for what a departed author left about this patient: the
 * practice's owners and admins, and the lead of any department the patient
 * currently sits in. Only while the patient still shares with the practice;
 * after they disconnect nobody there reads it (P4).
 */
CREATE OR REPLACE FUNCTION public.may_resolve_departed_work(_practice_id uuid, _patient_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN auth.uid() IS NULL OR _practice_id IS NULL OR _patient_user_id IS NULL THEN false ELSE
    EXISTS (
      SELECT 1 FROM public.practice_shares ps
       WHERE ps.practice_id = _practice_id
         AND ps.user_id = _patient_user_id
         AND ps.is_active = true
         AND ps.practice_suspended_at IS NULL
    )
    AND public.is_clinical_practice_member(_practice_id)
    AND (
      public.can_manage_practice(_practice_id)
      OR EXISTS (
        SELECT 1
          FROM public.practice_patient_departments ppd
          JOIN public.practice_department_members pdm
            ON pdm.department_id = ppd.department_id AND pdm.is_lead
         WHERE ppd.practice_id = _practice_id
           AND ppd.patient_user_id = _patient_user_id
           AND ppd.effective_to IS NULL
           AND pdm.user_id = auth.uid()
      )
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.may_resolve_departed_work(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.may_resolve_departed_work(uuid, uuid) TO authenticated;

/** "Dr Ada Lovelace", else the profile name, else a neutral word. For notices. */
CREATE OR REPLACE FUNCTION public.notice_person_name(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT nullif(btrim(concat_ws(' ', nullif(btrim(cp.title), ''), nullif(btrim(cp.first_name), ''),
                                   nullif(btrim(cp.last_name), ''))), '')
       FROM public.clinician_profiles cp WHERE cp.user_id = _user_id
      LIMIT 1),
    (SELECT nullif(btrim(p.name), '') FROM public.profiles p WHERE p.user_id = _user_id LIMIT 1),
    'A colleague'
  );
$$;

REVOKE ALL ON FUNCTION public.notice_person_name(uuid) FROM PUBLIC, anon, authenticated;

/**
 * The practice a row written now by this author about this patient belongs to,
 * or NULL for the author's own practice.
 *
 * A live private share wins: the patient invited this person themselves, and
 * pathway A is never folded into an institution. Otherwise the practice through
 * which the author has clinical access now, preferring one where they are
 * assigned, then the longest-standing membership, so the answer is stable.
 *
 * Callable by the signed-in author only (or server-side), so it cannot be used
 * to ask where somebody else works or whom they treat.
 */
CREATE OR REPLACE FUNCTION public.record_context_practice(_author uuid, _patient uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _author IS NULL OR _patient IS NULL THEN NULL
    WHEN auth.uid() IS NOT NULL AND auth.uid() <> _author THEN NULL
    WHEN public.clinician_still_reaches_patient(_author, _patient) THEN NULL
    ELSE (
      SELECT ps.practice_id
        FROM public.practice_shares ps
        JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
       WHERE ps.user_id = _patient
         AND ps.is_active = true
         AND ps.practice_suspended_at IS NULL
         AND pm.user_id = _author
         AND pm.status = 'active'
         AND public.practice_role_is_clinical(pm.role)
       ORDER BY public.is_assigned_to_patient_in_practice(_author, _patient, ps.practice_id) DESC,
                pm.created_at, ps.practice_id
       LIMIT 1
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.record_context_practice(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_context_practice(uuid, uuid) TO authenticated;

/** Whether the signed-in author may file a record under this practice. */
CREATE OR REPLACE FUNCTION public.author_may_file_under(_practice_id uuid, _author uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (auth.uid() IS NULL OR auth.uid() = _author)
     AND EXISTS (
       SELECT 1 FROM public.practice_members pm
        WHERE pm.practice_id = _practice_id AND pm.user_id = _author AND pm.status = 'active'
     );
$$;

REVOKE ALL ON FUNCTION public.author_may_file_under(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.author_may_file_under(uuid, uuid) TO authenticated;

/**
 * Which practice a new message in the thread (patient, clinician) belongs to.
 * A thread is keyed by that pair. Its messages belong to:
 *   1. nobody but the two of them while that clinician holds a live private
 *      share with the patient — private-share threads stay private;
 *   2. otherwise the practice the thread already belongs to, so a patient
 *      writing after their clinician left stays in the hospital's thread;
 *   3. otherwise the practice through which that clinician reaches the patient.
 * Only the two parties (or the server) may ask.
 */
CREATE OR REPLACE FUNCTION public.message_thread_practice(_patient uuid, _clinician uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _patient IS NULL OR _clinician IS NULL THEN NULL
    WHEN auth.uid() IS NOT NULL AND auth.uid() NOT IN (_patient, _clinician) THEN NULL
    WHEN public.clinician_still_reaches_patient(_clinician, _patient) THEN NULL
    ELSE COALESCE(
      (SELECT m.practice_id FROM public.messages m
        WHERE m.patient_user_id = _patient
          AND m.clinician_user_id = _clinician
          AND m.practice_id IS NOT NULL
        ORDER BY m.created_at DESC
        LIMIT 1),
      (SELECT ps.practice_id
         FROM public.practice_shares ps
         JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
        WHERE ps.user_id = _patient
          AND ps.is_active = true
          AND ps.practice_suspended_at IS NULL
          AND pm.user_id = _clinician
          AND pm.status = 'active'
          AND public.practice_role_is_clinical(pm.role)
        ORDER BY public.is_assigned_to_patient_in_practice(_clinician, _patient, ps.practice_id) DESC,
                 pm.created_at, ps.practice_id
        LIMIT 1)
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.message_thread_practice(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.message_thread_practice(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Stamping the context
-- ---------------------------------------------------------------------------
-- Not SECURITY DEFINER, on purpose: current_user then says whether the write
-- came from a client or from one of the definer functions below, as in
-- guard_practice_member_standing. The lookups it needs are definer helpers.
CREATE OR REPLACE FUNCTION public.stamp_record_context()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _row     jsonb := to_jsonb(NEW);
  _author  uuid;
  _patient uuid := (_row ->> 'patient_user_id')::uuid;
  _given   uuid := (_row ->> 'practice_id')::uuid;
  _client  boolean := current_user IN ('authenticated', 'anon');
  _patch   jsonb := '{}'::jsonb;
BEGIN
  _author := CASE TG_TABLE_NAME
    WHEN 'internal_notes'          THEN (_row ->> 'author_user_id')::uuid
    WHEN 'record_change_proposals' THEN (_row ->> 'proposed_by_user_id')::uuid
    ELSE (_row ->> 'clinician_user_id')::uuid
  END;

  IF TG_OP = 'UPDATE' THEN
    -- Moving a row between contexts would move it between readers.
    IF _client AND _given IS DISTINCT FROM (to_jsonb(OLD) ->> 'practice_id')::uuid THEN
      RAISE EXCEPTION 'Which practice a record belongs to is set when it is written and cannot be changed'
        USING ERRCODE = '42501';
    END IF;
    -- A dictation often gets its patient after it is recorded.
    IF TG_TABLE_NAME = 'clinician_dictations'
       AND OLD.patient_user_id IS NULL AND NEW.patient_user_id IS NOT NULL
       AND NEW.practice_id IS NULL THEN
      NEW.practice_id := public.record_context_practice(_author, _patient);
    END IF;
    RETURN NEW;
  END IF;

  IF _given IS NOT NULL THEN
    -- A client may say which workspace it wrote in, but only one the author
    -- belongs to; otherwise a note could be pushed into another hospital's view.
    IF _client AND NOT public.author_may_file_under(_given, _author) THEN
      RAISE EXCEPTION 'You can only file this under a practice you work at'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    _patch := jsonb_build_object('practice_id', public.record_context_practice(_author, _patient));
  END IF;

  -- Only a departure freezes a record, and only resolve_departed_draft
  -- resolves one.
  IF _client AND TG_TABLE_NAME IN ('encounters', 'clinician_dictations') THEN
    _patch := _patch || jsonb_build_object(
      'author_departed_at', NULL, 'disposition', NULL, 'disposition_by', NULL,
      'disposition_at', NULL, 'disposition_note', NULL);
  END IF;

  IF _patch <> '{}'::jsonb THEN
    NEW := jsonb_populate_record(NEW, _patch);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_record_context() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_stamp_record_context ON public.encounters;
CREATE TRIGGER trg_stamp_record_context BEFORE INSERT OR UPDATE ON public.encounters
  FOR EACH ROW EXECUTE FUNCTION public.stamp_record_context();
DROP TRIGGER IF EXISTS trg_stamp_record_context ON public.internal_notes;
CREATE TRIGGER trg_stamp_record_context BEFORE INSERT OR UPDATE ON public.internal_notes
  FOR EACH ROW EXECUTE FUNCTION public.stamp_record_context();
DROP TRIGGER IF EXISTS trg_stamp_record_context ON public.clinician_dictations;
CREATE TRIGGER trg_stamp_record_context BEFORE INSERT OR UPDATE ON public.clinician_dictations
  FOR EACH ROW EXECUTE FUNCTION public.stamp_record_context();
DROP TRIGGER IF EXISTS trg_stamp_record_context ON public.record_change_proposals;
CREATE TRIGGER trg_stamp_record_context BEFORE INSERT OR UPDATE ON public.record_change_proposals
  FOR EACH ROW EXECUTE FUNCTION public.stamp_record_context();

/**
 * A client never chooses which thread a message belongs to: for a signed-in
 * caller it is always derived (message_thread_practice), and never changed
 * afterwards. Invoker rights for the same reason as stamp_record_context.
 */
CREATE OR REPLACE FUNCTION public.stamp_message_context()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF current_user IN ('authenticated', 'anon') THEN
      NEW.practice_id := OLD.practice_id;
    END IF;
    RETURN NEW;
  END IF;

  IF current_user NOT IN ('authenticated', 'anon') AND NEW.practice_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  NEW.practice_id := public.message_thread_practice(NEW.patient_user_id, NEW.clinician_user_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_message_context() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_stamp_message_context ON public.messages;
CREATE TRIGGER trg_stamp_message_context BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.stamp_message_context();

-- ---------------------------------------------------------------------------
-- 3. Back-fill, only where there is one answer
-- ---------------------------------------------------------------------------
-- A row is the hospital's when its author never had a private share with the
-- patient (active or not) and there is exactly one practice the author has
-- ever belonged to that the patient has ever shared with. Anything else stays
-- NULL, which keeps today's reading of it. The updated_at triggers are held
-- off: a back-fill is not an edit of the note.

DROP TABLE IF EXISTS pg_temp._ctx_candidates;
CREATE TEMP TABLE _ctx_candidates AS
WITH pairs AS (
  SELECT DISTINCT pm.user_id AS author, ps.user_id AS patient, ps.practice_id
    FROM public.practice_members pm
    JOIN public.practice_shares ps ON ps.practice_id = pm.practice_id
), single AS (
  SELECT author, patient, min(practice_id::text)::uuid AS practice_id
    FROM pairs
   GROUP BY author, patient
  HAVING count(*) = 1
)
SELECT s.author, s.patient, s.practice_id
  FROM single s
 WHERE NOT EXISTS (
   SELECT 1
     FROM public.provider_shares prs
     LEFT JOIN auth.users u ON u.id = s.author
    WHERE prs.user_id = s.patient
      AND (prs.clinician_user_id = s.author
           OR (u.email IS NOT NULL AND lower(prs.provider_email) = lower(u.email)))
 );

ALTER TABLE public.encounters DISABLE TRIGGER encounters_updated_at;
ALTER TABLE public.encounters DISABLE TRIGGER trg_protect_signed_encounter;
UPDATE public.encounters e SET practice_id = c.practice_id
  FROM _ctx_candidates c
 WHERE e.practice_id IS NULL AND e.clinician_user_id = c.author AND e.patient_user_id = c.patient;
ALTER TABLE public.encounters ENABLE TRIGGER trg_protect_signed_encounter;
ALTER TABLE public.encounters ENABLE TRIGGER encounters_updated_at;

ALTER TABLE public.internal_notes DISABLE TRIGGER trg_internal_notes_updated;
UPDATE public.internal_notes n SET practice_id = c.practice_id
  FROM _ctx_candidates c
 WHERE n.practice_id IS NULL AND n.author_user_id = c.author AND n.patient_user_id = c.patient;
ALTER TABLE public.internal_notes ENABLE TRIGGER trg_internal_notes_updated;

ALTER TABLE public.clinician_dictations DISABLE TRIGGER trg_clinician_dictations_updated;
UPDATE public.clinician_dictations d SET practice_id = c.practice_id
  FROM _ctx_candidates c
 WHERE d.practice_id IS NULL AND d.clinician_user_id = c.author AND d.patient_user_id = c.patient;
ALTER TABLE public.clinician_dictations ENABLE TRIGGER trg_clinician_dictations_updated;

UPDATE public.messages m SET practice_id = c.practice_id
  FROM _ctx_candidates c
 WHERE m.practice_id IS NULL AND m.clinician_user_id = c.author AND m.patient_user_id = c.patient;

UPDATE public.record_change_proposals r SET practice_id = c.practice_id
  FROM _ctx_candidates c
 WHERE r.practice_id IS NULL AND r.proposed_by_user_id = c.author AND r.patient_user_id = c.patient;

DROP TABLE _ctx_candidates;

-- ---------------------------------------------------------------------------
-- 4. The author reads a hospital row only while they work there (decision 1)
-- ---------------------------------------------------------------------------

-- Managed records: front desk files these, so any active membership counts.
DROP POLICY IF EXISTS "Clinicians can view their own patient records" ON public.clinician_patient_records;
CREATE POLICY "Clinicians can view their own patient records"
  ON public.clinician_patient_records
  FOR SELECT TO authenticated
  USING (
    auth.uid() = clinician_user_id
    AND (practice_id IS NULL OR public.is_practice_member(practice_id))
  );

DROP POLICY IF EXISTS "Clinicians read encounters for their patients" ON public.encounters;
CREATE POLICY "Clinicians read encounters for their patients"
ON public.encounters FOR SELECT TO authenticated
USING (
  (clinician_user_id = auth.uid()
   AND (practice_id IS NULL OR public.is_clinical_practice_member(practice_id)))
  OR public.clinician_has_patient_access(patient_user_id)
  OR public.institution_has_clinical_access(patient_user_id)
);

-- The people who must decide about a departed author's draft have to be able
-- to read it, whether or not they are on the patient's care.
DROP POLICY IF EXISTS "Leads read drafts their authors left behind" ON public.encounters;
CREATE POLICY "Leads read drafts their authors left behind"
ON public.encounters FOR SELECT TO authenticated
USING (
  author_departed_at IS NOT NULL
  AND practice_id IS NOT NULL
  AND public.may_resolve_departed_work(practice_id, patient_user_id)
);

DROP POLICY IF EXISTS "Read addenda of a readable note" ON public.encounter_addenda;
CREATE POLICY "Read addenda of a readable note"
ON public.encounter_addenda FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.encounters e
     WHERE e.id = encounter_addenda.encounter_id
       AND ((e.clinician_user_id = auth.uid()
             AND (e.practice_id IS NULL OR public.is_clinical_practice_member(e.practice_id)))
            OR public.clinician_has_patient_access(e.patient_user_id)
            OR public.institution_has_clinical_access(e.patient_user_id)
            OR (e.author_departed_at IS NOT NULL AND e.practice_id IS NOT NULL
                AND public.may_resolve_departed_work(e.practice_id, e.patient_user_id)))
  )
);

-- A frozen unsigned draft takes no addenda from anyone; the sign-off addendum
-- is written by resolve_departed_draft.
DROP POLICY IF EXISTS "Clinicians add addenda to notes they can reach" ON public.encounter_addenda;
CREATE POLICY "Clinicians add addenda to notes they can reach"
ON public.encounter_addenda FOR INSERT TO authenticated
WITH CHECK (
  author_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
      FROM public.encounters e
     WHERE e.id = encounter_addenda.encounter_id
       AND (e.author_departed_at IS NULL OR e.signed_at IS NOT NULL)
       AND public.has_current_clinical_access(e.patient_user_id, e.practice_id)
  )
);

DROP POLICY IF EXISTS "Clinicians read internal notes for accessible patients" ON public.internal_notes;
CREATE POLICY "Clinicians read internal notes for accessible patients"
ON public.internal_notes FOR SELECT TO authenticated
USING (
  (author_user_id = auth.uid()
   AND (practice_id IS NULL OR public.is_clinical_practice_member(practice_id)))
  OR (visibility = 'team'
      AND (public.clinician_has_patient_access(patient_user_id)
           OR public.institution_has_clinical_access(patient_user_id)))
);

DROP POLICY IF EXISTS "Authors update their internal notes" ON public.internal_notes;
CREATE POLICY "Authors update their internal notes"
ON public.internal_notes FOR UPDATE TO authenticated
USING (
  auth.uid() = author_user_id
  AND (practice_id IS NULL OR public.is_clinical_practice_member(practice_id))
  AND (visibility <> 'team' OR public.has_current_clinical_access(patient_user_id, practice_id))
)
WITH CHECK (
  auth.uid() = author_user_id
  AND (practice_id IS NULL OR public.is_clinical_practice_member(practice_id))
  AND (visibility <> 'team' OR public.has_current_clinical_access(patient_user_id, practice_id))
);

DROP POLICY IF EXISTS "Authors delete their internal notes" ON public.internal_notes;
CREATE POLICY "Authors delete their internal notes"
ON public.internal_notes FOR DELETE TO authenticated
USING (
  auth.uid() = author_user_id
  AND (practice_id IS NULL OR public.is_clinical_practice_member(practice_id))
  AND (visibility <> 'team' OR public.has_current_clinical_access(patient_user_id, practice_id))
);

DROP POLICY IF EXISTS "Clinicians view own dictations" ON public.clinician_dictations;
CREATE POLICY "Clinicians view own dictations"
ON public.clinician_dictations FOR SELECT TO authenticated
USING (
  auth.uid() = clinician_user_id
  AND (practice_id IS NULL OR public.is_clinical_practice_member(practice_id))
);

DROP POLICY IF EXISTS "Leads read dictations their authors left behind" ON public.clinician_dictations;
CREATE POLICY "Leads read dictations their authors left behind"
ON public.clinician_dictations FOR SELECT TO authenticated
USING (
  author_departed_at IS NOT NULL
  AND practice_id IS NOT NULL
  AND public.may_resolve_departed_work(practice_id, patient_user_id)
);

DROP POLICY IF EXISTS "Clinicians update own dictations" ON public.clinician_dictations;
CREATE POLICY "Clinicians update own dictations"
ON public.clinician_dictations FOR UPDATE TO authenticated
USING (
  auth.uid() = clinician_user_id
  AND author_departed_at IS NULL
  AND (practice_id IS NULL OR public.is_clinical_practice_member(practice_id))
)
WITH CHECK (
  auth.uid() = clinician_user_id
  AND (practice_id IS NULL OR public.is_clinical_practice_member(practice_id))
);

DROP POLICY IF EXISTS "Clinicians delete own unfiled dictations" ON public.clinician_dictations;
CREATE POLICY "Clinicians delete own unfiled dictations"
ON public.clinician_dictations FOR DELETE TO authenticated
USING (
  auth.uid() = clinician_user_id
  AND status <> 'filed'
  AND filed_at IS NULL
  AND summary_approved_at IS NULL
  AND author_departed_at IS NULL
  AND (practice_id IS NULL OR public.is_clinical_practice_member(practice_id))
);

-- The dictation's audio. The bucket policies asked only whether the file is in
-- the caller's own folder, so a leaver could still play, and delete, the
-- recording behind a hospital dictation. Now a recording whose dictation
-- belongs to a practice is reachable only by an active clinical member there,
-- and cannot be deleted by anyone once its dictation is frozen. A definer
-- helper, because the caller's own row policies would hide exactly the rows
-- that should refuse them. Narrowed to authenticated: anon never had a folder.
CREATE OR REPLACE FUNCTION public.dictation_audio_blocked(_path text, _for_delete boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinician_dictations d
     WHERE d.audio_path = _path
       AND ((d.practice_id IS NOT NULL AND NOT public.is_clinical_practice_member(d.practice_id))
            OR (_for_delete AND d.author_departed_at IS NOT NULL))
  );
$$;

REVOKE ALL ON FUNCTION public.dictation_audio_blocked(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dictation_audio_blocked(text, boolean) TO authenticated;

DROP POLICY IF EXISTS "Clinician dictations owner read" ON storage.objects;
CREATE POLICY "Clinician dictations owner read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'clinician-dictations'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND NOT public.dictation_audio_blocked(name, false)
);

DROP POLICY IF EXISTS "Clinician dictations owner delete" ON storage.objects;
CREATE POLICY "Clinician dictations owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'clinician-dictations'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND NOT public.dictation_audio_blocked(name, true)
);

-- Proposals: the proposer reads a hospital proposal only while a clinician there.
DROP POLICY IF EXISTS "Both sides read a proposal" ON public.record_change_proposals;
CREATE POLICY "Both sides read a proposal"
ON public.record_change_proposals FOR SELECT TO authenticated
USING (
  patient_user_id = auth.uid()
  OR (proposed_by_user_id = auth.uid()
      AND (practice_id IS NULL OR public.is_clinical_practice_member(practice_id)))
);

-- Tasks and appointments: the hospital's operational data. The personal arms
-- hold only while the person works there; managers keep theirs.
DROP POLICY IF EXISTS "Creator can view tasks they created" ON public.practice_tasks;
CREATE POLICY "Creator can view tasks they created"
ON public.practice_tasks FOR SELECT TO authenticated
USING (created_by = auth.uid() AND (practice_id IS NULL OR public.is_practice_member(practice_id)));

DROP POLICY IF EXISTS "Assignee can view own tasks" ON public.practice_tasks;
CREATE POLICY "Assignee can view own tasks"
ON public.practice_tasks FOR SELECT TO authenticated
USING (assignee_user_id = auth.uid() AND (practice_id IS NULL OR public.is_practice_member(practice_id)));

DROP POLICY IF EXISTS "Assignee or creator can update tasks" ON public.practice_tasks;
CREATE POLICY "Assignee or creator can update tasks"
ON public.practice_tasks FOR UPDATE TO authenticated
USING (
  ((assignee_user_id = auth.uid() OR created_by = auth.uid())
   AND (practice_id IS NULL OR public.is_practice_member(practice_id)))
  OR (practice_id IS NOT NULL AND public.can_manage_practice(practice_id))
)
WITH CHECK (
  ((assignee_user_id = auth.uid() OR created_by = auth.uid())
   AND (practice_id IS NULL OR public.is_practice_member(practice_id)))
  OR (practice_id IS NOT NULL AND public.can_manage_practice(practice_id))
);

DROP POLICY IF EXISTS "Clinicians read appointments for their patients" ON public.fhir_appointments;
CREATE POLICY "Clinicians read appointments for their patients"
ON public.fhir_appointments FOR SELECT TO authenticated
USING (
  (clinician_user_id = auth.uid()
   AND (practice_id IS NULL OR public.is_practice_member(practice_id)))
  OR public.clinician_has_patient_access(patient_user_id)
  OR public.institution_has_patient_access(patient_user_id)
);

-- ---------------------------------------------------------------------------
-- 5. Hospital threads (decision 5)
-- ---------------------------------------------------------------------------
-- A private-share thread, or one whose context could not be established, is
-- read as before. A hospital thread is read by its own clinician while they
-- have clinical access there, and, once that clinician has left or stopped
-- being clinical, by the patient's assigned or view-all clinical staff. Not
-- before: while a clinician works there the conversation is theirs.
DROP POLICY IF EXISTS "Clinicians can read message history they took part in" ON public.messages;
CREATE POLICY "Clinicians can read message history they took part in"
ON public.messages FOR SELECT TO authenticated
USING (
  auth.uid() = clinician_user_id
  AND practice_id IS NULL
  AND (public.clinician_had_patient_access_at(patient_user_id, created_at)
       OR public.institution_has_patient_access(patient_user_id))
);

DROP POLICY IF EXISTS "The practice's clinicians read its threads" ON public.messages;
CREATE POLICY "The practice's clinicians read its threads"
ON public.messages FOR SELECT TO authenticated
USING (
  practice_id IS NOT NULL
  AND public.practice_clinical_access(practice_id, patient_user_id)
  AND (clinician_user_id = auth.uid()
       OR NOT public.member_is_active_clinician(practice_id, clinician_user_id))
);

/**
 * A clinician covering a departed colleague's hospital thread marks the
 * patient's messages in it read. A function rather than an UPDATE policy: the
 * table grants UPDATE on every column, and a policy would let the covering
 * clinician rewrite the patient's words.
 */
CREATE OR REPLACE FUNCTION public.mark_practice_thread_read(_patient_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;

  UPDATE public.messages m
     SET read_at = now()
   WHERE m.patient_user_id = _patient_user_id
     AND m.sender_user_id = _patient_user_id
     AND m.read_at IS NULL
     AND m.practice_id IS NOT NULL
     AND m.clinician_user_id <> auth.uid()
     AND public.practice_clinical_access(m.practice_id, _patient_user_id)
     AND NOT public.member_is_active_clinician(m.practice_id, m.clinician_user_id);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_practice_thread_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_practice_thread_read(uuid) TO authenticated;

-- The clinician's inbox also lists the hospital threads they have inherited.
-- Still SECURITY INVOKER: the row policies decide what is countable.
CREATE OR REPLACE FUNCTION public.my_message_threads(_role text)
 RETURNS TABLE(counterparty_id uuid, last_body text, last_at timestamp with time zone, last_sender_user_id uuid, last_has_attachment boolean, unread integer, total integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  WITH mine AS (
    SELECT m.*,
           CASE WHEN _role = 'patient' THEN m.clinician_user_id ELSE m.patient_user_id END AS other_id
      FROM public.messages m
     WHERE auth.uid() IS NOT NULL
       AND CASE WHEN _role = 'patient'
                THEN m.patient_user_id = auth.uid()
                ELSE (m.clinician_user_id = auth.uid() OR m.practice_id IS NOT NULL)
           END
  ),
  ranked AS (
    SELECT mine.*,
           row_number() OVER (PARTITION BY other_id ORDER BY created_at DESC) AS rn
      FROM mine
  )
  SELECT r.other_id,
         r.body,
         r.created_at,
         r.sender_user_id,
         r.attachment_path IS NOT NULL,
         (SELECT count(*)::integer FROM mine u
           WHERE u.other_id = r.other_id
             AND u.sender_user_id <> auth.uid()
             AND (_role = 'patient' OR u.sender_user_id = u.patient_user_id)
             AND u.read_at IS NULL),
         (SELECT count(*)::integer FROM mine t WHERE t.other_id = r.other_id)
    FROM ranked r
   WHERE r.rn = 1
   ORDER BY r.created_at DESC;
$$;

-- ---------------------------------------------------------------------------
-- 6. Freezing what a departure leaves unfinished (decision 2)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _c record;
BEGIN
  FOR _c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.clinician_guidance_notifications'::regclass
       AND contype = 'c'
       AND (pg_get_constraintdef(oid) LIKE '%notification_type%')
  LOOP
    EXECUTE format('ALTER TABLE public.clinician_guidance_notifications DROP CONSTRAINT %I', _c.conname);
  END LOOP;
END $$;

ALTER TABLE public.clinician_guidance_notifications
  ADD CONSTRAINT clinician_guidance_notifications_notification_type_check
  CHECK (notification_type IN (
    'acknowledged', 'completed', 'expired', 'dismissed',
    'share_ended', 'routed_outside_department', 'departed_author_drafts'
  )),
  ADD CONSTRAINT clinician_guidance_notifications_has_subject
  CHECK (
    CASE WHEN notification_type IN ('share_ended', 'routed_outside_department', 'departed_author_drafts')
         THEN message IS NOT NULL
         ELSE guidance_id IS NOT NULL
    END
  );

-- An unsigned note about a patient is a clinical safety matter, not a
-- preference.
CREATE OR REPLACE FUNCTION public.notification_is_mandatory(_category text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _category IN (
    'account_security',             -- how a person keeps control of their account
    'patient_vital_alert',          -- a threshold the clinician set, on a reading that matters
    'sharing_ended',                -- the patient was told the other side would learn of it
    'department_routing_oversight', -- the hospital's view of what its leads did
    'departed_work_handover'        -- an unsigned note nobody else knows exists
  );
$$;

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
    RAISE EXCEPTION 'This was left unfinished by someone who has since left the practice, and is kept as they left it. A lead can sign it off, mark it entered in error, or archive it.'
      USING ERRCODE = '42501';
  END IF;

  IF ROW(NEW.author_departed_at, NEW.disposition, NEW.disposition_by, NEW.disposition_at, NEW.disposition_note)
     IS DISTINCT FROM
     ROW(OLD.author_departed_at, OLD.disposition, OLD.disposition_by, OLD.disposition_at, OLD.disposition_note) THEN
    RAISE EXCEPTION 'Only a departure freezes a record, and only resolve_departed_draft resolves one'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_departed_draft() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_departed_draft ON public.encounters;
CREATE TRIGGER trg_guard_departed_draft BEFORE UPDATE ON public.encounters
  FOR EACH ROW EXECUTE FUNCTION public.guard_departed_draft();
DROP TRIGGER IF EXISTS trg_guard_departed_draft ON public.clinician_dictations;
CREATE TRIGGER trg_guard_departed_draft BEFORE UPDATE ON public.clinician_dictations
  FOR EACH ROW EXECUTE FUNCTION public.guard_departed_draft();

/**
 * On departure: freeze the leaver's unfinished work in that practice and route
 * each item to the people who answer for it. One notice per item per
 * recipient, sharing related_id = the item, so resolving it closes every copy.
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
BEGIN
  IF NOT (OLD.status = 'active' AND NEW.status IS DISTINCT FROM 'active') THEN
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
      '%s left %s with an %s for %s, started %s. It is kept as they left it until someone signs it off, marks it entered in error, or archives it.',
      _leaver, _practice,
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

DROP TRIGGER IF EXISTS trg_hand_over_departed_work ON public.practice_members;
CREATE TRIGGER trg_hand_over_departed_work
  AFTER UPDATE ON public.practice_members
  FOR EACH ROW EXECUTE FUNCTION public.hand_over_departed_work();

/**
 * A lead or manager decides about a departed author's draft or dictation.
 *
 *   cosign  — a note: signed off now, with an addendum under the caller's own
 *             name; the note stays the author's, word for word, and is not
 *             shared with the patient unless _share_with_patient.
 *             A dictation: written up as a new draft note under the caller's
 *             own name, which they then review and sign as usual.
 *             Either way a clinical act, so the caller must be on the
 *             patient's care now.
 *   entered_in_error — kept, marked, hidden from the working view.
 *   archive — kept, out of the working view.
 */
CREATE OR REPLACE FUNCTION public.resolve_departed_draft(
  _kind text,
  _id uuid,
  _action text,
  _note text DEFAULT NULL,
  _share_with_patient boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _me        uuid := auth.uid();
  _enc       public.encounters;
  _dict      public.clinician_dictations;
  _practice  uuid;
  _patient   uuid;
  _author    uuid;
  _disp      text;
  _note_txt  text := NULLIF(btrim(COALESCE(_note, '')), '');
  _pname     text;
  _new_id    uuid;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;
  IF _action NOT IN ('cosign', 'entered_in_error', 'archive') THEN
    RAISE EXCEPTION 'Choose cosign, entered_in_error or archive';
  END IF;
  _disp := CASE _action WHEN 'cosign' THEN 'cosigned' WHEN 'archive' THEN 'archived' ELSE 'entered_in_error' END;

  IF _kind = 'encounter' THEN
    SELECT * INTO _enc FROM public.encounters WHERE id = _id FOR UPDATE;
    IF NOT FOUND OR _enc.author_departed_at IS NULL THEN
      RAISE EXCEPTION 'There is no departed author''s draft with that id' USING ERRCODE = '42501';
    END IF;
    _practice := _enc.practice_id; _patient := _enc.patient_user_id; _author := _enc.clinician_user_id;
    IF _enc.disposition IS NOT NULL THEN
      RAISE EXCEPTION 'This draft was already resolved (%)', replace(_enc.disposition, '_', ' ');
    END IF;
  ELSIF _kind = 'dictation' THEN
    SELECT * INTO _dict FROM public.clinician_dictations WHERE id = _id FOR UPDATE;
    IF NOT FOUND OR _dict.author_departed_at IS NULL THEN
      RAISE EXCEPTION 'There is no departed author''s dictation with that id' USING ERRCODE = '42501';
    END IF;
    _practice := _dict.practice_id; _patient := _dict.patient_user_id; _author := _dict.clinician_user_id;
    IF _dict.disposition IS NOT NULL THEN
      RAISE EXCEPTION 'This dictation was already resolved (%)', replace(_dict.disposition, '_', ' ');
    END IF;
  ELSE
    RAISE EXCEPTION 'Choose encounter or dictation';
  END IF;

  IF NOT public.may_resolve_departed_work(_practice, _patient) THEN
    RAISE EXCEPTION 'Only this practice''s owners and admins, or the lead of the patient''s department, can decide about this'
      USING ERRCODE = '42501';
  END IF;

  IF _action = 'cosign' AND NOT public.has_current_clinical_access(_patient, _practice) THEN
    RAISE EXCEPTION 'Signing this off is a clinical act. Assign yourself to the patient first, or ask someone on their care.'
      USING ERRCODE = '42501';
  END IF;

  SELECT name INTO _pname FROM public.practices WHERE id = _practice;

  IF _kind = 'encounter' THEN
    IF _action = 'cosign' THEN
      UPDATE public.encounters
         SET status = 'signed', signed_at = now(), shared_with_patient = COALESCE(_share_with_patient, false)
       WHERE id = _id;
      INSERT INTO public.encounter_addenda (encounter_id, author_user_id, body)
      VALUES (_id, _me, format(
        'Signed off for %s by %s on %s. %s wrote this note and left the practice before signing it; it stands as they wrote it.%s',
        COALESCE(_pname, 'the practice'), public.notice_person_name(_me), to_char(now(), 'DD Mon YYYY'),
        public.notice_person_name(_author),
        CASE WHEN _note_txt IS NOT NULL THEN ' ' || _note_txt ELSE '' END));
    ELSIF _action = 'entered_in_error' THEN
      UPDATE public.encounters SET status = 'entered-in-error' WHERE id = _id;
    END IF;
    UPDATE public.encounters
       SET disposition = _disp, disposition_by = _me, disposition_at = now(), disposition_note = _note_txt
     WHERE id = _id;
  ELSE
    IF _action = 'cosign' THEN
      -- The caller's own note, from the departed author's words. They review
      -- and sign it like any draft; the dictation stays the author's.
      INSERT INTO public.encounters (patient_user_id, clinician_user_id, practice_id, visit_type, status,
                                     plan, scribe_transcript, metadata)
      VALUES (_patient, _me, _practice, 'follow_up', 'in_progress',
              _dict.summary, _dict.transcript,
              jsonb_build_object('from_departed_dictation', _id, 'dictation_author', _author))
      RETURNING id INTO _new_id;
      UPDATE public.clinician_dictations SET encounter_id = _new_id WHERE id = _id;
    ELSIF _action = 'archive' THEN
      UPDATE public.clinician_dictations SET archived_at = now(), archived_by = _me WHERE id = _id;
    END IF;
    UPDATE public.clinician_dictations
       SET disposition = _disp, disposition_by = _me, disposition_at = now(), disposition_note = _note_txt
     WHERE id = _id;
  END IF;

  UPDATE public.clinician_guidance_notifications
     SET acknowledged_at = now(),
         acknowledged_by = _me,
         is_read = CASE WHEN clinician_user_id = _me THEN true ELSE is_read END
   WHERE notification_type = 'departed_author_drafts'
     AND related_id = _id
     AND acknowledged_at IS NULL;

  INSERT INTO public.hipaa_audit_logs (user_id, action, resource_type, resource_id, patient_user_id, details)
  VALUES (_me, 'departed_draft_' || _action,
          CASE _kind WHEN 'encounter' THEN 'encounters' ELSE 'clinician_dictations' END,
          _id::text, _patient,
          jsonb_strip_nulls(jsonb_build_object('practice_id', _practice, 'author_user_id', _author,
                                               'note', _note_txt, 'new_encounter_id', _new_id)));

  RETURN COALESCE(_new_id, _id);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_departed_draft(text, uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_departed_draft(text, uuid, text, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. What ending a membership leaves behind (decision 3)
-- ---------------------------------------------------------------------------
/**
 * The counts an admin reads before ending someone's membership, or a member
 * before leaving. Changes nothing. blocked_reason is set when ending would be
 * refused, in the words the refusal will use.
 */
CREATE OR REPLACE FUNCTION public.offboarding_impact(_practice_id uuid, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _m        public.practice_members;
  _others   integer;
  _blocked  text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.can_manage_practice(_practice_id) OR _user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only a practice owner or admin can see this' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _m FROM public.practice_members WHERE practice_id = _practice_id AND user_id = _user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That person is not a member of this practice';
  END IF;

  SELECT count(*) INTO _others FROM public.practice_members
   WHERE practice_id = _practice_id AND role = 'owner' AND status = 'active' AND user_id <> _user_id;

  IF _m.status = 'active' AND _m.role = 'owner' AND _others = 0 THEN
    _blocked := 'This is the only owner. Appoint another owner first (make a member a co-owner); then they can leave or be removed.';
  ELSIF _m.status = 'active' AND _m.role = 'owner' AND _user_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.practice_members WHERE practice_id = _practice_id AND user_id = auth.uid()
       AND role = 'owner' AND status = 'active') THEN
    _blocked := 'Only an owner can remove another owner.';
  END IF;

  RETURN jsonb_build_object(
    'status', _m.status,
    'role', _m.role,
    'is_owner', _m.role = 'owner',
    'other_active_owners', _others,
    'blocked_reason', _blocked,
    'open_assignments', (
      SELECT count(*) FROM public.practice_patient_assignments
       WHERE practice_id = _practice_id AND clinician_user_id = _user_id
         AND (effective_to IS NULL OR effective_to > now())),
    'patients_left_unassigned', (
      SELECT count(DISTINCT a.patient_user_id) FROM public.practice_patient_assignments a
       WHERE a.practice_id = _practice_id AND a.clinician_user_id = _user_id
         AND (a.effective_to IS NULL OR a.effective_to > now())
         AND NOT EXISTS (
           SELECT 1 FROM public.practice_patient_assignments o
             JOIN public.practice_members om
               ON om.practice_id = o.practice_id AND om.user_id = o.clinician_user_id AND om.status = 'active'
            WHERE o.practice_id = _practice_id AND o.patient_user_id = a.patient_user_id
              AND o.clinician_user_id <> _user_id
              AND (o.effective_to IS NULL OR o.effective_to > now()))),
    'unsigned_drafts', (
      SELECT count(*) FROM public.encounters
       WHERE practice_id = _practice_id AND clinician_user_id = _user_id
         AND signed_at IS NULL AND author_departed_at IS NULL
         AND COALESCE(status, '') NOT IN ('entered-in-error', 'cancelled')),
    'unfiled_dictations', (
      SELECT count(*) FROM public.clinician_dictations
       WHERE practice_id = _practice_id AND clinician_user_id = _user_id
         AND filed_at IS NULL AND status <> 'filed' AND archived_at IS NULL AND author_departed_at IS NULL),
    'open_tasks', (
      SELECT count(*) FROM public.practice_tasks
       WHERE practice_id = _practice_id AND assignee_user_id = _user_id
         AND status IN ('open', 'in_progress', 'snoozed')),
    'future_appointments', (
      SELECT count(*) FROM public.fhir_appointments
       WHERE practice_id = _practice_id AND clinician_user_id = _user_id
         AND start_time > now() AND status IN ('proposed', 'pending', 'booked', 'waitlist')),
    'pending_proposals', (
      SELECT count(*) FROM public.record_change_proposals
       WHERE practice_id = _practice_id AND proposed_by_user_id = _user_id AND status = 'pending'),
    'lead_departments', (
      SELECT COALESCE(jsonb_agg(d.name ORDER BY d.name), '[]'::jsonb)
        FROM public.practice_department_members pdm
        JOIN public.practice_departments d ON d.id = pdm.department_id
       WHERE pdm.practice_id = _practice_id AND pdm.user_id = _user_id AND pdm.is_lead)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.offboarding_impact(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.offboarding_impact(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. The needs-cover list (decision 4)
-- ---------------------------------------------------------------------------
/**
 * What people who have left this practice left open. Computed from the rows
 * themselves, so it cannot drift from them: an item leaves the list the moment
 * it is covered, reassigned, cancelled or resolved.
 *
 * Owners and admins see all of it. A department lead sees the patient-level
 * items for patients in a department they lead, or in no department, as
 * practice_patient_overview already scopes them.
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
  needs_cover AS (
    -- Patients whose clinician left and who now have nobody. An assignment is
    -- taken to have ended with the departure when it closed at the moment the
    -- membership ended (the same transaction stamps both).
    SELECT DISTINCT ON (ps.user_id)
           'patient'::text AS kind, ps.user_id AS item_id, ps.user_id AS patient_user_id,
           a.clinician_user_id AS departed_user_id,
           'Was with ' || public.notice_person_name(a.clinician_user_id) || ', who left on '
             || to_char(e.created_at, 'DD Mon YYYY') || '. Nobody is assigned now.' AS detail,
           e.created_at AS since
      FROM public.practice_shares ps
      JOIN public.practice_patient_assignments a
        ON a.practice_id = ps.practice_id AND a.patient_user_id = ps.user_id AND a.effective_to <= now()
      JOIN public.practice_membership_events e
        ON e.practice_id = a.practice_id AND e.user_id = a.clinician_user_id AND e.event_type = 'ended'
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
           'Unsigned — author departed. Started ' || to_char(en.created_at, 'DD Mon YYYY') || '.',
           en.author_departed_at
      FROM public.encounters en
     WHERE en.practice_id = _practice_id AND en.author_departed_at IS NOT NULL AND en.disposition IS NULL
       AND public.may_resolve_departed_work(_practice_id, en.patient_user_id)

    UNION ALL
    SELECT 'dictation', d.id, d.patient_user_id, d.clinician_user_id,
           'Unfiled dictation — author departed. Recorded ' || to_char(d.created_at, 'DD Mon YYYY') || '.',
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
           'Medication proposal still waiting for the patient, from someone who has left.',
           r.created_at
      FROM public.record_change_proposals r
     WHERE _manager
       AND r.practice_id = _practice_id
       AND r.status = 'pending'
       AND r.proposed_by_user_id IN (SELECT user_id FROM departed)
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

-- A departed member's pending proposal can be withdrawn by the practice, so
-- the patient is not left to accept a change from someone no longer there. A
-- leaver cannot withdraw one they made through the practice: that is an act
-- on the hospital's record.
CREATE OR REPLACE FUNCTION public.withdraw_change_proposal(p_proposal_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS record_change_proposals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _proposal public.record_change_proposals;
  _by_practice boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT * INTO _proposal
    FROM public.record_change_proposals
   WHERE id = p_proposal_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such proposal';
  END IF;

  IF _proposal.proposed_by_user_id = auth.uid() THEN
    IF _proposal.practice_id IS NOT NULL AND NOT public.is_clinical_practice_member(_proposal.practice_id) THEN
      RAISE EXCEPTION 'You no longer work at the practice this proposal was made through';
    END IF;
  ELSIF _proposal.practice_id IS NOT NULL
        AND public.can_manage_practice(_proposal.practice_id)
        AND NOT public.member_is_active_clinician(_proposal.practice_id, _proposal.proposed_by_user_id) THEN
    _by_practice := true;
  ELSE
    RAISE EXCEPTION 'Only the clinician who proposed a change can withdraw it';
  END IF;

  IF _proposal.status <> 'pending' THEN
    RAISE EXCEPTION 'That proposal was already %', _proposal.status;
  END IF;

  UPDATE public.record_change_proposals
     SET status = 'withdrawn',
         responded_at = now(),
         response_note = NULLIF(btrim(COALESCE(p_reason, '')), ''),
         updated_at = now()
   WHERE id = p_proposal_id
  RETURNING * INTO _proposal;

  IF _by_practice THEN
    INSERT INTO public.hipaa_audit_logs (user_id, action, resource_type, resource_id, patient_user_id, details)
    VALUES (auth.uid(), 'departed_proposal_withdrawn', 'record_change_proposals', p_proposal_id::text,
            _proposal.patient_user_id,
            jsonb_build_object('practice_id', _proposal.practice_id, 'proposed_by', _proposal.proposed_by_user_id));
  END IF;

  RETURN _proposal;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. The patient is told, once, who has taken over (decision 6)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_notices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id uuid NOT NULL,
  practice_id     uuid REFERENCES public.practices(id) ON DELETE SET NULL,
  notice_type     text NOT NULL CHECK (notice_type IN ('care_handed_over')),
  message         text NOT NULL,
  related_id      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  seen_at         timestamptz
);

-- related_id is the departed clinician's closed assignment: one notice per
-- handover, however many people are assigned afterwards.
CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_notices_once
  ON public.patient_notices (notice_type, related_id) WHERE related_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_notices_patient
  ON public.patient_notices (patient_user_id, created_at DESC);

COMMENT ON TABLE public.patient_notices IS
  'Things a patient is told about their care that they did not do themselves. Written only by server triggers; the patient reads their own and marks them seen through mark_patient_notice_seen.';

REVOKE ALL ON public.patient_notices FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.patient_notices TO authenticated;
GRANT ALL ON public.patient_notices TO service_role;

ALTER TABLE public.patient_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients read their own notices" ON public.patient_notices;
CREATE POLICY "Patients read their own notices"
ON public.patient_notices FOR SELECT TO authenticated
USING (patient_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.mark_patient_notice_seen(_notice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;
  UPDATE public.patient_notices
     SET seen_at = COALESCE(seen_at, now())
   WHERE id = _notice_id AND patient_user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.mark_patient_notice_seen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_patient_notice_seen(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tell_patient_of_handover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _gone     record;
  _practice text;
  _dept     text;
BEGIN
  -- The patient hears only if they still share with the practice.
  IF NOT EXISTS (
    SELECT 1 FROM public.practice_shares ps
     WHERE ps.practice_id = NEW.practice_id AND ps.user_id = NEW.patient_user_id
       AND ps.is_active AND ps.practice_suspended_at IS NULL
  ) THEN
    RETURN NULL;
  END IF;

  -- The most recent assignment of this patient that closed because its
  -- clinician left, and that no notice has yet been sent about.
  SELECT a.id, a.clinician_user_id INTO _gone
    FROM public.practice_patient_assignments a
    JOIN public.practice_membership_events e
      ON e.practice_id = a.practice_id AND e.user_id = a.clinician_user_id AND e.event_type = 'ended'
     AND a.effective_to BETWEEN e.created_at - interval '1 second' AND e.created_at + interval '1 second'
   WHERE a.practice_id = NEW.practice_id
     AND a.patient_user_id = NEW.patient_user_id
     AND a.id <> NEW.id
     AND a.clinician_user_id <> NEW.clinician_user_id
     AND NOT EXISTS (SELECT 1 FROM public.patient_notices n
                      WHERE n.notice_type = 'care_handed_over' AND n.related_id = a.id)
   ORDER BY a.effective_to DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT name INTO _practice FROM public.practices WHERE id = NEW.practice_id;
  SELECT name INTO _dept FROM public.practice_departments WHERE id = NEW.department_id;

  INSERT INTO public.patient_notices (patient_user_id, practice_id, notice_type, message, related_id)
  VALUES (
    NEW.patient_user_id, NEW.practice_id, 'care_handed_over',
    format('%s is no longer at %s. Your care there continues with %s%s.',
           public.notice_person_name(_gone.clinician_user_id),
           COALESCE(_practice, 'your hospital'),
           public.notice_person_name(NEW.clinician_user_id),
           CASE WHEN _dept IS NOT NULL THEN ' (' || _dept || ')' ELSE '' END),
    _gone.id
  )
  ON CONFLICT DO NOTHING;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.tell_patient_of_handover() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tell_patient_of_handover ON public.practice_patient_assignments;
CREATE TRIGGER trg_tell_patient_of_handover
  AFTER INSERT ON public.practice_patient_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tell_patient_of_handover();

-- ---------------------------------------------------------------------------
-- 10. The only owner is told what to do (decision 7)
-- ---------------------------------------------------------------------------
-- The row still enforces the rule (guard_practice_member_standing); these say
-- it in words an owner can act on, before the row has to.

CREATE OR REPLACE FUNCTION public.end_practice_membership(
  _practice_id uuid,
  _user_id uuid,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row public.practice_members;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;
  IF NOT public.can_manage_practice(_practice_id) THEN
    RAISE EXCEPTION 'Only a practice owner or admin can end someone''s membership'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row
    FROM public.practice_members
   WHERE practice_id = _practice_id AND user_id = _user_id
   FOR UPDATE;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'That person is not a member of this practice';
  END IF;
  IF _row.status <> 'active' THEN
    RETURN;
  END IF;

  IF _row.role = 'owner' AND NOT EXISTS (
    SELECT 1 FROM public.practice_members pm
     WHERE pm.practice_id = _practice_id AND pm.user_id <> _user_id
       AND pm.role = 'owner' AND pm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'This is the only owner of the practice. Make another member a co-owner first; then this membership can end.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('onecare.membership_reason', COALESCE(NULLIF(btrim(_reason), ''), ''), true);
  UPDATE public.practice_members
     SET status = 'revoked',
         end_reason = CASE WHEN _user_id = auth.uid() THEN 'left' ELSE 'ended_by_practice' END
   WHERE practice_id = _practice_id AND user_id = _user_id;
  PERFORM set_config('onecare.membership_reason', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.end_practice_membership(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_practice_membership(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_practice(
  _practice_id uuid,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row public.practice_members;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;

  SELECT * INTO _row
    FROM public.practice_members
   WHERE practice_id = _practice_id AND user_id = auth.uid()
   FOR UPDATE;

  IF _row.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'You are not an active member of this practice';
  END IF;

  IF _row.role = 'owner' AND NOT EXISTS (
    SELECT 1 FROM public.practice_members pm
     WHERE pm.practice_id = _practice_id AND pm.user_id <> auth.uid()
       AND pm.role = 'owner' AND pm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'You are the only owner of this practice. Make another member a co-owner first (People, then their menu, then Make co-owner); then you can leave.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('onecare.membership_reason', COALESCE(NULLIF(btrim(_reason), ''), ''), true);
  UPDATE public.practice_members
     SET status = 'revoked',
         end_reason = 'left'
   WHERE practice_id = _practice_id AND user_id = auth.uid();
  PERFORM set_config('onecare.membership_reason', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.leave_practice(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_practice(uuid, text) TO authenticated;
