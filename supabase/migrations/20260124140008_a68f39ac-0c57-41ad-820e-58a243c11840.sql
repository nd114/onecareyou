-- Fix: Allow patients to view clinician profiles via the public view when they have a guidance relationship
-- The current policy blocks ALL patient access, but we need to allow them to see basic info via the view

-- First, drop the overly restrictive policy
DROP POLICY IF EXISTS "Patients cannot directly access clinician profiles" ON public.clinician_profiles;

-- Re-create a policy that allows patients to view ONLY via the guidance relationship
-- The view will further restrict what columns they can see
CREATE POLICY "Patients can view clinician profiles from guidance"
ON public.clinician_profiles
FOR SELECT
TO authenticated
USING (
  -- Owner can always see their own full profile
  auth.uid() = user_id
  -- Patients can view clinician profiles if they have received guidance from them
  OR EXISTS (
    SELECT 1
    FROM clinician_guidance cg
    WHERE cg.clinician_user_id = clinician_profiles.user_id
      AND cg.patient_user_id = auth.uid()
  )
);

-- Note: The clinician_profiles_public view restricts WHICH columns patients can see
-- The RLS policy controls WHO can query the table
-- Together they provide defense in depth