-- What the doctor wrote down, reaching the person it is about.
--
-- Two gaps, one idea. A clinician records an encounter and can hand the patient
-- nothing: no visit summary, and no way to put a referral letter or a lab
-- request into their Vault. Both are things the clinician makes *for* the
-- patient that stopped at the clinician's screen.
--
-- =============================================================================
-- 1. Visit summaries
-- =============================================================================
-- The encounters table already had a patient-facing policy:
--
--   CREATE POLICY "Patients view their encounters"
--     ON public.encounters FOR SELECT USING (patient_user_id = auth.uid());
--
-- Nothing in the app used it, which is the only reason it never mattered. RLS
-- is row-level, so that policy handed the patient every column of every row —
-- including encounters still being written, and including scribe_transcript,
-- the raw ambient-recording transcript, which is working material rather than
-- record and can carry anything said in the room. A patient could have watched
-- a note being typed.
--
-- Replaced by a function returning the summary, for finished notes only.

ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS shared_with_patient boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.encounters.shared_with_patient IS
  'Whether the patient may read this visit summary once signed. Defaults true — '
  'open notes are the norm and in some jurisdictions the law. The clinician can '
  'withhold a specific note, which is a decision they make deliberately rather '
  'than a default that quietly hides the record.';

-- The broad row policy goes. A patient reading their own record is a right, but
-- it is a right to the record, not to the drafts and raw material behind it,
-- and a row policy cannot draw that line. my_visit_summaries() draws it.
DROP POLICY IF EXISTS "Patients view their encounters" ON public.encounters;

CREATE OR REPLACE FUNCTION public.my_visit_summaries()
RETURNS TABLE(
  id uuid,
  occurred_at timestamptz,
  visit_type text,
  status text,
  chief_complaint text,
  subjective text,
  objective text,
  assessment text,
  plan text,
  follow_up_in_days integer,
  signed_at timestamptz,
  clinician_name text,
  practice_name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id, e.occurred_at, e.visit_type, e.status,
    e.chief_complaint, e.subjective, e.objective, e.assessment, e.plan,
    e.follow_up_in_days, e.signed_at,
    NULLIF(btrim(COALESCE(cp.title,'') || ' ' || COALESCE(cp.first_name,'') || ' ' || COALESCE(cp.last_name,'')), ''),
    pr.name
  FROM public.encounters e
  LEFT JOIN public.clinician_profiles cp ON cp.user_id = e.clinician_user_id
  LEFT JOIN public.practices pr ON pr.id = e.practice_id
  WHERE e.patient_user_id = auth.uid()
    AND auth.uid() IS NOT NULL
    AND e.status IN ('signed', 'amended')
    AND e.shared_with_patient
  ORDER BY e.occurred_at DESC;
$$;

COMMENT ON FUNCTION public.my_visit_summaries() IS
  'The caller''s own visit summaries: signed notes the clinician shared, and only the '
  'columns that are a summary. Deliberately omits scribe_transcript, scribe_audio_path, '
  'scribe_draft (raw ambient-recording material), cpt_codes and icd_codes (billing), and '
  'metadata. Replaces a row policy that could not restrict columns — see 20260820100000.';

REVOKE ALL ON FUNCTION public.my_visit_summaries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_visit_summaries() TO authenticated;

-- =============================================================================
-- 2. A clinician can put a document in the patient's Vault
-- =============================================================================
-- health_documents accepted INSERT only from `auth.uid() = user_id`, so a
-- referral letter or a lab request had no route to the patient at all — the
-- clinician had to email it outside the platform, which is the thing the Vault
-- exists to stop.
--
-- The clinician may add, and nothing else. Update and delete stay with the
-- patient: it lands in their record and it is theirs from that moment.

ALTER TABLE public.health_documents
  ADD COLUMN IF NOT EXISTS uploaded_by_user_id uuid;

COMMENT ON COLUMN public.health_documents.uploaded_by_user_id IS
  'The clinician who placed this document in the patient''s Vault. NULL means the '
  'patient uploaded it themselves, which is the overwhelming majority.';

DROP POLICY IF EXISTS "Clinicians can add documents for their patients" ON public.health_documents;
CREATE POLICY "Clinicians can add documents for their patients"
  ON public.health_documents FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by_user_id = auth.uid()
    AND user_id <> auth.uid()
    AND source_context = 'clinician_upload'
    AND (
      public.clinician_has_patient_access(user_id)
      OR public.institution_has_patient_access(user_id)
    )
  );

COMMENT ON POLICY "Clinicians can add documents for their patients" ON public.health_documents IS
  'INSERT only, and only into the Vault of a patient the clinician already has access to. '
  'The row must name its author and be tagged clinician_upload, so the patient can always '
  'see where a document in their Vault came from.';

-- The file behind the row. The patient''s folder is their user id, so a
-- clinician writing there is writing into someone else''s prefix; the check is
-- the same access test the row policy makes.
DROP POLICY IF EXISTS "Clinicians can upload documents for their patients" ON storage.objects;
CREATE POLICY "Clinicians can upload documents for their patients"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'health-documents'
    AND (storage.foldername(name))[1] <> auth.uid()::text
    -- Cast only once the prefix is known to be a uuid: an object named
    -- anything else would raise here rather than simply failing the check.
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    AND (
      public.clinician_has_patient_access(((storage.foldername(name))[1])::uuid)
      OR public.institution_has_patient_access(((storage.foldername(name))[1])::uuid)
    )
  );
