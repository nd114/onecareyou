-- Add clinician_notes column to provider_shares for private clinician notes about patients
ALTER TABLE public.provider_shares 
ADD COLUMN clinician_notes TEXT DEFAULT NULL;

-- Add comment explaining this field
COMMENT ON COLUMN public.provider_shares.clinician_notes IS 'Private notes from the clinician about this patient. Only visible to the clinician.';