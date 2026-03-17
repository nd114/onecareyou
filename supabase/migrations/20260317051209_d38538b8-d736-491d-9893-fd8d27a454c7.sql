
-- Task 1: Add missing UPDATE storage policy for health-documents bucket
CREATE POLICY "Users can update their own health documents"
ON storage.objects FOR UPDATE
USING (bucket_id = 'health-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Task 4: Add source tracking column
ALTER TABLE public.health_documents ADD COLUMN source_context text NOT NULL DEFAULT 'direct';
