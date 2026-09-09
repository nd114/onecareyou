ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS stopped_by text
    CHECK (stopped_by IS NULL OR stopped_by IN ('patient', 'prescriber', 'import')),
  ADD COLUMN IF NOT EXISTS stopped_reason text,
  ADD COLUMN IF NOT EXISTS stopped_reported_at timestamptz;

CREATE INDEX IF NOT EXISTS medications_stopped_idx
  ON public.medications (user_id, stopped_reported_at DESC)
  WHERE stopped_by IS NOT NULL;

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
  IF _med.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the patient can record that they stopped a medicine';
  END IF;
  IF NOT _med.is_active THEN
    RETURN _med;
  END IF;
  UPDATE public.medications
     SET is_active = false,
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
  CASE
    WHEN m.stopped_reported_at IS NULL OR m.end_date IS NULL THEN NULL
    ELSE GREATEST(0, (m.stopped_reported_at::date - m.end_date))
  END AS reported_after_days
FROM public.medications m;

GRANT SELECT ON public.medications_with_status TO authenticated, service_role;