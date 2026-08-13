ALTER TABLE public.clinician_patient_records
  ADD COLUMN IF NOT EXISTS visits jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.enforce_patient_record_patient_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS DISTINCT FROM OLD.clinician_user_id THEN
    NEW.clinician_user_id     := OLD.clinician_user_id;
    NEW.patient_email         := OLD.patient_email;
    NEW.patient_name          := OLD.patient_name;
    NEW.patient_phone         := OLD.patient_phone;
    NEW.date_of_birth         := OLD.date_of_birth;
    NEW.blood_type            := OLD.blood_type;
    NEW.allergies             := OLD.allergies;
    NEW.health_conditions     := OLD.health_conditions;
    NEW.medications           := OLD.medications;
    NEW.vitals_history        := OLD.vitals_history;
    NEW.visits                := OLD.visits;
    NEW.notes                 := OLD.notes;
    NEW.created_at            := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$function$;