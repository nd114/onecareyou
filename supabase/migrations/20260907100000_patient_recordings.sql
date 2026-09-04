-- A patient recording their own appointment.
--
-- People forget most of what they are told in a consultation, and a recording
-- they can play back is genuinely useful. It is also the patient-side feature
-- with the most legal exposure, because recording law varies by jurisdiction
-- and we do not know where any given patient is.
--
-- So the acknowledgement that they asked permission is stored **per
-- recording**, not once per account: permission is given for a conversation,
-- not for a lifetime. The notice version is stored with it, so it stays
-- possible to say what somebody actually agreed to rather than what the
-- current wording happens to say.
--
-- The audio and transcript live in the Health Vault as ordinary documents, so
-- they inherit sharing, archiving and download without a second mechanism.
-- This table is the recording itself: its name, when it happened, what was
-- acknowledged, and which documents hold it.

CREATE TABLE IF NOT EXISTS public.patient_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,

  -- Defaults to the day and time; the patient renames it afterwards.
  title TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_seconds INTEGER,

  -- Where the audio and the transcript ended up. ON DELETE SET NULL rather
  -- than CASCADE: if a document is removed the recording's own record of what
  -- happened, and of what was agreed, should survive it.
  audio_document_id UUID REFERENCES public.health_documents(id) ON DELETE SET NULL,
  transcript_document_id UUID REFERENCES public.health_documents(id) ON DELETE SET NULL,

  transcript TEXT,
  transcript_status TEXT NOT NULL DEFAULT 'none',

  -- The acknowledgement. NOT NULL on purpose: a recording without one should
  -- not be storable, so the constraint is the thing enforcing the rule rather
  -- than the interface remembering to.
  consent_acknowledged_at TIMESTAMPTZ NOT NULL,
  consent_notice_version TEXT NOT NULL,

  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT patient_recordings_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT patient_recordings_title_length CHECK (char_length(title) <= 120),
  CONSTRAINT patient_recordings_transcript_status CHECK (
    transcript_status IN ('none', 'pending', 'ready', 'failed')
  ),
  CONSTRAINT patient_recordings_duration_sane CHECK (
    duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 86400
  ),
  -- A transcript that is "ready" with nothing in it is a failure wearing the
  -- wrong label, and the patient would trust it.
  CONSTRAINT patient_recordings_ready_has_text CHECK (
    transcript_status <> 'ready' OR btrim(coalesce(transcript, '')) <> ''
  )
);

CREATE INDEX IF NOT EXISTS patient_recordings_active_idx
  ON public.patient_recordings (user_id, recorded_at DESC)
  WHERE archived_at IS NULL;

ALTER TABLE public.patient_recordings ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Only the person who made it. No clinician policy, deliberately.
--
-- A recording of a consultation is the patient's own note of a conversation,
-- not part of the clinical record. Sharing one with the clinician who was in
-- the room is a decision the patient can make by sharing the Vault document —
-- it is not something a share permission should grant in bulk, and a clinician
-- discovering they had been recorded by way of a patient list would be a bad
-- way to find out.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Patients manage their own recordings" ON public.patient_recordings;
CREATE POLICY "Patients manage their own recordings"
  ON public.patient_recordings FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.patient_recordings FROM anon, authenticated;
REVOKE ALL ON public.patient_recordings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_recordings TO authenticated;
GRANT ALL ON public.patient_recordings TO service_role;

DROP TRIGGER IF EXISTS update_patient_recordings_updated_at ON public.patient_recordings;
CREATE TRIGGER update_patient_recordings_updated_at
  BEFORE UPDATE ON public.patient_recordings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.patient_recordings IS
  'A patient''s own recording of a consultation. Not part of the clinical record, and visible to '
  'nobody but the patient. The consent acknowledgement is per recording because permission is '
  'given for a conversation, not for a lifetime.';

COMMENT ON COLUMN public.patient_recordings.consent_notice_version IS
  'Which wording the patient acknowledged, so it stays possible to say what they agreed to rather '
  'than what the current text says.';
