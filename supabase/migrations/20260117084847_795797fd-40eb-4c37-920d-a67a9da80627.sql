-- Replace clinician profile select policy to use security definer email helper
DROP POLICY IF EXISTS "Clinicians can view shared patient profiles" ON public.profiles;

CREATE POLICY "Clinicians can view shared patient profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.provider_shares ps
    WHERE ps.user_id = profiles.user_id
      AND ps.is_active = true
      AND (
        ps.clinician_user_id = auth.uid()
        OR ps.provider_email = public.get_current_user_email()
      )
  )
);