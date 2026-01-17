-- Add notification preferences to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS push_notifications_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS email_notifications_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS push_subscription jsonb DEFAULT NULL;

-- Add notification preferences to clinician_profiles table
ALTER TABLE public.clinician_profiles
ADD COLUMN IF NOT EXISTS push_notifications_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS email_notifications_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS push_subscription jsonb DEFAULT NULL;