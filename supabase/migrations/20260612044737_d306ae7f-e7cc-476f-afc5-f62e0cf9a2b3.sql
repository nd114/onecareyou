
-- 1) Guidance: restrict patient updates to status/ack/completion only via trigger
CREATE OR REPLACE FUNCTION public.enforce_guidance_patient_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If the caller is the patient (and not the clinician who owns the row),
  -- only allow status / acknowledged_at / completed_at to change.
  IF auth.uid() = OLD.patient_user_id AND auth.uid() <> OLD.clinician_user_id THEN
    NEW.clinician_user_id    := OLD.clinician_user_id;
    NEW.patient_user_id      := OLD.patient_user_id;
    NEW.share_id             := OLD.share_id;
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
$$;

DROP TRIGGER IF EXISTS enforce_guidance_patient_update ON public.clinician_guidance;
CREATE TRIGGER enforce_guidance_patient_update
  BEFORE UPDATE ON public.clinician_guidance
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_guidance_patient_update();

-- Add WITH CHECK to the patient update policy so it stays bound to the same patient row
DROP POLICY IF EXISTS "Patients can update their own guidance status" ON public.clinician_guidance;
CREATE POLICY "Patients can update their own guidance status"
  ON public.clinician_guidance
  FOR UPDATE
  USING (auth.uid() = patient_user_id)
  WITH CHECK (auth.uid() = patient_user_id);

-- 2) Remove patient-facing full-row access to clinician_profiles
DROP POLICY IF EXISTS "Patients can view clinician profiles from guidance" ON public.clinician_profiles;

-- 3) Remove duplicate broad clinician access to profiles
DROP POLICY IF EXISTS "Clinicians can view basic patient info from shares" ON public.profiles;

-- 4) Allow clinicians to read lab-report files for documents shared with them
DROP POLICY IF EXISTS "Clinicians can view shared lab reports" ON storage.objects;
CREATE POLICY "Clinicians can view shared lab reports"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'lab-reports'
    AND EXISTS (
      SELECT 1
      FROM public.health_documents hd
      JOIN public.document_shares ds ON ds.document_id = hd.id
      JOIN public.provider_shares ps ON ps.id = ds.provider_share_id
      WHERE hd.file_path = storage.objects.name
        AND ds.is_active = true
        AND ps.is_active = true
        AND (ps.expires_at IS NULL OR ps.expires_at > now())
        AND (
          ps.clinician_user_id = auth.uid()
          OR ps.provider_email = public.get_current_user_email()
        )
    )
  );

-- 5) Lock down anon-executable SECURITY DEFINER helpers to authenticated only
REVOKE EXECUTE ON FUNCTION public.is_assigned_to_patient(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_practice_capability(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_assigned_to_patient(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_practice_capability(uuid, text) TO authenticated, service_role;
