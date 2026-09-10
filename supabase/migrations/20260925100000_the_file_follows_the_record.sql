-- The file follows the record
--
-- Three holes in the Vault, found by giving the local harness the storage
-- grants Supabase gives — without them every storage policy failed with
-- "permission denied for table objects" before any policy was consulted, so a
-- bucket wide open to the wrong reader looked exactly like one locked down.
--
-- 1. **A withdrawn document was still downloadable.** Withdrawal removed the
--    row from every read path and left the bytes reachable: the bucket policy
--    checked only that the file sat in the reader's own folder. Anyone holding
--    the path — the app had it a moment earlier — could still fetch it with a
--    signed URL. That is the central promise of the feature, and it was only
--    ever true of the row. The same check was already in place for chat
--    attachments; it was missing here.
--
-- 2. **A patient could hard-delete a document a clinician sent them**, row and
--    file. `useHealthDocuments` explains at length why archiving exists —
--    "a document a clinician has already been given should not be able to
--    vanish from under them" — and then exports a delete that does exactly
--    that, permitted by a DELETE policy with no condition beyond ownership.
--
-- 3. **A patient could delete or overwrite the file of a *withdrawn* document**,
--    which is the evidence of a disclosure somebody has to answer for.
--
-- The rule, in one place because it is needed in four:
--
--   A patient may remove a document only if they put it there themselves and
--   it has not been withdrawn. Anything a clinician filed is the clinic's
--   record of what it provided, and archiving is what the patient has instead.
--   Anything withdrawn belongs to an incident.

CREATE OR REPLACE FUNCTION public.document_is_withdrawn(_file_path text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.health_documents d
     WHERE d.file_path = _file_path
       AND d.retracted_at IS NOT NULL
  );
$function$;

COMMENT ON FUNCTION public.document_is_withdrawn(text) IS
  'Definer rights, and that is the whole point. A storage policy that inlines '
  '`NOT EXISTS (SELECT 1 FROM health_documents ...)` evaluates that subquery '
  'under the reader''s own row visibility — and a withdrawn row is invisible to '
  'them, so the check finds nothing and lets the file through. The first version '
  'of this migration did exactly that and leaked every withdrawn file it was '
  'written to stop.';

REVOKE ALL ON FUNCTION public.document_is_withdrawn(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_is_withdrawn(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_may_remove_document(_file_path text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM public.health_documents d
       WHERE d.file_path = _file_path
         AND (
           -- Somebody else filed it. Theirs to withdraw, not the reader's to
           -- destroy.
           d.uploaded_by_user_id IS NOT NULL
           -- Or it is already withdrawn, and the file is incident evidence.
           OR d.retracted_at IS NOT NULL
         )
    )
    END;
$function$;

COMMENT ON FUNCTION public.owner_may_remove_document(text) IS
  'True when the signed-in owner may delete or replace the file at this path: '
  'only their own upload, and only while it stands. A file with no row at all '
  'is removable — an upload whose row insert failed would otherwise be '
  'unreachable rubbish nobody could clear.';

REVOKE ALL ON FUNCTION public.owner_may_remove_document(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_may_remove_document(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Reading: a withdrawn file leaves storage too
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view their own health documents" ON storage.objects;
CREATE POLICY "Users can view their own health documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'health-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND NOT public.document_is_withdrawn(name)
);

COMMENT ON POLICY "Users can view their own health documents" ON storage.objects IS
  'The owner''s own folder, minus anything withdrawn. Checked here because '
  'storage issues the signed URL: hiding the row alone leaves the file one '
  'direct request away for anyone who kept the path.';

-- The clinician's read path already goes through document_shares; withdrawn
-- documents leave it because the row-level policies exclude them. Restated
-- here so the bucket does not become the one place it is not true.
DROP POLICY IF EXISTS "Clinicians can view shared health documents" ON storage.objects;
CREATE POLICY "Clinicians can view shared health documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'health-documents'
  AND EXISTS (
    SELECT 1
      FROM public.health_documents hd
      JOIN public.document_shares ds ON ds.document_id = hd.id
      JOIN public.provider_shares ps ON ps.id = ds.provider_share_id
     WHERE hd.file_path = storage.objects.name
       AND hd.retracted_at IS NULL
       AND ds.is_active = true
       AND ps.is_active = true
       AND (ps.expires_at IS NULL OR ps.expires_at > now())
       AND (ps.clinician_user_id = auth.uid() OR ps.provider_email = public.get_current_user_email())
  )
);

-- ---------------------------------------------------------------------------
-- Removing and replacing
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can delete their own health documents" ON storage.objects;
CREATE POLICY "Users can delete their own health documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'health-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND public.owner_may_remove_document(name)
);

DROP POLICY IF EXISTS "Users can update their own health documents" ON storage.objects;
CREATE POLICY "Users can update their own health documents"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'health-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND public.owner_may_remove_document(name)
);

COMMENT ON POLICY "Users can update their own health documents" ON storage.objects IS
  'Overwriting a file is removing it and putting another in its place, so it '
  'follows the same rule. Without this a patient could replace the contents of '
  'a letter a clinician sent while the row still says what it was.';

-- ---------------------------------------------------------------------------
-- And the row itself
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can delete their own documents" ON public.health_documents;
-- Idempotent against a re-sync that already created this exact
-- policy name (Supabase re-exports applied migrations under its
-- own real timestamps, which can sort before this file).
DROP POLICY IF EXISTS "Patients delete only documents they filed themselves" ON public.health_documents;
CREATE POLICY "Patients delete only documents they filed themselves"
  ON public.health_documents FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND uploaded_by_user_id IS NULL
    AND retracted_at IS NULL
  );

COMMENT ON POLICY "Patients delete only documents they filed themselves" ON public.health_documents IS
  'Archiving is what a patient has for everything else. A document a clinician '
  'filed is the clinic''s record of what it provided and cannot vanish from '
  'under them; a withdrawn one is the subject of an incident somebody has to be '
  'able to answer for.';

-- ---------------------------------------------------------------------------
-- Lab reports are the same documents in a different bucket
-- ---------------------------------------------------------------------------
--
-- `health_documents.file_path` can point at `lab-reports`, and its policies had
-- the identical shape — owner folder, no mention of withdrawal. Withdrawing a
-- misfiled lab report hid the row and left the PDF downloadable.

DROP POLICY IF EXISTS "Users can view their own lab reports" ON storage.objects;
CREATE POLICY "Users can view their own lab reports"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'lab-reports'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND NOT public.document_is_withdrawn(name)
);

DROP POLICY IF EXISTS "Clinicians can view shared lab reports" ON storage.objects;
CREATE POLICY "Clinicians can view shared lab reports"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'lab-reports'
  AND EXISTS (
    SELECT 1
      FROM public.health_documents hd
      JOIN public.document_shares ds ON ds.document_id = hd.id
      JOIN public.provider_shares ps ON ps.id = ds.provider_share_id
     WHERE hd.file_path = storage.objects.name
       AND hd.retracted_at IS NULL
       AND ds.is_active = true
       AND ps.is_active = true
       AND (ps.expires_at IS NULL OR ps.expires_at > now())
       AND (ps.clinician_user_id = auth.uid() OR ps.provider_email = public.get_current_user_email())
  )
);
