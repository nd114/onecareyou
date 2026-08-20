-- A dictation that ends up somewhere.
--
-- The dictation surface recorded audio, transcribed it, summarised it — and
-- stopped. clinician_dictations has had a patient_user_id column since it was
-- created and nothing ever set it: the page files everything under a free-text
-- patient_label instead. So a clinician dictates the visit, approves a good
-- summary, and the record still has nothing in it. The work has to be typed
-- again into the encounter, which is the thing dictation was meant to avoid.
--
-- Two things were missing underneath. A dictation had no link to what it
-- became, and a clinician could not write an observation into the patient's
-- chart even when they had just taken it themselves.

-- ---------------------------------------------------------------------------
-- 1. What the dictation became
-- ---------------------------------------------------------------------------
ALTER TABLE public.clinician_dictations
  ADD COLUMN IF NOT EXISTS encounter_id uuid REFERENCES public.encounters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS filed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_clinician_dictations_encounter
  ON public.clinician_dictations(encounter_id) WHERE encounter_id IS NOT NULL;

COMMENT ON COLUMN public.clinician_dictations.encounter_id IS
  'The encounter this dictation was filed into. NULL means it is still loose — '
  'recorded and transcribed, but not yet part of any patient''s record.';

COMMENT ON COLUMN public.clinician_dictations.filed_at IS
  'When the clinician filed this dictation into the record, having reviewed what '
  'was extracted from it. Distinct from the approval timestamps, which cover the '
  'transcript and summary text alone.';

-- ---------------------------------------------------------------------------
-- 2. A clinician can record an observation they took
-- ---------------------------------------------------------------------------
-- vitals accepted INSERT only from `auth.uid() = user_id`, so a blood pressure
-- taken in the room could be read by the clinician and written by nobody but
-- the patient. Every clinical route into vitals — dictation, an in-clinic
-- reading, a device at the bedside — dead-ended here.
--
-- Add only. Correcting or removing a reading stays with the patient, the same
-- asymmetry documents got in 20260820100000: it is their record, and a
-- clinician who mis-recorded should add the correction, not erase the history.

ALTER TABLE public.vitals
  ADD COLUMN IF NOT EXISTS recorded_by_user_id uuid;

COMMENT ON COLUMN public.vitals.recorded_by_user_id IS
  'The clinician who recorded this reading on the patient''s behalf. NULL means the '
  'patient recorded it themselves, which is the overwhelming majority. Pairs with '
  'source, which says how rather than who.';

DROP POLICY IF EXISTS "Clinicians can record vitals for their patients" ON public.vitals;
CREATE POLICY "Clinicians can record vitals for their patients"
  ON public.vitals FOR INSERT TO authenticated
  WITH CHECK (
    recorded_by_user_id = auth.uid()
    AND user_id <> auth.uid()
    AND source = 'clinician'
    AND (
      public.clinician_has_patient_permission(user_id, 'vitals')
      OR public.institution_has_patient_permission(user_id, 'vitals')
    )
  );

COMMENT ON POLICY "Clinicians can record vitals for their patients" ON public.vitals IS
  'INSERT only, only for a patient who shares vitals with this clinician, and only '
  'attributed to the clinician doing it. Update and delete stay with the patient.';
