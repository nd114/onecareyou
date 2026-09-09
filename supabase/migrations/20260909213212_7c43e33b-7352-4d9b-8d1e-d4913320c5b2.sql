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
  'Discards an instruction identical to one the same clinician sent the same patient in the last 30 seconds.';

DROP TRIGGER IF EXISTS trg_skip_duplicate_guidance ON public.clinician_guidance;
CREATE TRIGGER trg_skip_duplicate_guidance
  BEFORE INSERT ON public.clinician_guidance
  FOR EACH ROW EXECUTE FUNCTION public.skip_duplicate_guidance();

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
  'Discards an encounter identical to one the same clinician wrote for the same patient in the last 30 seconds.';

DROP TRIGGER IF EXISTS trg_skip_duplicate_encounter ON public.encounters;
CREATE TRIGGER trg_skip_duplicate_encounter
  BEFORE INSERT ON public.encounters
  FOR EACH ROW EXECUTE FUNCTION public.skip_duplicate_encounter();

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
  'Discards a reading identical to one already recorded for the same person at the same instant.';

DROP TRIGGER IF EXISTS trg_skip_duplicate_vital ON public.vitals;
CREATE TRIGGER trg_skip_duplicate_vital
  BEFORE INSERT ON public.vitals
  FOR EACH ROW EXECUTE FUNCTION public.skip_duplicate_vital();

CREATE INDEX IF NOT EXISTS idx_guidance_dup_guard
  ON public.clinician_guidance (clinician_user_id, patient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_encounters_dup_guard
  ON public.encounters (clinician_user_id, patient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vitals_dup_guard
  ON public.vitals (user_id, type, recorded_at);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS getting_started_dismissed_at timestamptz;

COMMENT ON COLUMN public.profiles.getting_started_dismissed_at IS
  'When the patient put the getting-started checklist away.';