ALTER TABLE public.health_documents
  ADD COLUMN IF NOT EXISTS retracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS retracted_by uuid,
  ADD COLUMN IF NOT EXISTS retraction_reason text;

COMMENT ON COLUMN public.health_documents.retracted_at IS
  'Set when the sender withdraws a document filed in error. The row and the file stay.';

CREATE INDEX IF NOT EXISTS idx_health_documents_live
  ON public.health_documents(user_id, created_at DESC)
  WHERE retracted_at IS NULL;

CREATE OR REPLACE FUNCTION public.retract_health_document(
  _document_id uuid,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_doc public.health_documents%ROWTYPE;
  v_views integer;
BEGIN
  SELECT * INTO v_doc FROM public.health_documents WHERE id = _document_id;
  IF v_doc.id IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  IF v_doc.uploaded_by_user_id IS NULL OR v_doc.uploaded_by_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the person who filed a document can withdraw it';
  END IF;

  IF v_doc.retracted_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Say why the document is being withdrawn';
  END IF;

  SELECT count(*) INTO v_views
    FROM public.hipaa_audit_logs
   WHERE resource_type = 'health_document'
     AND resource_id = _document_id::text
     AND action IN ('view_document', 'download_document');

  UPDATE public.health_documents
     SET retracted_at = now(),
         retracted_by = auth.uid(),
         retraction_reason = btrim(_reason)
   WHERE id = _document_id;

  INSERT INTO public.hipaa_audit_logs (
    user_id, action, resource_type, resource_id, patient_user_id, details
  ) VALUES (
    auth.uid(),
    'document_retracted',
    'health_document',
    _document_id::text,
    v_doc.user_id,
    jsonb_build_object(
      'file_name', v_doc.file_name,
      'category', v_doc.category,
      'filed_at', v_doc.created_at,
      'reason', btrim(_reason),
      'opened_before_retraction', v_views,
      'days_visible', GREATEST(0, EXTRACT(day FROM now() - v_doc.created_at))
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.retract_health_document(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retract_health_document(uuid, text) TO authenticated;

DROP POLICY IF EXISTS "Users and shared clinicians can view documents" ON public.health_documents;
CREATE POLICY "Users and shared clinicians can view documents"
  ON public.health_documents FOR SELECT
  USING (
    retracted_at IS NULL
    AND (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1
        FROM public.document_shares ds
        JOIN public.provider_shares ps ON ds.provider_share_id = ps.id
        WHERE ds.document_id = health_documents.id
          AND ds.is_active = true
          AND ps.is_active = true
          AND (ps.expires_at IS NULL OR ps.expires_at > now())
          AND (ps.clinician_user_id = auth.uid() OR ps.provider_email = public.get_current_user_email())
      )
    )
  );

DROP POLICY IF EXISTS "Clinicians can view whole vault when granted" ON public.health_documents;
CREATE POLICY "Clinicians can view whole vault when granted"
  ON public.health_documents FOR SELECT
  USING (
    retracted_at IS NULL
    AND archived_at IS NULL
    AND COALESCE(source_context, '') <> 'patient_recording'
    AND public.clinician_has_patient_permission(user_id, 'documents')
  );

DROP POLICY IF EXISTS "Institution team can view shared documents" ON public.health_documents;
CREATE POLICY "Institution team can view shared documents"
  ON public.health_documents FOR SELECT
  USING (
    retracted_at IS NULL
    AND archived_at IS NULL
    AND COALESCE(source_context, '') <> 'patient_recording'
    AND public.institution_has_patient_permission(user_id, 'documents')
  );

CREATE OR REPLACE VIEW public.my_retracted_documents AS
  SELECT
    d.id,
    d.user_id,
    d.created_at AS filed_at,
    d.retracted_at,
    d.retraction_reason,
    d.category
  FROM public.health_documents d
  WHERE d.retracted_at IS NOT NULL
    AND d.user_id = auth.uid();

GRANT SELECT ON public.my_retracted_documents TO authenticated;