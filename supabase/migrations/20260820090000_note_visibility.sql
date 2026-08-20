-- Both kinds of note become entries, and the difference between them becomes
-- explicit.
--
-- There were two note surfaces on a patient record with nothing in their names
-- to say who each was for. "Notes" was a single free-text field on the share,
-- private to one clinician, saved as one blob — so a fortnight of observations
-- was one undated block of text with no way to add, amend or remove an entry.
-- "Internal" was a proper table of entries, shared with the care team.
--
-- The distinction that matters is who can read it, so that is what the column
-- records. A private note is visible only to the clinician who wrote it, even
-- to colleagues who can otherwise see everything about that patient; a team
-- note is visible to anyone with access, which is the existing behaviour and
-- stays the default.
--
-- Both are now rows, so both get the things entries have: a date, an author,
-- and the ability to change one without rewriting the rest.

ALTER TABLE public.internal_notes
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'team';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'internal_notes_visibility_check'
  ) THEN
    ALTER TABLE public.internal_notes
      ADD CONSTRAINT internal_notes_visibility_check
      CHECK (visibility IN ('team', 'private'));
  END IF;
END $$;

-- Reading: a team note follows patient access, a private note follows
-- authorship. Without the visibility clause every colleague with access to the
-- patient would read notes written to be private.
--
-- Both access pathways are kept. clinician_has_patient_access() reads
-- provider_shares only, so dropping institution_has_patient_access() would take
-- team notes away from every hospital-assigned patient — the exact population
-- team notes exist for. See 20260814234500, which added that branch.
DROP POLICY IF EXISTS "Clinicians read internal notes for accessible patients" ON public.internal_notes;
CREATE POLICY "Clinicians read internal notes for accessible patients"
  ON public.internal_notes FOR SELECT TO authenticated
  USING (
    (
      public.clinician_has_patient_access(patient_user_id)
      OR public.institution_has_patient_access(patient_user_id)
    )
    AND (visibility = 'team' OR author_user_id = auth.uid())
  );

COMMENT ON COLUMN public.internal_notes.visibility IS
  'team — anyone with access to this patient can read it (the default). '
  'private — only the clinician who wrote it, even from colleagues who can see everything else.';

-- Carry the old blobs over.
--
-- provider_shares.clinician_notes was where the private notes lived. Nothing
-- reads it after this change, so anything already written there would be lost
-- on screen while sitting in the table. Each non-empty blob becomes one private
-- entry, dated to when the share was last touched rather than pretending to a
-- precision the blob never had.
--
-- Written to be safe on replay: an identical entry for the same patient and
-- author is not inserted twice.
INSERT INTO public.internal_notes (patient_user_id, author_user_id, body, visibility, created_at, updated_at)
SELECT s.user_id, s.clinician_user_id, btrim(s.clinician_notes), 'private', s.created_at, s.created_at
  FROM public.provider_shares s
 WHERE s.clinician_user_id IS NOT NULL
   AND btrim(COALESCE(s.clinician_notes, '')) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM public.internal_notes n
      WHERE n.patient_user_id = s.user_id
        AND n.author_user_id = s.clinician_user_id
        AND n.visibility = 'private'
        AND n.body = btrim(s.clinician_notes)
   );

-- Kept rather than dropped: the backfill above is the only copy, and a column
-- with no readers costs nothing while it is verified in production. Nothing in
-- the application writes it any more.
COMMENT ON COLUMN public.provider_shares.clinician_notes IS
  'Retired — superseded by internal_notes with visibility = ''private'' (20260820090000). '
  'Backfilled, no longer read or written by the application. Safe to drop once verified.';
