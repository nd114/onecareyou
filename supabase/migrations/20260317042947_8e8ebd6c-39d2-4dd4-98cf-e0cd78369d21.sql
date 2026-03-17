
-- Create health_documents table
CREATE TABLE public.health_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  family_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  tags JSONB DEFAULT '[]'::jsonb,
  title TEXT,
  notes TEXT,
  ai_summary TEXT,
  ai_category TEXT,
  ai_tags JSONB,
  document_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.health_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own documents"
ON public.health_documents FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can upload their own documents"
ON public.health_documents FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents"
ON public.health_documents FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents"
ON public.health_documents FOR DELETE
USING (auth.uid() = user_id);

-- Clinicians can view shared patient documents with permission
CREATE POLICY "Clinicians can view shared patient documents"
ON public.health_documents FOR SELECT
USING (clinician_has_patient_permission(user_id, 'profile'));

-- Updated at trigger
CREATE TRIGGER update_health_documents_updated_at
BEFORE UPDATE ON public.health_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for health documents
INSERT INTO storage.buckets (id, name, public) VALUES ('health-documents', 'health-documents', false);

-- Storage policies
CREATE POLICY "Users can upload their own health documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'health-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own health documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'health-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own health documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'health-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Enable realtime for health_documents
ALTER PUBLICATION supabase_realtime ADD TABLE public.health_documents;
