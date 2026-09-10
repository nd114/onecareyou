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
           d.uploaded_by_user_id IS NOT NULL
           OR d.retracted_at IS NOT NULL
         )
    )
    END;
$function$;

REVOKE ALL ON FUNCTION public.owner_may_remove_document(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_may_remove_document(text) TO authenticated;

DROP POLICY IF EXISTS "Users can view their own health documents" ON storage.objects;
CREATE POLICY "Users can view their own health documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'health-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND NOT public.document_is_withdrawn(name)
);

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

DROP POLICY IF EXISTS "Users can delete their own documents" ON public.health_documents;
DROP POLICY IF EXISTS "Patients delete only documents they filed themselves" ON public.health_documents;
CREATE POLICY "Patients delete only documents they filed themselves"
  ON public.health_documents FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND uploaded_by_user_id IS NULL
    AND retracted_at IS NULL
  );

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