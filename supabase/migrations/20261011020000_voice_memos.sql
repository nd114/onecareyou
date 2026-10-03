-- Voice memos: a clinician's own dictation, held privately until they turn it
-- into a draft note and sign it (voice-memos-and-scribe-access, Part 1b).
--
-- A memo is NOT the patient's record. It is the clinician's working material,
-- like jottings: owner-only, no share, practice or patient policy (mirroring
-- patient_recordings), never visible to the patient. It becomes clinical record
-- only when the clinician applies a draft to an encounter and signs that.
--
--   * patient_user_id is nullable: the unassigned inbox is the normal state.
--   * Attaching a patient needs CURRENT clinical access (has_current_clinical_access),
--     through assign_voice_memo(), and a trigger re-checks any direct change, so
--     a PATCH cannot bypass it. If access ends the memo stays with the clinician
--     but cannot be assigned or filed.
--   * Audio lives in the existing private bucket clinician-dictations at
--     <uid>/memos/<id>.wav (the existing owner policies already fit). A daily
--     job removes it 24 h after the transcript is confirmed, 30 days at most,
--     unless the clinician turned on keep_memo_audio.
--   * Service-owned columns (duration, error, draft, status through the
--     pipeline) are written only by the voice-memo-process function.

-- ---------------------------------------------------------------------------
-- 1. The clinician's setting
-- ---------------------------------------------------------------------------
ALTER TABLE public.clinician_profiles
  ADD COLUMN IF NOT EXISTS keep_memo_audio boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clinician_profiles.keep_memo_audio IS
  'When true, voice memo audio is not deleted by the retention job. Default off: audio is removed 24 h after the transcript is confirmed.';

-- ---------------------------------------------------------------------------
-- 2. The table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.voice_memos (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinician_user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  practice_id            uuid REFERENCES public.practices(id) ON DELETE SET NULL,
  patient_user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  audio_path             text NOT NULL,
  -- Measured by the server from the audio itself, never taken from the client.
  duration_ms            integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  status                 text NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded', 'transcribing', 'transcribed', 'failed', 'assigned', 'filed', 'discarded')),
  transcript             text,
  draft                  jsonb,
  encounter_id           uuid REFERENCES public.encounters(id) ON DELETE SET NULL,
  error_code             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  assigned_at            timestamptz,
  -- "Keep transcript", or filing, or discarding: starts the 24 h audio clock.
  transcript_confirmed_at timestamptz,
  audio_deleted_at       timestamptz,
  -- A memo that reads "transcribed" must have words in it.
  CONSTRAINT voice_memos_transcribed_has_text
    CHECK (status NOT IN ('transcribed', 'assigned', 'filed')
           OR length(btrim(COALESCE(transcript, ''))) > 0)
);

