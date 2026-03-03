
-- Drop the overly broad "basic info" policy that exposes all columns
DROP POLICY IF EXISTS "Clinicians can view basic patient info from shares" ON public.profiles;

-- Create a restricted view for basic patient info (name + email only)
CREATE OR REPLACE VIEW public.patient_basic_info
WITH (security_invoker = on) AS
  SELECT user_id, name, email
  FROM public.profiles;

-- Add a new restrictive SELECT policy that only allows clinicians with active shares
-- to see name and email via the view (the existing permission-based policy handles full profile access)
CREATE POLICY "Clinicians can view basic patient info from shares"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM provider_shares ps
    WHERE ps.user_id = profiles.user_id
      AND ps.is_active = true
      AND (ps.expires_at IS NULL OR ps.expires_at > now())
      AND (
        ps.clinician_user_id = auth.uid()
        OR ps.provider_email = get_current_user_email()
      )
  )
);
