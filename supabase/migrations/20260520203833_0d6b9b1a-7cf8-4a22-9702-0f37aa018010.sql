-- Add WhatsApp transport scaffolding to messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS transport TEXT NOT NULL DEFAULT 'in-app',
  ADD COLUMN IF NOT EXISTS external_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_external_message_id
  ON public.messages(external_message_id)
  WHERE external_message_id IS NOT NULL;

-- Onboarding resume support: persist last completed step
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_last_step INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_skipped BOOLEAN NOT NULL DEFAULT false;