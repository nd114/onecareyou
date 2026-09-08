-- A clinician can take back a document they filed to the wrong person.
--
-- Today they cannot. `health_documents` gives clinicians INSERT and nothing
-- else: a letter sent to the wrong Jane Evans sits in that patient's vault
-- permanently, readable by them and by everyone they have shared their vault
-- with, and the only person who can archive it is the person who should never
-- have had it. That is a live privacy incident with no remedy in the product.
--
-- Retraction, not deletion, and enforced where it cannot be ignored:
--
--   * **At the access layer.** The lesson of email recall is that asking a
--     client to forget does not work — a copy already delivered stays
--     delivered. A row policy is the only place a retraction can actually
--     bite, so retracted documents disappear from every SELECT path at once:
--     the owner's, the shared clinician's, the whole-vault reader's.
--
--   * **The row and the file survive.** Somebody has to be able to answer what
--     was disclosed, to whom, and for how long. Deleting the evidence of a
--     privacy incident is not a fix for the incident.
--
--   * **Visible absence, not a silent gap.** The patient is told a document was
--     withdrawn and by whom. A record that quietly changes shape is worse than
--     one that says something was taken out of it — and a patient who saw the
--     file before it went needs to know it was not theirs.
--
-- Who may retract: the person who filed it. Not the patient — they can archive,
-- which is tidying, and a retraction is an assertion that the document should
-- never have been there. Not any clinician with access, because "I can see it"
-- is not "I put it there".

ALTER TABLE public.health_documents
  ADD COLUMN IF NOT EXISTS retracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS retracted_by uuid,
  ADD COLUMN IF NOT EXISTS retraction_reason text;

COMMENT ON COLUMN public.health_documents.retracted_at IS
  'Set when the sender withdraws a document filed in error. The row and the file stay: somebody has to be able to answer what was disclosed and for how long.';

CREATE INDEX IF NOT EXISTS idx_health_documents_live
  ON public.health_documents(user_id, created_at DESC)
  WHERE retracted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Retracting
-- ---------------------------------------------------------------------------

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
    RETURN; -- Already withdrawn. Retracting twice is not an error.
  END IF;

  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Say why the document is being withdrawn';
  END IF;

  -- What the patient could already have seen. Retraction stops further access;
  -- it cannot unsee what was opened, and an incident record that implies
  -- otherwise is worse than none.
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
      -- The exposure window, stated rather than implied.
      'opened_before_retraction', v_views,
      'days_visible', GREATEST(0, EXTRACT(day FROM now() - v_doc.created_at))
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.retract_health_document(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retract_health_document(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.retract_health_document(uuid, text) IS
  'Withdraws a document filed in error. Sender only, reason required. Records how long it was visible and whether it was opened, because retraction stops further access and cannot unsee what was already read.';

-- ---------------------------------------------------------------------------
-- Where the retraction actually bites
-- ---------------------------------------------------------------------------
--
-- Three SELECT paths reach a document — the owner's, a per-document share, and
-- the two whole-vault readers. A retraction that only hid it from one of them
-- would be a retraction in name. Each is rewritten to exclude retracted rows,
-- and the owner's path is the one that matters most: the person holding
-- somebody else's letter is exactly who must stop seeing it.

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

-- ---------------------------------------------------------------------------
-- Telling the patient
-- ---------------------------------------------------------------------------
--
-- A vault that quietly loses a row is worse than one that says something was
-- taken out of it — and a patient who read the file before it went needs to
-- know it was not theirs. This view is the tombstone: no file name, no
-- content, just the fact, the date and who did it.

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

COMMENT ON VIEW public.my_retracted_documents IS
  'Documents withdrawn from a patient''s vault, without the content. The fact of the withdrawal belongs to the patient even though the document does not.';

GRANT SELECT ON public.my_retracted_documents TO authenticated;
