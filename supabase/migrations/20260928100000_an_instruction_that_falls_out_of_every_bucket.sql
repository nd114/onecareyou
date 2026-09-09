-- An instruction that falls out of every bucket.
--
-- `clinician_guidance.status` is plain text with a default and no CHECK. The
-- patient's Instructions page sorts rows into three exact-match buckets —
-- 'pending', 'acknowledged', 'completed' — plus the archived one. A row holding
-- anything else belongs to none of them: the clinician sees the instruction as
-- sent, the row is in the table, and the patient's page reads "All caught up!"
-- with nothing anywhere reporting a problem.
--
-- Found by seeding a guidance row with a word the application does not write
-- and watching it disappear from the patient's screen. That was a fixture's
-- mistake, but nothing in the database stopped a real write from making it.
--
-- schedule_entries.status has the same shape and the same consequence one step
-- further on: a dose that matches no status is missing from the day, and
-- summariseAdherence counts it into neither `taken` nor `due`, so it silently
-- moves the adherence figure the clinician's risk view reads.

-- ---------------------------------------------------------------------------
-- 1. Anything outside the vocabulary becomes the state that loses nothing.
-- ---------------------------------------------------------------------------
--
-- 'pending' in both cases: an instruction the patient has not seen stays in
-- front of them, and a dose whose outcome is unknown is one still to be
-- accounted for. Neither claims something happened that did not.
DO $$
DECLARE moved integer;
BEGIN
  UPDATE public.clinician_guidance
     SET status = 'pending'
   WHERE status IS NULL
      OR status NOT IN ('pending', 'acknowledged', 'completed', 'archived');
  GET DIAGNOSTICS moved = ROW_COUNT;
  IF moved > 0 THEN
    RAISE NOTICE 'clinician_guidance: % row(s) held a status outside the vocabulary and were reset to pending', moved;
  END IF;

  UPDATE public.schedule_entries
     SET status = 'pending'
   WHERE status IS NULL
      OR status NOT IN ('pending', 'taken', 'skipped', 'missed');
  GET DIAGNOSTICS moved = ROW_COUNT;
  IF moved > 0 THEN
    RAISE NOTICE 'schedule_entries: % row(s) held a status outside the vocabulary and were reset to pending', moved;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. The vocabulary, in the database.
-- ---------------------------------------------------------------------------
--
-- These mirror GuidanceStatus in src/lib/guidance-status.ts and ScheduleStatus
-- in src/types/health.ts. The two lists are asserted equal by
-- supabase/tests/status_vocabularies.test.sql and by the unit tests, so a
-- change to one that is not made in the other fails rather than drifts.
ALTER TABLE public.clinician_guidance
  DROP CONSTRAINT IF EXISTS clinician_guidance_status_check;
ALTER TABLE public.clinician_guidance
  ADD CONSTRAINT clinician_guidance_status_check
  CHECK (status IN ('pending', 'acknowledged', 'completed', 'archived'));

ALTER TABLE public.schedule_entries
  DROP CONSTRAINT IF EXISTS schedule_entries_status_check;
ALTER TABLE public.schedule_entries
  ADD CONSTRAINT schedule_entries_status_check
  CHECK (status IN ('pending', 'taken', 'skipped', 'missed'));

COMMENT ON COLUMN public.clinician_guidance.status IS
  'pending | acknowledged | completed | archived. Mirrors GuidanceStatus; the patient''s page buckets on exact matches.';
COMMENT ON COLUMN public.schedule_entries.status IS
  'pending | taken | skipped | missed. Mirrors ScheduleStatus; adherence is computed from exact matches.';
