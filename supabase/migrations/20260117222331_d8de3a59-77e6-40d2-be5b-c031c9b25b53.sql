-- Add title prefix and avatar to clinician_profiles
ALTER TABLE public.clinician_profiles 
ADD COLUMN title text DEFAULT 'Dr.',
ADD COLUMN avatar_url text;

-- Create storage bucket for clinician avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('clinician-avatars', 'clinician-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Allow clinicians to upload their own avatar
CREATE POLICY "Clinicians can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'clinician-avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow clinicians to update their own avatar
CREATE POLICY "Clinicians can update their own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'clinician-avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow clinicians to delete their own avatar
CREATE POLICY "Clinicians can delete their own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'clinician-avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow public read access to clinician avatars
CREATE POLICY "Clinician avatars are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'clinician-avatars');