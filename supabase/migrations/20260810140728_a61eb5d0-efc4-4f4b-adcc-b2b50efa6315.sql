-- 1. Basic patient identity always available to a connected clinician.
CREATE OR REPLACE FUNCTION public.get_patient_identity(patient_ids uuid[])
RETURNS TABLE(user_id uuid, name text, email text, phone_number text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.name, p.email, p.phone_number
  FROM public.profiles p
  WHERE p.user_id = ANY(patient_ids)
    AND auth.uid() IS NOT NULL
    AND (
      p.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.provider_shares ps
        WHERE ps.user_id = p.user_id
          AND ps.is_active = true
          AND (
            ps.clinician_user_id = auth.uid()
            OR ps.provider_email = public.get_current_user_email()
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.clinician_patient_records cpr
        WHERE cpr.linked_user_id = p.user_id
          AND cpr.clinician_user_id = auth.uid()
      )
    )
$$;

REVOKE ALL ON FUNCTION public.get_patient_identity(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_identity(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_patient_identity(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_patient_identity(uuid[]) TO service_role;

-- 2. Chat attachment storage: path is <patient_user_id>/<clinician_user_id>/<file>
CREATE POLICY "Chat participants can upload attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'message-attachments'
  AND array_length(storage.foldername(name), 1) >= 2
  AND auth.uid()::text IN ((storage.foldername(name))[1], (storage.foldername(name))[2])
);

CREATE POLICY "Chat participants can read attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND array_length(storage.foldername(name), 1) >= 2
  AND auth.uid()::text IN ((storage.foldername(name))[1], (storage.foldername(name))[2])
);

CREATE POLICY "Chat senders can delete their attachments"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND owner = auth.uid()
);

-- 3. Scribe fields on encounters.
ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS scribe_transcript text,
  ADD COLUMN IF NOT EXISTS scribe_audio_path text,
  ADD COLUMN IF NOT EXISTS scribe_draft jsonb,
  ADD COLUMN IF NOT EXISTS scribe_generated_at timestamptz;