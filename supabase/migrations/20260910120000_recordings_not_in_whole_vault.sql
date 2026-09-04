-- A whole-vault share must not hand over the patient's own recordings.
--
-- `patient_recordings` deliberately has no clinician policy, and
-- docs/patient-recordings.md says a clinician gets a recording only if the
-- patient shares that Vault document. The consent notice the patient
-- acknowledges before every recording says: "Nobody else sees them unless you
-- choose to share them — not the clinician you recorded, and not us."
--
-- The database did something else. The audio and transcript are ordinary
-- `health_documents` rows, and "Clinicians can view whole vault when granted"
-- and "Institution team can view shared documents" reach every non-archived
-- row. So a patient who had turned on whole-vault sharing had, without being
-- told, handed over every recording they had ever made.
--
-- The specific harm is worth naming, because it is not the general one. A
-- recording of a consultation with one clinician becoming visible to a
-- different clinician means the second hears what the first said, and hears
-- the patient's own unguarded words in a room they believed was private. That
-- is not something a permission granted months earlier, for documents, can be
-- read as covering.
--
-- So recordings are excluded from whole-vault sharing. They remain shareable
-- one at a time through `document_shares`, which is the deliberate act the
-- notice actually describes — the patient picks that recording, for that
-- person, today.

DROP POLICY IF EXISTS "Clinicians can view whole vault when granted" ON public.health_documents;
CREATE POLICY "Clinicians can view whole vault when granted"
  ON public.health_documents FOR SELECT TO authenticated
  USING (
    archived_at IS NULL
    -- A recording is the patient's own note of a conversation, not a document
    -- somebody filed. Whole-vault access is for the latter.
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

-- "Users and shared clinicians can view documents" is untouched: it is the
-- per-document path, and sharing one recording deliberately is exactly what
-- the patient was told they could do.

COMMENT ON COLUMN public.health_documents.source_context IS
  'How the document got here. ''patient_recording'' marks the audio and transcript of a '
  'consultation the patient recorded themselves; those are excluded from whole-vault sharing and '
  'can only be shared one at a time, because a permission granted for documents cannot be read as '
  'covering a private conversation.';
