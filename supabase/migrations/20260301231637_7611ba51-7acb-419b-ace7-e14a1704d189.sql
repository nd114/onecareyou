
-- =============================================================
-- Fix all RLS policies that directly reference auth.users
-- Replace with get_current_user_email() SECURITY DEFINER function
-- =============================================================

-- 1. profiles: "Clinicians can view basic patient info from shares"
DROP POLICY IF EXISTS "Clinicians can view basic patient info from shares" ON public.profiles;
CREATE POLICY "Clinicians can view basic patient info from shares"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.provider_shares ps
      WHERE ps.user_id = profiles.user_id
        AND ps.is_active = true
        AND (ps.expires_at IS NULL OR ps.expires_at > now())
        AND (
          ps.clinician_user_id = auth.uid()
          OR ps.provider_email = get_current_user_email()
        )
    )
  );

-- 2. clinician_profiles: "Patients can view clinician profiles from pending records"
DROP POLICY IF EXISTS "Patients can view clinician profiles from pending records" ON public.clinician_profiles;
CREATE POLICY "Patients can view clinician profiles from pending records"
  ON public.clinician_profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinician_patient_records cpr
      WHERE cpr.clinician_user_id = clinician_profiles.user_id
        AND cpr.patient_email IS NOT NULL
        AND cpr.patient_email = get_current_user_email()
    )
  );

-- 3. clinician_patient_records: "Patients can view pending records by email"
DROP POLICY IF EXISTS "Patients can view pending records by email" ON public.clinician_patient_records;
CREATE POLICY "Patients can view pending records by email"
  ON public.clinician_patient_records FOR SELECT TO authenticated
  USING (
    patient_email IS NOT NULL
    AND patient_email = get_current_user_email()
    AND linked_user_id IS NULL
  );

-- 4. clinician_patient_records: "Patients can accept or decline pending records"
DROP POLICY IF EXISTS "Patients can accept or decline pending records" ON public.clinician_patient_records;
CREATE POLICY "Patients can accept or decline pending records"
  ON public.clinician_patient_records FOR UPDATE TO authenticated
  USING (
    patient_email IS NOT NULL
    AND patient_email = get_current_user_email()
  );

-- 5. patient_invitations: "Patients can view invitations by email"
DROP POLICY IF EXISTS "Patients can view invitations by email" ON public.patient_invitations;
CREATE POLICY "Patients can view invitations by email"
  ON public.patient_invitations FOR SELECT TO authenticated
  USING (
    patient_email = get_current_user_email()
  );

-- 6. patient_invitations: "Patients can accept or decline invitations"
DROP POLICY IF EXISTS "Patients can accept or decline invitations" ON public.patient_invitations;
CREATE POLICY "Patients can accept or decline invitations"
  ON public.patient_invitations FOR UPDATE TO authenticated
  USING (
    patient_email = get_current_user_email()
  );

-- 7. practice_invitations: "Practice members can view invitations"
DROP POLICY IF EXISTS "Practice members can view invitations" ON public.practice_invitations;
CREATE POLICY "Practice members can view invitations"
  ON public.practice_invitations FOR SELECT TO authenticated
  USING (
    is_practice_member(practice_id)
    OR email = get_current_user_email()
  );

-- 8. practice_invitations: "Practice managers can update invitations"
DROP POLICY IF EXISTS "Practice managers can update invitations" ON public.practice_invitations;
CREATE POLICY "Practice managers can update invitations"
  ON public.practice_invitations FOR UPDATE TO authenticated
  USING (
    can_manage_practice(practice_id)
    OR email = get_current_user_email()
  );

-- 9. job_applications: "Applicants can view their own applications"
DROP POLICY IF EXISTS "Applicants can view their own applications" ON public.job_applications;
CREATE POLICY "Applicants can view their own applications"
  ON public.job_applications FOR SELECT TO authenticated
  USING (
    email = get_current_user_email()
  );
