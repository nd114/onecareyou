-- Add onboarding tracking to clinician_profiles
ALTER TABLE public.clinician_profiles 
ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS onboarding_dismissed_at timestamptz,
ADD COLUMN IF NOT EXISTS onboarding_steps_completed jsonb DEFAULT '{"profile": false, "baa": false, "first_patient": false, "first_alert": false}'::jsonb;

-- Create index for quick onboarding queries
CREATE INDEX IF NOT EXISTS idx_clinician_profiles_onboarding 
ON public.clinician_profiles (user_id) 
WHERE onboarding_completed = false;