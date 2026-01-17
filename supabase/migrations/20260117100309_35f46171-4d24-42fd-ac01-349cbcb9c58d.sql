-- Add discontinuation columns to medications table
ALTER TABLE public.medications 
  ADD COLUMN discontinued_at timestamp with time zone,
  ADD COLUMN discontinuation_reason text;

-- Add weekly adherence report setting to profiles table
ALTER TABLE public.profiles 
  ADD COLUMN weekly_adherence_report_enabled boolean DEFAULT true;