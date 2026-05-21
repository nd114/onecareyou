
-- ============================================================
-- AI Conversations + Messages (Simple Mode + Assistant logging)
-- ============================================================

CREATE TABLE public.ai_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source TEXT NOT NULL DEFAULT 'simple_mode',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  message_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_conversations_user ON public.ai_conversations(user_id, started_at DESC);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own conversations"
  ON public.ai_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users create own conversations"
  ON public.ai_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own conversations"
  ON public.ai_conversations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own conversations"
  ON public.ai_conversations FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_ai_conversations_updated
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ai_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  input_modality TEXT NOT NULL DEFAULT 'text' CHECK (input_modality IN ('text','voice','image_ocr')),
  audio_path TEXT,
  image_path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_messages_conversation ON public.ai_messages(conversation_id, created_at);
CREATE INDEX idx_ai_messages_user ON public.ai_messages(user_id, created_at DESC);

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ai messages"
  ON public.ai_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users create own ai messages"
  ON public.ai_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own ai messages"
  ON public.ai_messages FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- Clinician Dictations
-- ============================================================

CREATE TABLE public.clinician_dictations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinician_user_id UUID NOT NULL,
  patient_user_id UUID,
  patient_label TEXT,
  audio_path TEXT NOT NULL,
  duration_seconds INTEGER,
  transcript TEXT,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending_transcription'
    CHECK (status IN ('pending_transcription','transcribed','transcript_approved','summary_approved','filed','error')),
  transcript_approved_at TIMESTAMPTZ,
  transcript_approved_by UUID,
  summary_approved_at TIMESTAMPTZ,
  summary_approved_by UUID,
  bulk_approved BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clinician_dictations_owner ON public.clinician_dictations(clinician_user_id, created_at DESC);
CREATE INDEX idx_clinician_dictations_status ON public.clinician_dictations(clinician_user_id, status);

ALTER TABLE public.clinician_dictations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinicians view own dictations"
  ON public.clinician_dictations FOR SELECT
  USING (auth.uid() = clinician_user_id);

CREATE POLICY "Clinicians create own dictations"
  ON public.clinician_dictations FOR INSERT
  WITH CHECK (auth.uid() = clinician_user_id);

CREATE POLICY "Clinicians update own dictations"
  ON public.clinician_dictations FOR UPDATE
  USING (auth.uid() = clinician_user_id);

CREATE POLICY "Clinicians delete own dictations"
  ON public.clinician_dictations FOR DELETE
  USING (auth.uid() = clinician_user_id);

CREATE TRIGGER trg_clinician_dictations_updated
  BEFORE UPDATE ON public.clinician_dictations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Storage buckets (private) + policies
-- ============================================================

INSERT INTO storage.buckets (id, name, public) VALUES
  ('voice-notes', 'voice-notes', false),
  ('simple-mode-images', 'simple-mode-images', false),
  ('clinician-dictations', 'clinician-dictations', false)
ON CONFLICT (id) DO NOTHING;

-- voice-notes: owner only (path prefix = user_id)
CREATE POLICY "Voice notes owner read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'voice-notes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Voice notes owner insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'voice-notes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Voice notes owner delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'voice-notes' AND auth.uid()::text = (storage.foldername(name))[1]);

-- simple-mode-images
CREATE POLICY "Simple mode images owner read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'simple-mode-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Simple mode images owner insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'simple-mode-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Simple mode images owner delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'simple-mode-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- clinician-dictations: owner clinician only
CREATE POLICY "Clinician dictations owner read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'clinician-dictations' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Clinician dictations owner insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'clinician-dictations' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Clinician dictations owner delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'clinician-dictations' AND auth.uid()::text = (storage.foldername(name))[1]);
