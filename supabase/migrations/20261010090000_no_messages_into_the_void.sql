-- A patient could write into a conversation nobody would ever read, and a
-- caregiver holding a clinician's link could still act as the clinician in the
-- places the last change did not reach.
--
-- Messages. The patient's INSERT policy asked only that the sender was the
-- patient. A private clinician reads a message only while their share is live,
-- and a hospital thread is read only by clinicians on the patient's care there.
-- So once a patient stopped sharing, a share expired, a claimant turned out not
-- to be a clinician, or a hospital took a clinician off the patient's care, the
-- composer stayed open and every message went unread, with nothing to say so
-- (plan G2, docs/plans/sharing-infrastructure-v2.md phase 0). The policy now
-- also asks message_thread_readers_exist(): is there somebody who can read this
-- message the moment it is written. For a private thread that is the clinician
-- through a live share. For a hospital thread it is the clinician while they
-- are on the patient's care, and once they have left, anyone clinical who is
-- on the patient's care there now — the covering arrangement 20261010070000
-- set up, which keeps working. When nobody is covering, the thread waits: it
-- reopens the moment the hospital assigns someone.
--
-- The clinician's INSERT policy already requires a live relationship
-- (clinician_has_patient_access or institution_has_clinical_access, both of
-- which ask for a clinician account); it is unchanged, and the new suite
-- proves it for each way a relationship ends.
--
-- my_message_counterparties() gives the patient's Messages screen one row per
-- clinician they have had a conversation or a relationship with, whether they
-- can write, and if not why, when, and who their care continues with. It is
-- computed with the same helper as the policy, so the screen cannot offer a
-- composer the database would refuse, nor close one it would accept.
--
-- Clinicians. 20261010050000 made a provider share a clinician's, which closed
-- the Care Circle link to anybody without a clinician account. Every clinical
-- INSERT already went through gates that ask that question. Three writes did
-- not: editing guidance and alert rules already written (author-only), and
-- creating a managed patient record, which any signed-in account could do and
-- which the patient is then asked to accept as their clinician's. Each now also
-- asks caller_is_clinician(). Existing rows are not changed.

-- ---------------------------------------------------------------------------
-- 1. Who reads a thread now
-- ---------------------------------------------------------------------------

/**
 * practice_clinical_access() asked about a named person rather than the
 * caller: the test the hospital-thread read policy applies. Internal.
 */
CREATE OR REPLACE FUNCTION public.practice_clinical_access_as(_user uuid, _practice_id uuid, _patient_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user IS NOT NULL AND _practice_id IS NOT NULL AND _patient_user_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.practice_shares ps
      JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
     WHERE ps.practice_id = _practice_id
       AND ps.user_id = _patient_user_id
       AND ps.is_active = true
       AND ps.practice_suspended_at IS NULL
       AND pm.user_id = _user
       AND pm.status = 'active'
       AND public.practice_role_is_clinical(pm.role)
       AND (pm.can_view_all_patients
            OR public.is_assigned_to_patient_in_practice(_user, _patient_user_id, _practice_id))
  );
$$;

REVOKE ALL ON FUNCTION public.practice_clinical_access_as(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.practice_clinical_access_as(uuid, uuid, uuid) TO service_role;

/**
 * Whether a message written now in the thread (patient, clinician), belonging
 * to _practice_id (NULL: a private thread), would be read by anyone on the
 * clinical side. Mirrors the two clinician read policies on messages.
 * Only the two parties (or the server) get a real answer; anyone else is told
 * false, so it cannot be used to learn who treats whom.
 */
CREATE OR REPLACE FUNCTION public.message_thread_readers_exist(_patient uuid, _clinician uuid, _practice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _patient IS NULL OR _clinician IS NULL THEN false
    WHEN auth.uid() IS NOT NULL AND auth.uid() NOT IN (_patient, _clinician) THEN false
    WHEN _practice_id IS NULL THEN
      public.clinician_can_see_patient_as(_clinician, _patient, NULL)
    WHEN public.member_is_active_clinician(_practice_id, _clinician) THEN
      -- While they work there, the conversation is theirs alone.
      public.practice_clinical_access_as(_clinician, _practice_id, _patient)
    ELSE EXISTS (
      SELECT 1 FROM public.practice_members pm
       WHERE pm.practice_id = _practice_id
         AND pm.user_id <> _clinician
         AND pm.status = 'active'
         AND public.practice_role_is_clinical(pm.role)
         AND public.practice_clinical_access_as(pm.user_id, _practice_id, _patient)
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.message_thread_readers_exist(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.message_thread_readers_exist(uuid, uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The patient writes only where someone reads
-- ---------------------------------------------------------------------------
-- practice_id is filled by trg_stamp_message_context before the row is
-- checked, so the policy sees the thread the message will actually join.
DROP POLICY IF EXISTS "Patients can send messages" ON public.messages;
CREATE POLICY "Patients can send messages"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = patient_user_id
  AND auth.uid() = sender_user_id
  AND public.message_thread_readers_exist(patient_user_id, clinician_user_id, practice_id)
);

-- ---------------------------------------------------------------------------
-- 3. What the patient's Messages screen is told
-- ---------------------------------------------------------------------------

/**
 * One row per clinician the caller, as a patient, has a thread with, has
 * shared with privately, or is currently assigned at a hospital they share
 * with. can_send is exactly what the INSERT policy will decide. reason:
 *   open              they read it
 *   covered           they left the hospital; its staff on your care read it
 *   sharing_stopped   the share (private or hospital) was ended
 *   share_expired     the private share ran out
 *   not_a_clinician   the link was claimed by an account that is not a clinician
 *   practice_paused   the hospital has paused its access, or closed
 *   clinician_left    they left the hospital and nobody there has taken over yet
 *   not_on_care_team  they still work there but are no longer on your care
 *   no_connection     nothing links you now
 * continues_with lists the clinicians currently assigned to the caller at
 * that hospital, other than this one.
 */
CREATE OR REPLACE FUNCTION public.my_message_counterparties()
RETURNS TABLE(
  clinician_user_id uuid,
  clinician_name text,
  practice_id uuid,
  practice_name text,
  can_send boolean,
  reason text,
  ended_at timestamptz,
  ended_by_patient boolean,
  continues_with jsonb
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
        WHEN can_send AND public.member_is_active_clinician(practice_id, _c) THEN 'open'
        WHEN can_send THEN 'covered'
        WHEN _pr.id IS NULL THEN 'no_connection'
        WHEN NOT _pr.is_active THEN 'sharing_stopped'
        WHEN _pr.practice_suspended_at IS NOT NULL OR _prac.is_active IS NOT TRUE THEN 'practice_paused'
        WHEN NOT public.member_is_active_clinician(practice_id, _c) THEN 'clinician_left'
        ELSE 'not_on_care_team'
      END;
      IF reason = 'sharing_stopped' THEN
        ended_at := _pr.revoked_at;
        ended_by_patient := COALESCE(_pr.revoked_by = _me, false);
      ELSIF reason = 'practice_paused' THEN
        ended_at := _pr.practice_suspended_at;
      ELSIF reason IN ('covered', 'clinician_left') THEN
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
-- 4. Clinical writes that did not ask for a clinician
-- ---------------------------------------------------------------------------

-- Guidance a caregiver issued while their claim was open stays, attributed;
-- they may no longer rewrite it.
DROP POLICY IF EXISTS "Clinicians can update their guidance" ON public.clinician_guidance;
CREATE POLICY "Clinicians can update their guidance"
ON public.clinician_guidance FOR UPDATE TO authenticated
USING (auth.uid() = clinician_user_id AND public.caller_is_clinician())
WITH CHECK (auth.uid() = clinician_user_id AND public.caller_is_clinician());

-- Their rules are archived by archive_alert_rules_without_access, which does
-- not need them to be able to edit them.
DROP POLICY IF EXISTS "Clinicians can update their alert rules" ON public.clinician_alert_rules;
CREATE POLICY "Clinicians can update their alert rules"
ON public.clinician_alert_rules FOR UPDATE TO authenticated
USING (auth.uid() = clinician_user_id AND public.caller_is_clinician())
WITH CHECK (
  auth.uid() = clinician_user_id
  AND public.caller_is_clinician()
  AND (is_active IS NOT TRUE OR public.clinician_has_patient_permission(patient_user_id, 'vitals'))
);

-- A managed record is offered to the patient as their clinician's record of
-- them; only a clinician may start one.
DROP POLICY IF EXISTS "Clinicians can insert their own patient records" ON public.clinician_patient_records;
CREATE POLICY "Clinicians can insert their own patient records"
ON public.clinician_patient_records FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = clinician_user_id
  AND linked_user_id IS NULL
  AND practice_id IS NULL
  AND public.caller_is_clinician()
);
