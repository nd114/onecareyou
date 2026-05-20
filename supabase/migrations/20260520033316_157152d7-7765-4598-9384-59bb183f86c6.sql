
ALTER TABLE public.health_documents
  ADD COLUMN IF NOT EXISTS patient_friendly_explanation text;
