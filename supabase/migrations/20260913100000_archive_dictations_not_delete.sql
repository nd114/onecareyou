-- A dictation that reached a patient's record is a legal record.
--
-- The dictations page offered one destructive control and it was a hard DELETE
-- of the row plus the audio object. For a dictation with status 'filed' that is
-- a clinical note removed from the chart with nothing left behind — no row, no
-- audio, no trace that it ever existed. The repository's own rule is that
-- nothing is hard-deleted where there is a legal record, and this broke it in
-- the one place the record is created.
--
-- Archiving replaces deletion. The row stays, the audio stays, and the page
-- stops showing it. Whether the audio can be aged out after filing is a
-- retention decision for the practice, not something a delete button should
-- settle on a clinician's behalf.

ALTER TABLE public.clinician_dictations
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

COMMENT ON COLUMN public.clinician_dictations.archived_at IS
  'Set when the clinician archives the dictation. Nothing is deleted: a filed dictation is part of a patient record.';

-- The status vocabulary gains nothing here on purpose. Archiving is orthogonal
-- to where a dictation got to — a clinician can archive an errored one and a
-- filed one, and the status still says which it was.

CREATE INDEX IF NOT EXISTS idx_clinician_dictations_active
  ON public.clinician_dictations(clinician_user_id, created_at DESC)
  WHERE archived_at IS NULL;

-- The delete policy allowed a clinician to remove a filed dictation outright.
-- Taking the button away is a convention; this is the rule. A dictation that
-- never reached a record can still be deleted — a misfire, a test, a recording
-- of an empty room — but once it has been filed it is part of a chart.
DROP POLICY IF EXISTS "Clinicians delete own dictations" ON public.clinician_dictations;

-- Idempotent against a re-sync that already created this exact
-- policy name (Supabase re-exports applied migrations under its
-- own real timestamps, which can sort before this file).
DROP POLICY IF EXISTS "Clinicians delete own unfiled dictations" ON public.clinician_dictations;
CREATE POLICY "Clinicians delete own unfiled dictations"
  ON public.clinician_dictations FOR DELETE
  USING (
    auth.uid() = clinician_user_id
    AND status <> 'filed'
    AND filed_at IS NULL
    AND summary_approved_at IS NULL
  );
