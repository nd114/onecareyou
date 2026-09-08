-- An assignment is not consent, and must stop meaning anything when the share ends.
--
-- Found September 2026 by running the SQL suites as a set for the first time.
-- `practice_access_consent.test.sql` had been asserting this rule since August,
-- but it referenced a table the one-access-table migration dropped, so it had
-- not run since and nobody noticed. This is what it was guarding against:
--
--   1. A patient shares their record with a hospital.
--   2. A manager assigns a clinician to them — an ordinary, correct act.
--   3. The patient revokes the share.
--   4. `practice_has_patient_access()` correctly returns false.
--   5. `is_assigned_to_patient()` still returns TRUE, because it checks only
--      that an assignment row exists and is in date.
--   6. The `encounters` policy ORs the two, so the clinician keeps reading the
--      patient's signed assessment and raw ambient transcript — after the
--      patient withdrew consent.
--
-- Reproduced against the replayed migration history before writing this.
--
-- The rule the sharing model states is "revocation stops forward access
-- immediately". An assignment records *who is looking after whom*. It is a
-- roster fact, not a permission, and it was being read as one.
--
-- The fix is to make the function mean what its callers assume: assigned AND
-- still shared. The assignment row itself is untouched — it stays as the record
-- of who was responsible, which is the same reasoning as everywhere else here:
-- nothing is deleted where there is a legal record.

CREATE OR REPLACE FUNCTION public.is_assigned_to_patient(
  _user_id uuid,
  _patient_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_patient_assignments ppa
    JOIN public.practice_shares ps
      ON ps.practice_id = ppa.practice_id
     AND ps.user_id = ppa.patient_user_id
    WHERE ppa.patient_user_id = _patient_user_id
      AND ppa.clinician_user_id = _user_id
      AND (ppa.effective_to IS NULL OR ppa.effective_to > now())
      AND ppa.effective_from <= now()
      -- The patient's own switch, and the practice's. Both were already
      -- required by every other gate; this one was not asking.
      AND ps.is_active = true
      AND ps.practice_suspended_at IS NULL
  );
$function$;

COMMENT ON FUNCTION public.is_assigned_to_patient(uuid, uuid) IS
  'Assigned to this patient AND the patient''s share with that practice is still live. The share check was missing: an assignment is a roster fact, not a permission, and revocation has to end the access it was being read as granting.';
