-- Allow patients to view the name of clinicians who have sent them guidance
CREATE POLICY "Patients can view clinician names from guidance"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.clinician_guidance cg
    WHERE cg.clinician_user_id = profiles.user_id
    AND cg.patient_user_id = auth.uid()
  )
);