CREATE INDEX IF NOT EXISTS voice_memos_owner_idx ON public.voice_memos (clinician_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS voice_memos_audio_retention_idx ON public.voice_memos (created_at)
  WHERE audio_deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_voice_memos_updated_at ON public.voice_memos;
CREATE TRIGGER update_voice_memos_updated_at
  BEFORE UPDATE ON public.voice_memos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.voice_memos ENABLE ROW LEVEL SECURITY;

-- Owner only. No share, practice, patient or admin policy.
DROP POLICY IF EXISTS "Clinicians read their own voice memos" ON public.voice_memos;
CREATE POLICY "Clinicians read their own voice memos"
  ON public.voice_memos FOR SELECT TO authenticated
  USING (clinician_user_id = auth.uid());

DROP POLICY IF EXISTS "Clinicians add their own voice memos" ON public.voice_memos;
CREATE POLICY "Clinicians add their own voice memos"
  ON public.voice_memos FOR INSERT TO authenticated
  WITH CHECK (clinician_user_id = auth.uid());

DROP POLICY IF EXISTS "Clinicians update their own voice memos" ON public.voice_memos;
CREATE POLICY "Clinicians update their own voice memos"
  ON public.voice_memos FOR UPDATE TO authenticated
  USING (clinician_user_id = auth.uid())
  WITH CHECK (clinician_user_id = auth.uid());

DROP POLICY IF EXISTS "Clinicians delete their own voice memos" ON public.voice_memos;
CREATE POLICY "Clinicians delete their own voice memos"
  ON public.voice_memos FOR DELETE TO authenticated
  USING (clinician_user_id = auth.uid());

REVOKE ALL ON public.voice_memos FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_memos TO authenticated;
GRANT ALL ON public.voice_memos TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The guard
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: current_user is how a direct client write
-- ('authenticated' / 'anon') is told from the service role (the function), a
-- migration, or a SECURITY DEFINER RPC, which run as another role and do their
-- own checks.
CREATE OR REPLACE FUNCTION public.guard_voice_memo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- 1. What a direct client write may and may not set.
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      -- A client may only start a memo: everything the pipeline owns starts blank.
      NEW.status := 'uploaded';
      NEW.transcript := NULL;
      NEW.draft := NULL;
      NEW.duration_ms := 0;
      NEW.error_code := NULL;
      NEW.encounter_id := NULL;
      NEW.transcript_confirmed_at := NULL;
      NEW.audio_deleted_at := NULL;
    ELSE
      NEW.clinician_user_id := OLD.clinician_user_id;
      NEW.audio_path := OLD.audio_path;
      NEW.duration_ms := OLD.duration_ms;
      NEW.draft := OLD.draft;
      NEW.error_code := OLD.error_code;
      NEW.encounter_id := OLD.encounter_id;
      NEW.audio_deleted_at := OLD.audio_deleted_at;
      NEW.created_at := OLD.created_at;
      -- The only status a client may set is discarded (from anything not yet
      -- filed). Everything else moves through the function or the RPCs.
      IF NEW.status IS DISTINCT FROM OLD.status
         AND NOT (NEW.status = 'discarded' AND OLD.status <> 'filed') THEN
        NEW.status := OLD.status;
      END IF;
      IF NEW.status = 'discarded' THEN
        -- Discarding drops the words and the draft; the audio follows within a day.
        NEW.transcript := NULL;
        NEW.draft := NULL;
        NEW.patient_user_id := NULL;
      END IF;
      IF OLD.status = 'filed' THEN
        NEW.patient_user_id := OLD.patient_user_id;
        NEW.practice_id := OLD.practice_id;
        NEW.transcript_confirmed_at := OLD.transcript_confirmed_at;
      END IF;
    END IF;
  END IF;

  -- 2. The assignment moves the status with it, so the two cannot disagree.
  IF TG_OP = 'INSERT' OR NEW.patient_user_id IS DISTINCT FROM OLD.patient_user_id THEN
    NEW.assigned_at := CASE WHEN NEW.patient_user_id IS NULL THEN NULL ELSE now() END;
    IF NEW.patient_user_id IS NULL AND NEW.status = 'assigned' THEN
      NEW.status := 'transcribed';
    ELSIF NEW.patient_user_id IS NOT NULL AND NEW.status = 'transcribed' THEN
      NEW.status := 'assigned';
    END IF;
  END IF;

  -- 3. A memo that is filed or discarded no longer waits on the clinician:
  -- start the audio clock.
  IF NEW.status IN ('filed', 'discarded') AND NEW.transcript_confirmed_at IS NULL THEN
    NEW.transcript_confirmed_at := now();
  END IF;

  -- 4. Attaching a patient, by any direct route, needs current access NOW.
  -- Detaching is always allowed.
  IF current_user IN ('authenticated', 'anon')
     AND NEW.patient_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.patient_user_id IS DISTINCT FROM OLD.patient_user_id
          OR NEW.practice_id IS DISTINCT FROM OLD.practice_id)
     AND NOT public.has_current_clinical_access(NEW.patient_user_id, NEW.practice_id) THEN
    RAISE EXCEPTION 'You no longer have access to this patient''s record' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.guard_voice_memo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_voice_memo ON public.voice_memos;
CREATE TRIGGER trg_guard_voice_memo
  BEFORE INSERT OR UPDATE ON public.voice_memos
  FOR EACH ROW EXECUTE FUNCTION public.guard_voice_memo();

-- ---------------------------------------------------------------------------
-- 4. Assign, unassign, file
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_voice_memo(
  _memo_id uuid,
  _patient_user_id uuid,
  _practice_id uuid DEFAULT NULL
)
RETURNS public.voice_memos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _memo public.voice_memos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _memo FROM public.voice_memos WHERE id = _memo_id FOR UPDATE;
  -- Someone else's memo is indistinguishable from none.
  IF NOT FOUND OR _memo.clinician_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Voice memo not found' USING ERRCODE = 'P0002';
  END IF;
  IF _memo.status IN ('filed', 'discarded') THEN
    RAISE EXCEPTION 'This memo is already % and cannot be reassigned', _memo.status USING ERRCODE = '22023';
  END IF;

  -- NULL detaches; anything else needs current clinical access now.
  IF _patient_user_id IS NOT NULL
     AND NOT public.has_current_clinical_access(_patient_user_id, _practice_id) THEN
    RAISE EXCEPTION 'You no longer have access to this patient''s record' USING ERRCODE = '42501';
  END IF;

  UPDATE public.voice_memos
     SET patient_user_id = _patient_user_id,
         practice_id = CASE WHEN _patient_user_id IS NULL THEN NULL ELSE _practice_id END
   WHERE id = _memo_id
  RETURNING * INTO _memo;

  RETURN _memo;
