ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS simple_mode boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.simple_mode IS
  'Patient prefers the simplified surface: larger type, fewer choices per screen. Offered at '
  'onboarding and changeable in Settings. Set by the patient (or their caregiver) only — never '
  'inferred, and never set on their behalf by a clinician.';

ALTER TABLE public.health_documents
  ADD COLUMN IF NOT EXISTS folder text;

COMMENT ON COLUMN public.health_documents.folder IS
  'Optional folder the patient filed this document under in their Vault. Null means unfiled.';