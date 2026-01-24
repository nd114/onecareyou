-- =====================================================
-- Security Fix: Restrict data exposure based on permissions
-- =====================================================

-- 1. Create a function to check if clinician has SPECIFIC permission for a patient
CREATE OR REPLACE FUNCTION public.clinician_has_patient_permission(patient_user_id uuid, permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    CASE WHEN auth.uid() IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.provider_shares ps
      WHERE ps.user_id = patient_user_id
        AND ps.is_active = true
        AND (ps.expires_at IS NULL OR ps.expires_at > now())
        AND (
          ps.clinician_user_id = auth.uid()
          OR ps.provider_email = (SELECT email FROM auth.users WHERE id = auth.uid())
        )
        AND (ps.permissions->>permission_key)::boolean = true
    )
    END
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.clinician_has_patient_permission(uuid, text) TO authenticated;

-- 2. Create a secure view for clinician profiles that limits what patients can see
-- This view only exposes name and title, NOT contact info, license, or credentials
CREATE OR REPLACE VIEW public.clinician_profiles_public
WITH (security_invoker=on) AS
SELECT 
  id,
  user_id,
  title,
  first_name,
  last_name,
  practice_name,
  specialty,
  avatar_url,
  created_at
  -- Explicitly EXCLUDING: license_number, country, stripe_customer_id, stripe_subscription_id,
  -- subscription_tier, subscription_status, subscription_ends_at, trial_ends_at, patient_limit,
  -- team_id, email_notifications_enabled, push_notifications_enabled, push_subscription,
  -- notify_on_guidance_acknowledged, notify_on_guidance_completed, notify_on_guidance_expired
FROM public.clinician_profiles;

-- 3. Drop the overly permissive policy that exposes full clinician profiles to patients
DROP POLICY IF EXISTS "Patients can view clinician profiles from guidance" ON public.clinician_profiles;

-- 4. Create a more restrictive policy - patients can only see clinicians via the view
-- The base table policy denies direct patient access
CREATE POLICY "Patients cannot directly access clinician profiles"
ON public.clinician_profiles
FOR SELECT
TO authenticated
USING (
  -- Owner can always see their own profile
  auth.uid() = user_id
  -- Patients cannot access via this table directly - they must use the view
);

-- 5. Update medications policy to check specific 'meds' permission
DROP POLICY IF EXISTS "Clinicians can view shared patient medications" ON public.medications;

CREATE POLICY "Clinicians can view shared patient medications with permission"
ON public.medications
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR clinician_has_patient_permission(user_id, 'meds')
);

-- 6. Update vitals policy to check specific 'vitals' permission
DROP POLICY IF EXISTS "Clinicians can view shared patient vitals" ON public.vitals;

CREATE POLICY "Clinicians can view shared patient vitals with permission"
ON public.vitals
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR clinician_has_patient_permission(user_id, 'vitals')
);

-- 7. Update schedule_entries policy to check specific 'adherence' permission
DROP POLICY IF EXISTS "Clinicians can view shared patient schedules" ON public.schedule_entries;

CREATE POLICY "Clinicians can view shared patient schedules with permission"
ON public.schedule_entries
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR clinician_has_patient_permission(user_id, 'adherence')
);

-- 8. Update profiles policy to check specific 'profile' permission for clinicians
DROP POLICY IF EXISTS "Clinicians can view shared patient profiles" ON public.profiles;

CREATE POLICY "Clinicians can view shared patient profiles with permission"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR clinician_has_patient_permission(user_id, 'profile')
);

-- 9. Keep the policy for patients to view clinician names from guidance
-- but only if they use the public view (not the full profiles table)
-- The "Patients can view clinician names from guidance" policy already exists 
-- and is scoped to the clinician_profiles table - we're replacing it

-- Note: The application code should be updated to use clinician_profiles_public view
-- when patients need to see clinician information