END $$;

REVOKE ALL ON FUNCTION public.assign_voice_memo(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_voice_memo(uuid, uuid, uuid) TO authenticated;

-- Filing: the clinician applied a draft from this memo to one of their own
-- encounters. The only place a memo touches a patient's chart, and the only
-- place a patient-visible trace is written (not at capture, not at assignment).
CREATE OR REPLACE FUNCTION public.file_voice_memo(_memo_id uuid, _encounter_id uuid)
RETURNS public.voice_memos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _memo public.voice_memos%ROWTYPE;
  _enc  public.encounters%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _memo FROM public.voice_memos WHERE id = _memo_id FOR UPDATE;
  IF NOT FOUND OR _memo.clinician_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Voice memo not found' USING ERRCODE = 'P0002';
  END IF;
  IF _memo.status = 'discarded' THEN
    RAISE EXCEPTION 'This memo was discarded' USING ERRCODE = '22023';
  END IF;
  IF _memo.patient_user_id IS NULL THEN
    RAISE EXCEPTION 'Attach the memo to a patient first' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _enc FROM public.encounters WHERE id = _encounter_id;
  IF NOT FOUND OR _enc.clinician_user_id <> auth.uid() OR _enc.patient_user_id <> _memo.patient_user_id THEN
    RAISE EXCEPTION 'Encounter not found for this patient' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_current_clinical_access(_memo.patient_user_id, _enc.practice_id) THEN
    RAISE EXCEPTION 'You no longer have access to this patient''s record' USING ERRCODE = '42501';
  END IF;

  UPDATE public.voice_memos
     SET status = 'filed', encounter_id = _encounter_id
   WHERE id = _memo_id
  RETURNING * INTO _memo;

  INSERT INTO public.patient_action_log
    (patient_user_id, actor_user_id, practice_id, action, summary, ref_table, ref_id)
  VALUES
    (_memo.patient_user_id, auth.uid(), _enc.practice_id, 'voice_memo_drafted',
     'Drafted a note from a voice memo (unsigned)', 'encounters', _encounter_id);

  RETURN _memo;
END $$;

REVOKE ALL ON FUNCTION public.file_voice_memo(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.file_voice_memo(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Retention: what is due, and the record that it is gone
-- ---------------------------------------------------------------------------
-- Audio is removed 24 h after the transcript is confirmed (Keep transcript,
-- filed or discarded) and in any case 30 days after capture, unless the
-- clinician keeps memo audio. Service role only; the voice-memo-retention
-- function removes the objects through the storage API (a SQL DELETE on
-- storage.objects leaves the bytes behind) and then reports back here.
CREATE OR REPLACE FUNCTION public.voice_memo_audio_due(_limit integer DEFAULT 200)
RETURNS TABLE (id uuid, audio_path text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.audio_path
    FROM public.voice_memos m
    LEFT JOIN public.clinician_profiles cp ON cp.user_id = m.clinician_user_id
   WHERE m.audio_deleted_at IS NULL
     AND COALESCE(cp.keep_memo_audio, false) = false
     AND ((m.transcript_confirmed_at IS NOT NULL AND m.transcript_confirmed_at <= now() - interval '24 hours')
          OR m.created_at <= now() - interval '30 days')
   ORDER BY m.created_at
   LIMIT GREATEST(1, LEAST(COALESCE(_limit, 200), 1000));
$$;

CREATE OR REPLACE FUNCTION public.voice_memo_mark_audio_deleted(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n integer;
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'voice_memo_mark_audio_deleted is for the service role only' USING ERRCODE = '42501';
  END IF;
  UPDATE public.voice_memos SET audio_deleted_at = now()
   WHERE id = ANY (_ids) AND audio_deleted_at IS NULL;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

REVOKE ALL ON FUNCTION public.voice_memo_audio_due(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voice_memo_mark_audio_deleted(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voice_memo_audio_due(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.voice_memo_mark_audio_deleted(uuid[]) TO service_role;

-- Daily at 03:40 UTC. Guarded: skipped where pg_cron / pg_net are absent.
DO $$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL AND to_regnamespace('net') IS NOT NULL THEN
    PERFORM cron.schedule(
      'voice-memo-audio-retention-daily',
      '40 3 * * *',
      $job$
      SELECT net.http_post(
        url := 'https://cwngpcxxwvspcpkbxeax.supabase.co/functions/v1/voice-memo-retention',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT secret FROM public.cron_auth WHERE id = 'internal')
        ),
        body := '{}'::jsonb
      );
      $job$
    );
  END IF;
END $$;
