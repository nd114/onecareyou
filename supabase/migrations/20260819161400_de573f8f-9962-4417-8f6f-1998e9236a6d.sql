ALTER TABLE public.health_documents ADD COLUMN IF NOT EXISTS folder text;
CREATE INDEX IF NOT EXISTS health_documents_folder_idx ON public.health_documents (user_id, folder);