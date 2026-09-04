-- Where a medication came from.
--
-- `vitals` has carried `source`, `external_id` and `ehr_connection_id` since
-- EHR import was first considered, and `useVitals` refuses to edit or delete a
-- reading that did not come from the patient. `medications` has none of that,
-- so an imported medication and one the patient typed are the same row and a
-- bad import can never be unwound — you would have to ask a person which ones
-- they recognised.
--
-- Added before medication import ships rather than after, because retrofitting
-- provenance means guessing about rows that already exist.

ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS ehr_connection_id UUID REFERENCES public.ehr_connections(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.medications.source IS
  'Who put this here. ''manual'' means the patient; anything else names the system it was '
  'imported from. Rows that are not manual are not the patient''s to edit.';

COMMENT ON COLUMN public.medications.external_id IS
  'The row''s id in the sending system, so a re-import updates rather than duplicates.';

-- Every existing row predates import, so it is the patient's own.
UPDATE public.medications SET source = 'manual' WHERE source IS NULL;

-- One row per medication per sending system. Without this a repeated import
-- silently doubles somebody's medication list, which is the failure mode that
-- matters most here: a duplicated dose looks like a real second prescription.
CREATE UNIQUE INDEX IF NOT EXISTS medications_external_identity_idx
  ON public.medications (user_id, ehr_connection_id, external_id)
  WHERE external_id IS NOT NULL AND ehr_connection_id IS NOT NULL;

-- The same shape vitals uses, so the two tables answer the question the same
-- way and a reader does not have to remember which is which.
CREATE INDEX IF NOT EXISTS medications_source_idx
  ON public.medications (user_id, source)
  WHERE source <> 'manual';