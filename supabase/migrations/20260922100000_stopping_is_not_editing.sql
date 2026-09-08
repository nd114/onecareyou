-- Stopping a medicine is not editing a prescription
--
-- `medications.is_active` was doing two different jobs. "The prescription
-- ended" and "I stopped taking it" are not the same fact, and collapsing them
-- loses the more important one: a patient who has stopped a hospital-prescribed
-- drug is the single most clinically significant thing their record can say,
-- and it was being stored as though the prescription had simply lapsed.
--
-- Worse, the clinician's chart filters `is_active = true`. So a patient
-- stopping a medication their hospital prescribed made it disappear from the
-- prescriber's view entirely. The signal that most needs to reach a clinician
-- was the one guaranteed not to.
--
-- Three things follow, and they are the whole of this migration:
--
-- 1. Who stopped it is recorded, so the two facts stay apart.
-- 2. When it actually stopped and when the platform was told are separate
--    columns. People do not report themselves in real time. Somebody saying in
--    October that they stopped in August is telling the truth, and a record
--    that stamps it October is not.
-- 3. A patient may stop anything, including an imported row. Refusing that
--    would be refusing somebody's account of their own behaviour, which is not
--    ours to refuse and would only make the record wrong more quietly.
--
-- What a patient still may not do to an imported row is change what it says was
-- prescribed — name, dose, frequency. That remains the sending system's record
-- of what it prescribed. Stopping says "I am not taking this"; editing says
-- "you prescribed something else", and only one of those is the patient's to
-- assert.

ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS stopped_by text
    CHECK (stopped_by IS NULL OR stopped_by IN ('patient', 'prescriber', 'import')),
  ADD COLUMN IF NOT EXISTS stopped_reason text,
  ADD COLUMN IF NOT EXISTS stopped_reported_at timestamptz;

COMMENT ON COLUMN public.medications.stopped_by IS
  'Whose act ended this. ''patient'' is the patient''s own account of what they '
  'are doing and is always allowed, including on an imported row. ''prescriber'' '
  'is a clinician''s proposal the patient accepted. ''import'' is a sending '
  'system reporting the prescription ended. NULL while the medicine is current.';

COMMENT ON COLUMN public.medications.stopped_reason IS
  'Why, in the stopper''s words. Side effects, cost, "it ran out and I never '
  'went back" — the reasons that matter clinically are exactly the ones nobody '
  'volunteers unless asked.';

COMMENT ON COLUMN public.medications.stopped_reported_at IS
  'When the platform was told, as against `end_date`, which is when it actually '
  'stopped. The gap between them is not an error to be tidied away: it is how '
  'far behind the record was running, and a clinician reading "stopped in '
  'August, told us in October" is reading something true.';

-- A stopped medicine still has to be findable. The clinician's chart, the
-- shared record and the AI's context all read this table, and a partial index
-- on the active rows alone is how "recently stopped" ends up as a sequential
-- scan nobody notices until a patient has ten years of history.
CREATE INDEX IF NOT EXISTS medications_stopped_idx
  ON public.medications (user_id, stopped_reported_at DESC)
  WHERE stopped_by IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
--
-- Every row already inactive was stopped by somebody, and there is no way to
-- know who — the column did not exist. Guessing 'patient' would invent a
-- clinical statement; guessing 'prescriber' would invent a clinical decision.
-- They stay NULL, and `stopped_by IS NULL AND is_active = false` reads as
-- "stopped before we recorded who", which is the only honest answer.

-- ---------------------------------------------------------------------------
-- Stopping, as an operation rather than an UPDATE
-- ---------------------------------------------------------------------------
--
-- A function rather than a policy, because stopping sets four columns that have
-- to agree with each other, and a client setting three of them produces a row
-- that says a medicine ended with nobody having ended it.

CREATE OR REPLACE FUNCTION public.stop_medication(
  p_medication_id uuid,
  p_reason text DEFAULT NULL,
  p_stopped_on date DEFAULT NULL
)
RETURNS public.medications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _med public.medications;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT * INTO _med FROM public.medications WHERE id = p_medication_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such medication';
  END IF;

  -- Only the person taking it. A clinician who wants it stopped proposes that
  -- and the patient accepts — see record_change_proposals.
  IF _med.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the patient can record that they stopped a medicine';
  END IF;

  IF NOT _med.is_active THEN
    RETURN _med;
  END IF;

  UPDATE public.medications
     SET is_active = false,
         -- Backdatable, because that is how people actually report. Clamped so
         -- a typo cannot place a stop before the medicine began or in the
         -- future, either of which would quietly corrupt an adherence window.
         end_date = GREATEST(
           _med.start_date,
           LEAST(COALESCE(p_stopped_on, CURRENT_DATE), CURRENT_DATE)
         ),
         stopped_by = 'patient',
         stopped_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''),
         stopped_reported_at = now(),
         updated_at = now()
   WHERE id = p_medication_id
  RETURNING * INTO _med;

  -- Upcoming reminders go; past ones stay. Deleting the history of doses that
  -- were due would rewrite the adherence record to make it look as though the
  -- medicine was never missed.
  DELETE FROM public.schedule_entries
   WHERE medication_id = p_medication_id
     AND user_id = auth.uid()
     AND status = 'pending'
     AND scheduled_time >= now();

  RETURN _med;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.stop_medication(uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stop_medication(uuid, text, date) TO authenticated;

COMMENT ON FUNCTION public.stop_medication(uuid, text, date) IS
  'The patient records that they stopped taking something. Allowed on any of '
  'their medications including imported ones — it is their account of their own '
  'behaviour, not a claim about what was prescribed.';

-- ---------------------------------------------------------------------------
-- What the prescriber needs to see
-- ---------------------------------------------------------------------------
--
-- The chart filtered `is_active = true`, so this was invisible. A view rather
-- than a rule each caller remembers, because the ones that forget are the
-- summary, the export and the AI context — the three places a clinician is
-- most likely to be reading instead of the chart.

CREATE OR REPLACE VIEW public.medications_with_status
WITH (security_invoker = true) AS
SELECT
  m.*,
  CASE
    WHEN m.is_active THEN 'current'
    WHEN m.stopped_by = 'patient' THEN 'stopped_by_patient'
    WHEN m.stopped_by = 'prescriber' THEN 'stopped_by_prescriber'
    WHEN m.stopped_by = 'import' THEN 'ended_in_sending_system'
    ELSE 'ended'
  END AS status,
  -- How far behind the report was. Null when it was never stopped, or when we
  -- do not know — an unknown gap and a zero gap are different answers.
  CASE
    WHEN m.stopped_reported_at IS NULL OR m.end_date IS NULL THEN NULL
    ELSE GREATEST(0, (m.stopped_reported_at::date - m.end_date))
  END AS reported_after_days
FROM public.medications m;

COMMENT ON VIEW public.medications_with_status IS
  'Medications with stopping resolved into one status, and how late the stop was '
  'reported. security_invoker, so it carries the caller''s own row access rather '
  'than widening it.';

GRANT SELECT ON public.medications_with_status TO authenticated, service_role;
