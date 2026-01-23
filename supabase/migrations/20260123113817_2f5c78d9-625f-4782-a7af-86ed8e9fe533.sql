-- Add first_name and last_name columns to clinician_profiles
ALTER TABLE public.clinician_profiles
ADD COLUMN first_name TEXT,
ADD COLUMN last_name TEXT;