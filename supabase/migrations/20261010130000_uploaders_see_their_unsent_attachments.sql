-- An uploader can see, and so delete, an attachment they uploaded but never
-- sent.
--
-- 20261010100000 narrowed reading a message attachment to the people who can
-- read the message it belongs to, plus the patient whose folder it sits in
-- (paths are <patient>/<clinician>/<file>). 20261010120000 then let an uploader
-- delete an attachment only while no message points at it. Together they left
-- a clinician unable to clear their own abandoned upload: with no message
-- behind it the read rule no longer showed it to them, and a row a caller
-- cannot see is a row their DELETE never reaches.
--
-- The addition is narrow: the owner of the object, and only while no message
-- refers to it. Once sent, reading follows the message again.

DROP POLICY IF EXISTS "Chat participants can read attachments" ON storage.objects;
CREATE POLICY "Chat participants can read attachments"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND array_length(storage.foldername(name), 1) >= 2
    AND NOT EXISTS (
      SELECT 1 FROM public.messages m
       WHERE m.attachment_path = objects.name
         AND m.attachment_retracted_at IS NOT NULL
    )
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1 FROM public.messages m
         WHERE m.attachment_path = objects.name
           AND public.message_readable_by_caller(m.patient_user_id, m.clinician_user_id, m.practice_id, m.created_at)
      )
      OR (owner = auth.uid() AND public.message_attachment_never_sent(name))
    )
  );
