-- Two rows, same note, same patient, same timestamp to the microsecond.
--
-- That is what a walkthrough of another hospital's system turned up in a
-- doctor's consultation list, and it is a double-submit: one action fired
-- twice and both were saved. Nothing in this schema stopped the same thing
-- happening here. The client disables its buttons while a mutation is in
-- flight, which covers the impatient second click and nothing else — a request
-- that succeeds and whose response is lost is retried by the browser, by
-- react-query, or by the person, and the second write lands on a server that
-- has no idea it has seen this before.
--
-- The guard is at the database because that is the only place that knows.
-- A duplicate is discarded rather than refused: the write already succeeded,
-- so the caller should see success, not an error about something that worked.
-- BEFORE INSERT returning NULL skips the row and returns cleanly.
--
-- The windows are deliberately short. Byte-identical clinical content, from
-- the same author, for the same patient, within seconds, is one event recorded
-- twice. The same content an hour later is a clinician meaning it twice, and
-- that is theirs to decide.

-- ---------------------------------------------------------------------------
-- Instructions to a patient
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.skip_duplicate_guidance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.clinician_guidance g
     WHERE g.clinician_user_id = NEW.clinician_user_id
       AND g.patient_user_id   = NEW.patient_user_id
       AND g.title             IS NOT DISTINCT FROM NEW.title
       AND g.instruction       IS NOT DISTINCT FROM NEW.instruction
       AND g.created_at        > now() - interval '30 seconds'
  ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.skip_duplicate_guidance() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.skip_duplicate_guidance() IS
  'Discards an instruction identical to one the same clinician sent the same patient '
  'in the last 30 seconds. A double-submit, not a second instruction.';

DROP TRIGGER IF EXISTS trg_skip_duplicate_guidance ON public.clinician_guidance;
CREATE TRIGGER trg_skip_duplicate_guidance
  BEFORE INSERT ON public.clinician_guidance
  FOR EACH ROW EXECUTE FUNCTION public.skip_duplicate_guidance();

-- ---------------------------------------------------------------------------
-- Encounter notes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.skip_duplicate_encounter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.encounters e
     WHERE e.clinician_user_id = NEW.clinician_user_id
       AND e.patient_user_id   = NEW.patient_user_id
       AND e.occurred_at       IS NOT DISTINCT FROM NEW.occurred_at
       AND e.chief_complaint   IS NOT DISTINCT FROM NEW.chief_complaint
       AND e.subjective        IS NOT DISTINCT FROM NEW.subjective
       AND e.objective         IS NOT DISTINCT FROM NEW.objective
       AND e.assessment        IS NOT DISTINCT FROM NEW.assessment
       AND e.plan              IS NOT DISTINCT FROM NEW.plan
       AND e.created_at        > now() - interval '30 seconds'
  ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.skip_duplicate_encounter() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.skip_duplicate_encounter() IS
  'Discards an encounter identical to one the same clinician wrote for the same patient '
  'in the last 30 seconds, including an empty draft saved twice.';

DROP TRIGGER IF EXISTS trg_skip_duplicate_encounter ON public.encounters;
CREATE TRIGGER trg_skip_duplicate_encounter
  BEFORE INSERT ON public.encounters
  FOR EACH ROW EXECUTE FUNCTION public.skip_duplicate_encounter();

-- ---------------------------------------------------------------------------
-- Readings
-- ---------------------------------------------------------------------------
--
-- A reading carries its own recorded_at, so this needs no window: the same
-- person, the same measurement, the same value, at the same instant, is one
-- measurement. Two genuine readings a second apart still differ in recorded_at.
-- The import paths already check for this before writing; the trigger is what
-- makes it true for every path including the ones written next year.

CREATE OR REPLACE FUNCTION public.skip_duplicate_vital()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.vitals v
     WHERE v.user_id          = NEW.user_id
       AND v.type             = NEW.type
       AND v.recorded_at      = NEW.recorded_at
       AND v.value            = NEW.value
       AND v.secondary_value  IS NOT DISTINCT FROM NEW.secondary_value
       AND v.family_member_id IS NOT DISTINCT FROM NEW.family_member_id
  ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.skip_duplicate_vital() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.skip_duplicate_vital() IS
  'Discards a reading identical to one already recorded for the same person at the '
  'same instant. No time window: recorded_at is the reading''s own timestamp.';

DROP TRIGGER IF EXISTS trg_skip_duplicate_vital ON public.vitals;
CREATE TRIGGER trg_skip_duplicate_vital
  BEFORE INSERT ON public.vitals
  FOR EACH ROW EXECUTE FUNCTION public.skip_duplicate_vital();

-- Each guard reads the table it protects, filtered to the row being written.
-- Without these the lookups are sequential scans on every insert.
CREATE INDEX IF NOT EXISTS idx_guidance_dup_guard
  ON public.clinician_guidance (clinician_user_id, patient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_encounters_dup_guard
  ON public.encounters (clinician_user_id, patient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vitals_dup_guard
  ON public.vitals (user_id, type, recorded_at);
