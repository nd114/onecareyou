-- Allow patients to view clinician profiles (specialty, practice_name) for clinicians who sent them guidance
CREATE POLICY "Patients can view clinician profiles from guidance"
ON public.clinician_profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.clinician_guidance cg
    WHERE cg.clinician_user_id = clinician_profiles.user_id
    AND cg.patient_user_id = auth.uid()
  )
);