-- A patient can share their whole Health Vault with a clinician they invited.
--
-- The private sharing pathway offered four categories — vitals, medications,
-- adherence, profile — and no way to say anything about documents. Documents
-- were shareable only one at a time, through document_shares. That is the
-- stricter, better default and it stays the default; what was missing was the
-- other option, for the patient who wants their doctor to simply have the file
-- cabinet.
--
-- The institution pathway already works this way — practice_shares carries a
-- 'documents' permission read by institution_has_patient_permission — so this
-- makes the two pathways consistent rather than inventing a new mechanism.
--
-- Both routes now coexist deliberately:
--
--   * documents permission false (default) — the clinician sees only the
--     documents the patient has explicitly shared, exactly as before;
--   * documents permission true — the clinician sees the whole vault, and
--     individual document_shares become redundant rather than wrong.
--
-- Nothing is granted by this migration. Every existing share keeps the
-- permissions it already has, and a share with no 'documents' key reads as
-- false.

DROP POLICY IF EXISTS "Clinicians can view whole vault when granted" ON public.health_documents;
CREATE POLICY "Clinicians can view whole vault when granted"
  ON public.health_documents FOR SELECT
  TO authenticated
  USING (public.clinician_has_patient_permission(user_id, 'documents'));

COMMENT ON POLICY "Clinicians can view whole vault when granted" ON public.health_documents IS
  'Whole-vault access for a directly-invited clinician, only when the patient has switched the '
  'documents permission on. Per-document sharing through document_shares is unaffected and remains '
  'the default.';
