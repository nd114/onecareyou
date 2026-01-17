-- Allow clinicians to view profiles of patients who shared data with them
CREATE POLICY "Clinicians can view shared patient profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.provider_shares ps
    WHERE ps.user_id = profiles.user_id
    AND ps.is_active = true
    AND (
      ps.clinician_user_id = auth.uid()
      OR ps.provider_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  )
);