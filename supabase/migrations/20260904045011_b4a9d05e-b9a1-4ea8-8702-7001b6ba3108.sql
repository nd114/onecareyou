-- Retire practice_patient_access.
--
-- Two tables answered "can this hospital's staff see this patient":
--
--   practice_shares          — the patient's decision to share with a practice
--   practice_patient_access  — the practice's own record that it took the
--                              patient on, plus its own on/off switch
--
-- Two sources of truth for one question is how they end up disagreeing, and
-- they already did: institution_has_patient_permission (which gates most
-- clinical data) reads practice_shares alone, while practice_has_patient_access
-- and practice_has_clinical_access (which gate encounters and the action log)
-- required a row in BOTH. So the same staff member could see a patient's
-- medications and not their encounters, for no reason a person could explain.
--
-- Converging on practice_shares. But practice_patient_access carried one thing
-- practice_shares does not, and dropping it blind would have deleted a feature:
--
--   * ppa.is_active is the PRACTICE's switch — an admin suspending a patient
--     internally, without the patient doing anything (usePracticeAdmin's
--     setPatientAccess). ps.is_active is the PATIENT's switch. They are
--     different decisions by different people and both have to survive.
--
--   * ppa.primary_clinician_id is read only by that table's own policies.
--     Nothing else uses it, so it goes with the table.
--
-- The suspension therefore moves onto practice_shares as its own column rather
-- than being folded into is_active, so it stays clear whose decision each one
-- records.

-- ---------------------------------------------------------------------------
-- 1. The practice's own switch, on the surviving table
-- ---------------------------------------------------------------------------
ALTER TABLE public.practice_shares
  ADD COLUMN IF NOT EXISTS practice_suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS practice_suspended_by UUID;

COMMENT ON COLUMN public.practice_shares.practice_suspended_at IS
  'Set when the PRACTICE suspends its own staff''s access to this patient. Distinct from '
  'is_active, which is the PATIENT''s decision to share. Either one being off denies access.';

-- ---------------------------------------------------------------------------
-- 2. Carry the existing suspensions across, and report any disagreement
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_suspended     int;
  v_share_no_ppa  int;
  v_ppa_no_share  int;
BEGIN
  IF to_regclass('public.practice_patient_access') IS NULL THEN
    RAISE NOTICE 'practice_patient_access already gone — nothing to migrate';
    RETURN;
  END IF;

  -- Every practice that had switched a patient off keeps that decision.
  UPDATE public.practice_shares ps
     SET practice_suspended_at = COALESCE(ps.practice_suspended_at, now())
    FROM public.practice_patient_access ppa
   WHERE ppa.practice_id = ps.practice_id
     AND ppa.patient_user_id = ps.user_id
     AND ppa.is_active = false;
  GET DIAGNOSTICS v_suspended = ROW_COUNT;
  RAISE NOTICE 'suspensions carried across: %', v_suspended;

  -- The discrepancy report. These are the rows where the two tables disagreed.
  SELECT count(*) INTO v_share_no_ppa
    FROM public.practice_shares ps
   WHERE ps.is_active
     AND NOT EXISTS (
       SELECT 1 FROM public.practice_patient_access ppa
        WHERE ppa.practice_id = ps.practice_id AND ppa.patient_user_id = ps.user_id
     );

  SELECT count(*) INTO v_ppa_no_share
    FROM public.practice_patient_access ppa
   WHERE ppa.is_active
     AND NOT EXISTS (
       SELECT 1 FROM public.practice_shares ps
        WHERE ps.practice_id = ppa.practice_id AND ps.user_id = ppa.patient_user_id
          AND ps.is_active
     );

  -- Patient shared, practice never added them: staff could NOT see encounters
  -- before and CAN now. That is the intended correction — the patient consented
  -- to the practice, and the practice's bookkeeping is not a second consent.
  RAISE NOTICE 'shared but never added by the practice (gain access): %', v_share_no_ppa;

  -- Practice added them, patient never shared (or withdrew): these granted
  -- nothing before either, because both functions already required consent.
  RAISE NOTICE 'added by the practice without patient consent (no change, still denied): %',
    v_ppa_no_share;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Both gates now read one table
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
    FROM public.practice_shares ps
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    WHERE ps.user_id = patient_uuid
      AND ps.is_active = true                 -- the patient's decision
      AND ps.practice_suspended_at IS NULL    -- the practice's own switch
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND pm.can_view_all_patients = true
  )
$$;

COMMENT ON FUNCTION public.practice_has_patient_access(uuid) IS
  'Whether the caller reaches a patient through their practice. Reads practice_shares only: '
  'the patient must have shared, and the practice must not have suspended them.';

CREATE OR REPLACE FUNCTION public.practice_has_clinical_access(patient_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_shares ps
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    WHERE ps.user_id = patient_uuid
      AND ps.is_active = true
      AND ps.practice_suspended_at IS NULL
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND pm.can_view_all_patients = true
      AND public.practice_role_is_clinical(pm.role)
  )
$$;

COMMENT ON FUNCTION public.practice_has_clinical_access(uuid) IS
  'As practice_has_patient_access, and the member must hold a clinical role. Front desk and '
  'billing reach appointments and invoices, never notes or readings.';

-- ---------------------------------------------------------------------------
-- 4. The table goes
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.practice_patient_access CASCADE;

-- Pin the search path on the allowlist function from the non-clinical-staff
-- migration so it is not callable with a mutable path.
ALTER FUNCTION public.practice_role_is_clinical(public.practice_role) SET search_path = public;