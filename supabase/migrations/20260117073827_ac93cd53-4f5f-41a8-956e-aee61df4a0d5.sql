-- Add a query for clinicians to find patients that have shared with their email
-- Create an index to speed up email-based lookups on provider_shares
CREATE INDEX IF NOT EXISTS idx_provider_shares_provider_email 
ON public.provider_shares (provider_email) 
WHERE provider_email IS NOT NULL;

-- Also add a field to track which clinician user_id has claimed a share
ALTER TABLE public.provider_shares 
ADD COLUMN IF NOT EXISTS clinician_user_id uuid REFERENCES auth.users(id);

-- Create index on clinician_user_id for efficient lookups
CREATE INDEX IF NOT EXISTS idx_provider_shares_clinician_user_id 
ON public.provider_shares (clinician_user_id) 
WHERE clinician_user_id IS NOT NULL;

-- Update RLS policies to allow clinicians to view shares associated with them
CREATE POLICY "Clinicians can view shares associated with their email or user_id"
ON public.provider_shares
FOR SELECT
USING (
  auth.uid() = user_id 
  OR auth.uid() = clinician_user_id 
  OR provider_email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- Allow clinicians to update shares to claim them
CREATE POLICY "Clinicians can claim shares matching their email"
ON public.provider_shares
FOR UPDATE
USING (
  provider_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  AND clinician_user_id IS NULL
);

-- Drop old restrictive policies that only allow user_id access
DROP POLICY IF EXISTS "Users can view their own shares" ON public.provider_shares;