-- Archiving a Vault document.
--
-- The Vault had no way to tidy anything: `useHealthDocuments` carried a delete
-- mutation the page never called, so a patient could upload but never put
-- anything away. Delete is the wrong answer here — a document a clinician has
-- already seen, or that is cited in a shared record, should not be able to
-- vanish from under them — so this is archive, which is reversible and leaves
-- the row and the file exactly where they are.
--
-- What archiving means, precisely:
--   * the document leaves the patient's default view
--   * it stops being included in whole-Vault sharing
--   * it remains readable through any share that already names it explicitly,
--     because withdrawing a specific document is what un-sharing is for
--   * it can be restored, and nothing is destroyed

ALTER TABLE public.health_documents
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;

COMMENT ON COLUMN public.health_documents.archived_at IS
  'When the patient put this document away. Null means active. Archiving is reversible and destroys nothing.';

-- Partial index: the common query is "my active documents", and a partial
-- index keeps that cheap without paying for the archived rows.
CREATE INDEX IF NOT EXISTS health_documents_active_idx
  ON public.health_documents (user_id, created_at DESC)
  WHERE archived_at IS NULL;

-- Reason is free text but bounded, so an open text field cannot be used as
-- storage. Null is fine — most people will not give one.
ALTER TABLE public.health_documents
  DROP CONSTRAINT IF EXISTS health_documents_archived_reason_length;
ALTER TABLE public.health_documents
  ADD CONSTRAINT health_documents_archived_reason_length
  CHECK (archived_reason IS NULL OR char_length(archived_reason) <= 500);

-- A reason without an archive date is a contradiction: it would read as a
-- reason for archiving something that is not archived.
ALTER TABLE public.health_documents
  DROP CONSTRAINT IF EXISTS health_documents_archived_reason_needs_date;
ALTER TABLE public.health_documents
  ADD CONSTRAINT health_documents_archived_reason_needs_date
  CHECK (archived_reason IS NULL OR archived_at IS NOT NULL);

-- ---------------------------------------------------------------------------
-- Whole-Vault sharing must not include archived documents.
--
-- The share permission `documents` grants a clinician the whole Vault. An
-- archived document is one the patient has put away, so it drops out of that
-- grant. A document shared individually through document_shares is unaffected:
-- that is an explicit act about one file, and undoing it is what removing the
-- share is for.
-- ---------------------------------------------------------------------------
-- Two policies grant the whole Vault. Both now stop at an archived document.
--
-- The third path — a document shared one at a time through document_shares —
-- is deliberately untouched. Archiving is the patient tidying their own shelf;
-- withdrawing a file somebody was explicitly given is a different act, and the
-- control for it is removing that share.

DROP POLICY IF EXISTS "Clinicians can view whole vault when granted" ON public.health_documents;
CREATE POLICY "Clinicians can view whole vault when granted"
  ON public.health_documents FOR SELECT
  TO authenticated
  USING (
    archived_at IS NULL
    AND public.clinician_has_patient_permission(user_id, 'documents')
  );

COMMENT ON POLICY "Clinicians can view whole vault when granted" ON public.health_documents IS
  'Whole-vault access for a directly-invited clinician, only when the patient has switched the '
  'documents permission on, and only for documents the patient has not archived. Per-document '
  'sharing through document_shares is unaffected and remains the default.';

DROP POLICY IF EXISTS "Institution team can view shared documents" ON public.health_documents;
CREATE POLICY "Institution team can view shared documents"
  ON public.health_documents FOR SELECT
  TO authenticated
  USING (
    archived_at IS NULL
    AND public.institution_has_patient_permission(user_id, 'documents')
  );

COMMENT ON POLICY "Institution team can view shared documents" ON public.health_documents IS
  'Whole-vault access for an institution the patient shared with, excluding documents the patient '
  'has archived.';
