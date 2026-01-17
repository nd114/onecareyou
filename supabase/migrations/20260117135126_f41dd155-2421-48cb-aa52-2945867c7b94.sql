-- Create a security definer function to check if a clinician has access to a patient
-- This prevents infinite recursion in RLS policies
CREATE OR REPLACE FUNCTION public.clinician_has_patient_access(patient_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.provider_shares ps
    WHERE ps.user_id = patient_user_id
      AND ps.is_active = true
      AND (
        ps.clinician_user_id = auth.uid()
        OR ps.provider_email = (SELECT email FROM auth.users WHERE id = auth.uid())
      )
  )
$$;

-- Add RLS policy for clinicians to view shared patient medications
CREATE POLICY "Clinicians can view shared patient medications"
ON public.medications
FOR SELECT
USING (
  auth.uid() = user_id 
  OR public.clinician_has_patient_access(user_id)
);

-- Add RLS policy for clinicians to view shared patient vitals
CREATE POLICY "Clinicians can view shared patient vitals"
ON public.vitals
FOR SELECT
USING (
  auth.uid() = user_id 
  OR public.clinician_has_patient_access(user_id)
);

-- Add RLS policy for clinicians to view shared patient schedule entries
CREATE POLICY "Clinicians can view shared patient schedules"
ON public.schedule_entries
FOR SELECT
USING (
  auth.uid() = user_id 
  OR public.clinician_has_patient_access(user_id)
);

-- Drop the old user-only SELECT policies since our new policies cover both cases
DROP POLICY IF EXISTS "Users can view their own medications" ON public.medications;
DROP POLICY IF EXISTS "Users can view their own vitals" ON public.vitals;
DROP POLICY IF EXISTS "Users can view their own schedule entries" ON public.schedule_entries;