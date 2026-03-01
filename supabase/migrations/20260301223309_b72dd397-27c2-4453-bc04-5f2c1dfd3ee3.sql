-- Allow patients to see basic clinician profile info when the clinician
-- has a pending patient record matching the patient's email.
-- This is needed so the consent dialog can display the clinician's name.
CREATE POLICY "Patients can view clinician profiles from pending records"
  ON public.clinician_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinician_patient_records cpr
      WHERE cpr.clinician_user_id = clinician_profiles.user_id
        AND cpr.patient_email IS NOT NULL
        AND cpr.patient_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );