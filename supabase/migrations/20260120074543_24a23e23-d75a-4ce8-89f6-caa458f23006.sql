-- Fix security vulnerabilities in clinician access controls
-- Issue 1: clinician_has_patient_access() doesn't check expires_at
-- Issue 2: profiles RLS policy doesn't check expires_at

-- 1. Drop and recreate the clinician_has_patient_access function with expiration check
CREATE OR REPLACE FUNCTION public.clinician_has_patient_access(patient_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.provider_shares ps
    WHERE ps.user_id = patient_user_id
      AND ps.is_active = true
      AND (ps.expires_at IS NULL OR ps.expires_at > now())
      AND (
        ps.clinician_user_id = auth.uid()
        OR ps.provider_email = (SELECT email FROM auth.users WHERE id = auth.uid())
      )
  )
$$;

-- 2. Revoke execute from public and grant to authenticated only (security hardening)
REVOKE EXECUTE ON FUNCTION public.clinician_has_patient_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clinician_has_patient_access(uuid) TO authenticated;

-- 3. Update the profiles RLS policy for clinician access to include expiration check
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
      AND (ps.expires_at IS NULL OR ps.expires_at > now())
      AND (
        ps.clinician_user_id = auth.uid()
        OR ps.provider_email = get_current_user_email()
      )
  )
);

-- 4. Harden get_current_user_email function - ensure it only works for authenticated users
CREATE OR REPLACE FUNCTION public.get_current_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT CASE 
    WHEN auth.uid() IS NULL THEN NULL
    ELSE (SELECT email FROM auth.users WHERE id = auth.uid())
  END
$$;

-- Ensure only authenticated users can call get_current_user_email
REVOKE EXECUTE ON FUNCTION public.get_current_user_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_email() TO authenticated;