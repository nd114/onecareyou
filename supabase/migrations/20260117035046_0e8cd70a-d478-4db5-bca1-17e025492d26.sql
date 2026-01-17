-- Create storage bucket for lab report documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lab-reports', 
  'lab-reports', 
  false,
  10485760, -- 10MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
);

-- RLS policies for lab-reports bucket
CREATE POLICY "Users can upload their own lab reports"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'lab-reports' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own lab reports"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'lab-reports' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own lab reports"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'lab-reports' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);