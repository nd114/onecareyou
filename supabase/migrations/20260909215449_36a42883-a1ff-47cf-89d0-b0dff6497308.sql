ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_actions_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_actions_consent_updated_at timestamptz;