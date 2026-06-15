
-- 1. Revoke anon/public EXECUTE on the trigger function (it should never be called directly).
REVOKE EXECUTE ON FUNCTION public.enforce_guidance_patient_update() FROM PUBLIC, anon;

-- 2. clinician_patient_records: restrict patient UPDATE to acceptance columns only.
CREATE OR REPLACE FUNCTION public.enforce_patient_record_patient_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If the caller is NOT the clinician who owns the row, treat them as the patient
  -- accepting/declining the record. Only linked_user_id and invitation_status may change.
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
    NEW.notes                 := OLD.notes;
    NEW.created_at            := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_patient_record_patient_update() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS enforce_patient_record_patient_update_trg ON public.clinician_patient_records;
CREATE TRIGGER enforce_patient_record_patient_update_trg
  BEFORE UPDATE ON public.clinician_patient_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_patient_record_patient_update();

-- Tighten the patient UPDATE policy with WITH CHECK so the row remains owned by the same clinician/email.
DROP POLICY IF EXISTS "Patients can accept or decline pending records" ON public.clinician_patient_records;
CREATE POLICY "Patients can accept or decline pending records"
  ON public.clinician_patient_records
  FOR UPDATE
  USING (patient_email IS NOT NULL AND patient_email = public.get_current_user_email())
  WITH CHECK (patient_email IS NOT NULL AND patient_email = public.get_current_user_email());

-- 3. profiles: drop the over-broad guidance-based SELECT policy.
-- Patient-facing clinician info should go through get_clinician_basic_info() RPC instead.
DROP POLICY IF EXISTS "Patients can view clinician names from guidance" ON public.profiles;

-- 4. health-documents storage: allow clinicians to read files for documents shared with them.
DROP POLICY IF EXISTS "Clinicians can view shared health documents" ON storage.objects;
CREATE POLICY "Clinicians can view shared health documents"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'health-documents'
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

-- 5. voice-notes storage: add owner-scoped UPDATE policy to prevent unintended replacement.
DROP POLICY IF EXISTS "Voice notes owner update" ON storage.objects;
CREATE POLICY "Voice notes owner update"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'voice-notes'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'voice-notes'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );
