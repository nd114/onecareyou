-- A practice cannot let itself into a patient's record.
--
-- Found by trying it. A staff member with can_invite_patients could insert a
-- row into practice_patient_access for ANY patient — one who had never shared
-- with the practice, never heard of it — and immediately read that patient's
-- signed clinical notes, including the raw ambient transcript. The INSERT
-- policy required practice membership and the invite capability, and nothing
-- about the patient agreeing.
--
--   staff self-granted access to a non-consenting patient: t
--   staff can now read 1 clinical note(s)
--
-- The table is effectively legacy: nothing server-side inserts it, no migration
-- seeds it, and the app only ever updates it. practice_shares — which the
-- patient writes when they choose to share — superseded it. But its policies
-- stayed live, and encounters and patient_action_log still gate on
-- practice_has_patient_access, so the hole was reachable.
--
-- Both ends are closed here: a row cannot be created without the patient's
-- share, and an existing row grants nothing without it either. The second half
-- matters because tightening only the policy would leave any row already
-- written working forever.

-- ---------------------------------------------------------------------------
-- 1. The gate: consent is required at read time, whatever rows exist
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.practice_has_patient_access(patient_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_patient_access ppa
    JOIN public.practice_members pm ON pm.practice_id = ppa.practice_id
    WHERE ppa.patient_user_id = patient_uuid
      AND ppa.is_active = true
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND pm.can_view_all_patients = true
      -- The patient's own decision, checked here rather than trusted from the
      -- row. A practice_patient_access row records that a practice added a
      -- patient; it is not evidence the patient agreed.
      AND EXISTS (
        SELECT 1 FROM public.practice_shares ps
         WHERE ps.practice_id = ppa.practice_id
           AND ps.user_id = patient_uuid
           AND ps.is_active = true
      )
  )
$$;

COMMENT ON FUNCTION public.practice_has_patient_access(uuid) IS
  'Whether the caller reaches a patient through their practice. Requires an active '
  'practice_shares row — the patient''s own decision — as well as the practice_patient_access '
  'row, because the latter is written by the practice and is not evidence of consent.';

-- ---------------------------------------------------------------------------
-- 2. The door: a row cannot be created for a patient who has not shared
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Practice members can add patient access" ON public.practice_patient_access;
DROP POLICY IF EXISTS "practice_patient_access_insert" ON public.practice_patient_access;

DO $$
DECLARE _p record;
BEGIN
  -- The policy has been named differently across migrations; drop whichever
  -- INSERT policy is actually present rather than guessing at its name.
  FOR _p IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'practice_patient_access' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.practice_patient_access', _p.policyname);
  END LOOP;
END
$$;

CREATE POLICY "Practice records access only for patients who shared"
  ON public.practice_patient_access FOR INSERT TO authenticated
  WITH CHECK (
    public.is_practice_member(practice_id)
    AND EXISTS (
      SELECT 1 FROM public.practice_members pm
       WHERE pm.practice_id = practice_patient_access.practice_id
         AND pm.user_id = auth.uid()
         AND pm.can_invite_patients = true
    )
    AND EXISTS (
      SELECT 1 FROM public.practice_shares ps
       WHERE ps.practice_id = practice_patient_access.practice_id
         AND ps.user_id = practice_patient_access.patient_user_id
         AND ps.is_active = true
    )
  );

COMMENT ON POLICY "Practice records access only for patients who shared"
  ON public.practice_patient_access IS
  'Adds the condition that was missing: the patient must have shared with this practice. '
  'Without it a staff member with can_invite_patients could insert a row for any patient at '
  'all and read their clinical notes — verified by doing it before this was written.';
