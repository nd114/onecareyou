DROP FUNCTION IF EXISTS public.retract_health_document(uuid, text);
DROP VIEW IF EXISTS public.my_retracted_documents;

CREATE OR REPLACE FUNCTION public.guard_attachment_withdrawal_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF current_setting('onecare.withdrawal', true) = 'on' THEN
    RETURN NEW;
  END IF;

  NEW.attachment_retracted_at := OLD.attachment_retracted_at;
  NEW.attachment_retracted_by := OLD.attachment_retracted_by;
  NEW.attachment_path         := OLD.attachment_path;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_attachment_withdrawal ON public.messages;
CREATE TRIGGER trg_guard_attachment_withdrawal
BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.guard_attachment_withdrawal_columns();

DO $$
DECLARE moved integer;
BEGIN
  UPDATE public.clinician_patient_records
     SET invitation_status = 'not_invited'
   WHERE invitation_status IS NULL
      OR invitation_status NOT IN ('not_invited', 'invited', 'accepted', 'declined');

  UPDATE public.clinician_patient_records
     SET data_sharing_model = 'clinician_managed'
   WHERE data_sharing_model IS NULL
      OR data_sharing_model NOT IN ('clinician_managed', 'collaborative', 'view_only');

  UPDATE public.clinician_guidance
     SET status = 'pending'
   WHERE status IS NULL
      OR status NOT IN ('pending', 'acknowledged', 'completed', 'archived');

  UPDATE public.schedule_entries
     SET status = 'pending'
   WHERE status IS NULL
      OR status NOT IN ('pending', 'taken', 'skipped', 'missed');
END $$;

ALTER TABLE public.clinician_patient_records
  DROP CONSTRAINT IF EXISTS clinician_patient_records_invitation_status_check;
ALTER TABLE public.clinician_patient_records
  ADD CONSTRAINT clinician_patient_records_invitation_status_check
  CHECK (invitation_status IN ('not_invited', 'invited', 'accepted', 'declined'));

ALTER TABLE public.clinician_patient_records
  DROP CONSTRAINT IF EXISTS clinician_patient_records_data_sharing_model_check;
ALTER TABLE public.clinician_patient_records
  ADD CONSTRAINT clinician_patient_records_data_sharing_model_check
  CHECK (data_sharing_model IN ('clinician_managed', 'collaborative', 'view_only'));

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

DROP POLICY IF EXISTS "Users can update their own vitals" ON public.vitals;
CREATE POLICY "Patients edit only the vitals they recorded themselves"
  ON public.vitals FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND (source IS NULL OR source = 'manual'))
  WITH CHECK (auth.uid() = user_id AND (source IS NULL OR source = 'manual'));

DROP POLICY IF EXISTS "Users can delete their own vitals" ON public.vitals;
CREATE POLICY "Patients delete only the vitals they recorded themselves"
  ON public.vitals FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND (source IS NULL OR source = 'manual'));

DROP POLICY IF EXISTS "Users can update their own medications" ON public.medications;
CREATE POLICY "Patients edit only medications they entered themselves"
  ON public.medications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND (source IS NULL OR source = 'manual'))
  WITH CHECK (auth.uid() = user_id AND (source IS NULL OR source = 'manual'));