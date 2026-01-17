-- Create a security definer function to get current user's email
-- This avoids permission issues when accessing auth.users from RLS policies
CREATE OR REPLACE FUNCTION public.get_current_user_email()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM auth.users WHERE id = auth.uid()
$$;

-- Drop the existing problematic policies
DROP POLICY IF EXISTS "Clinicians can claim shares matching their email" ON public.provider_shares;
DROP POLICY IF EXISTS "Clinicians can view shares associated with their email or user_" ON public.provider_shares;
DROP POLICY IF EXISTS "Clinicians can update notes on their patient shares" ON public.provider_shares;

-- Recreate policies using the security definer function
CREATE POLICY "Clinicians can view shares by email or user_id" 
ON public.provider_shares 
FOR SELECT 
USING (
  auth.uid() = user_id 
  OR auth.uid() = clinician_user_id 
  OR provider_email = public.get_current_user_email()
);

CREATE POLICY "Clinicians can claim shares matching their email" 
ON public.provider_shares 
FOR UPDATE 
USING (
  provider_email = public.get_current_user_email() 
  AND clinician_user_id IS NULL
);

CREATE POLICY "Clinicians can update their patient shares" 
ON public.provider_shares 
FOR UPDATE 
USING (auth.uid() = clinician_user_id)
WITH CHECK (auth.uid() = clinician_user_id);