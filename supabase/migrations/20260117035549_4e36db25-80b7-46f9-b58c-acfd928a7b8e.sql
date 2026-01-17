-- Add AI consent tracking to profiles
ALTER TABLE public.profiles 
ADD COLUMN ai_processing_consent BOOLEAN DEFAULT false,
ADD COLUMN ai_consent_updated_at TIMESTAMP WITH TIME ZONE;

-- Create consent audit log table for liability tracking
CREATE TABLE public.consent_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  action TEXT NOT NULL, -- 'granted', 'revoked', 'viewed'
  previous_value BOOLEAN,
  new_value BOOLEAN,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create legal documents table for versioning
CREATE TABLE public.legal_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL, -- 'privacy_policy', 'terms_of_service', 'data_processing'
  version TEXT NOT NULL,
  content TEXT NOT NULL,
  effective_date DATE NOT NULL,
  is_current BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user legal acceptance tracking
CREATE TABLE public.legal_acceptances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.legal_documents(id),
  accepted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT
);

-- Enable RLS
ALTER TABLE public.consent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

-- RLS for consent_logs (users can only view their own logs)
CREATE POLICY "Users can view their own consent logs"
ON public.consent_logs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own consent logs"
ON public.consent_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- RLS for legal_documents (everyone can read current documents)
CREATE POLICY "Anyone can view current legal documents"
ON public.legal_documents FOR SELECT
USING (is_current = true);

-- RLS for legal_acceptances
CREATE POLICY "Users can view their own acceptances"
ON public.legal_acceptances FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own acceptances"
ON public.legal_acceptances FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_consent_logs_user_id ON public.consent_logs(user_id);
CREATE INDEX idx_consent_logs_created_at ON public.consent_logs(created_at);
CREATE INDEX idx_legal_documents_type_current ON public.legal_documents(type, is_current);
CREATE INDEX idx_legal_acceptances_user_id ON public.legal_acceptances(user_id);

-- Insert initial legal documents
INSERT INTO public.legal_documents (type, version, content, effective_date, is_current) VALUES
('privacy_policy', '1.0', 'See /privacy for full content', CURRENT_DATE, true),
('terms_of_service', '1.0', 'See /terms for full content', CURRENT_DATE, true),
('data_processing', '1.0', 'See /data-processing for full content', CURRENT_DATE, true);