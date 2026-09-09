DROP POLICY IF EXISTS "Clinicians can delete their guidance" ON public.clinician_guidance;
DROP POLICY IF EXISTS "Clinicians delete only guidance never acknowledged" ON public.clinician_guidance;
CREATE POLICY "Clinicians delete only guidance never acknowledged"
  ON public.clinician_guidance FOR DELETE TO authenticated
  USING (
    auth.uid() = clinician_user_id
    AND acknowledged_at IS NULL
    AND completed_at IS NULL
  );

DROP POLICY IF EXISTS "Users can delete their own schedule entries" ON public.schedule_entries;
DROP POLICY IF EXISTS "Patients delete only doses not yet due" ON public.schedule_entries;
CREATE POLICY "Patients delete only doses not yet due"
  ON public.schedule_entries FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND status = 'pending'
    AND scheduled_time >= now()
  );

DROP POLICY IF EXISTS "Clinicians can delete their own patient records" ON public.clinician_patient_records;
DROP POLICY IF EXISTS "Clinicians delete only unclaimed patient records" ON public.clinician_patient_records;
CREATE POLICY "Clinicians delete only unclaimed patient records"
  ON public.clinician_patient_records FOR DELETE TO authenticated
  USING (
    auth.uid() = clinician_user_id
    AND linked_user_id IS NULL
  );

DROP POLICY IF EXISTS "Users can delete their own medications" ON public.medications;
DROP POLICY IF EXISTS "Patients delete only medications they entered themselves" ON public.medications;
DROP POLICY IF EXISTS "Patients delete only medications with no history" ON public.medications;
CREATE POLICY "Patients delete only medications with no history"
  ON public.medications FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND (source IS NULL OR source = 'manual')
    AND NOT EXISTS (
      SELECT 1 FROM public.schedule_entries se
       WHERE se.medication_id = medications.id
         AND (se.status <> 'pending' OR se.scheduled_time < now())
    )
  );

DROP POLICY IF EXISTS "Users can delete their own shares" ON public.provider_shares;

ALTER TABLE public.clinician_guidance
  DROP CONSTRAINT IF EXISTS clinician_guidance_share_id_fkey;
ALTER TABLE public.clinician_guidance
  ADD CONSTRAINT clinician_guidance_share_id_fkey
  FOREIGN KEY (share_id) REFERENCES public.provider_shares(id) ON DELETE SET NULL;

ALTER TABLE public.record_change_proposals
  DROP CONSTRAINT IF EXISTS record_change_proposals_medication_id_fkey;
ALTER TABLE public.record_change_proposals
  ADD CONSTRAINT record_change_proposals_medication_id_fkey
  FOREIGN KEY (medication_id) REFERENCES public.medications(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.enforce_guidance_patient_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() = OLD.patient_user_id AND auth.uid() <> OLD.clinician_user_id THEN
    NEW.clinician_user_id    := OLD.clinician_user_id;
    NEW.patient_user_id      := OLD.patient_user_id;
    IF NEW.share_id IS NOT NULL THEN
      NEW.share_id           := OLD.share_id;
    END IF;
    NEW.title                := OLD.title;
    NEW.instruction          := OLD.instruction;
    NEW.category             := OLD.category;
    NEW.priority             := OLD.priority;
    NEW.due_date             := OLD.due_date;
    NEW.auto_resend_enabled  := OLD.auto_resend_enabled;
    NEW.resend_interval_hours:= OLD.resend_interval_hours;
    NEW.last_resent_at       := OLD.last_resent_at;
    NEW.created_at           := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$function$;

ALTER TABLE public.record_change_proposals
  DROP CONSTRAINT IF EXISTS proposal_names_its_target;
ALTER TABLE public.record_change_proposals
  ADD CONSTRAINT proposal_names_its_target CHECK (
    (kind = 'medication_start' AND medication_id IS NULL)
    OR (kind IN ('medication_change', 'medication_stop')
        AND (medication_id IS NOT NULL OR status <> 'pending'))
  );