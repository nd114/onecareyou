
-- One-time cleanup: medications whose end_date has passed should not be active
UPDATE public.medications
SET is_active = false
WHERE is_active = true
  AND end_date IS NOT NULL
  AND end_date < CURRENT_DATE;

-- Trigger to auto-deactivate when end_date is in the past on insert/update
CREATE OR REPLACE FUNCTION public.deactivate_expired_medication()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.end_date IS NOT NULL AND NEW.end_date < CURRENT_DATE THEN
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deactivate_expired_medication ON public.medications;
CREATE TRIGGER trg_deactivate_expired_medication
BEFORE INSERT OR UPDATE OF end_date, is_active ON public.medications
FOR EACH ROW
EXECUTE FUNCTION public.deactivate_expired_medication();
