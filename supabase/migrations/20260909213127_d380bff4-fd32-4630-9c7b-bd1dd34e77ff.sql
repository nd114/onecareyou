DROP POLICY IF EXISTS "Clinicians can view whole vault when granted" ON public.health_documents;
CREATE POLICY "Clinicians can view whole vault when granted"
  ON public.health_documents FOR SELECT TO authenticated
  USING (
    archived_at IS NULL
    AND coalesce(source_context, '') <> 'patient_recording'
    AND public.clinician_has_patient_permission(user_id, 'documents')
  );

DROP POLICY IF EXISTS "Institution team can view shared documents" ON public.health_documents;
CREATE POLICY "Institution team can view shared documents"
  ON public.health_documents FOR SELECT TO authenticated
  USING (
    archived_at IS NULL
    AND coalesce(source_context, '') <> 'patient_recording'
    AND public.institution_has_patient_permission(user_id, 'documents')
  );

COMMENT ON COLUMN public.health_documents.source_context IS
  'How the document got here. ''patient_recording'' marks the audio and transcript of a '
  'consultation the patient recorded themselves; those are excluded from whole-vault sharing and '
  'can only be shared one at a time.';