
-- Bug 1: Allow clinicians to view basic patient info (name, email) from active shares
CREATE POLICY "Clinicians can view basic patient info from shares"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.provider_shares ps
    WHERE ps.user_id = profiles.user_id
      AND ps.is_active = true
      AND (ps.expires_at IS NULL OR ps.expires_at > now())
      AND (
        ps.clinician_user_id = auth.uid()
        OR ps.provider_email = (SELECT email FROM auth.users WHERE id = auth.uid())
      )
  )
);

-- Bug 2: Round all existing vitals values to 1 decimal place
UPDATE public.vitals SET value = ROUND(value::numeric, 1) WHERE value != ROUND(value::numeric, 1);
UPDATE public.vitals SET secondary_value = ROUND(secondary_value::numeric, 1) WHERE secondary_value IS NOT NULL AND secondary_value != ROUND(secondary_value::numeric, 1);
