-- Add unit_preferences column to profiles table for cross-device persistence
ALTER TABLE public.profiles
ADD COLUMN unit_preferences jsonb DEFAULT '{"glucose": "mg/dL", "weight": "kg", "temperature": "°C"}'::jsonb;