-- Add avatar fields to profiles table for patient avatars
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS avatar_url text,
ADD COLUMN IF NOT EXISTS avatar_shared_with_clinicians boolean DEFAULT false;

-- Create patient-avatars storage bucket (private bucket)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('patient-avatars', 'patient-avatars', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for patient avatars bucket

-- Users can upload their own avatar
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'patient-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can update their own avatar
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'patient-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can delete their own avatar
CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'patient-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can view their own avatar
CREATE POLICY "Users can view their own avatar"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'patient-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Clinicians can view patient avatars if the patient has shared AND has an active provider share
CREATE POLICY "Clinicians can view shared patient avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'patient-avatars' 
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.provider_shares ps ON p.user_id = ps.user_id
    WHERE p.avatar_shared_with_clinicians = true
    AND ps.clinician_user_id = auth.uid()
    AND ps.is_active = true
    AND (ps.expires_at IS NULL OR ps.expires_at > now())
    AND (storage.foldername(name))[1] = p.user_id::text
  )
);