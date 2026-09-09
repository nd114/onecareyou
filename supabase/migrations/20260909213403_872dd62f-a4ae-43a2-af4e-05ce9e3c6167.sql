CREATE OR REPLACE FUNCTION public.is_assigned_to_patient(
  _user_id uuid,
  _patient_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_patient_assignments ppa
    JOIN public.practice_shares ps
      ON ps.practice_id = ppa.practice_id
     AND ps.user_id = ppa.patient_user_id
    WHERE ppa.patient_user_id = _patient_user_id
      AND ppa.clinician_user_id = _user_id
      AND (ppa.effective_to IS NULL OR ppa.effective_to > now())
      AND ppa.effective_from <= now()
      AND ps.is_active = true
      AND ps.practice_suspended_at IS NULL
  );
$function$;

COMMENT ON FUNCTION public.is_assigned_to_patient(uuid, uuid) IS
  'Assigned to this patient AND the patient''s share with that practice is still live.';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarded_via_practice_id uuid REFERENCES public.practices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onboarding_source text
    CHECK (onboarding_source IN ('self', 'practice_record', 'practice_import', 'practice_invite')),
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

COMMENT ON COLUMN public.profiles.onboarded_via_practice_id IS
  'The practice that introduced this person to OneCare, if one did. Written once and immutable thereafter.';

CREATE OR REPLACE FUNCTION public.freeze_onboarding_provenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF OLD.onboarded_via_practice_id IS NOT NULL
     AND NEW.onboarded_via_practice_id IS DISTINCT FROM OLD.onboarded_via_practice_id THEN
    RAISE EXCEPTION 'How a patient came onboard cannot be changed once recorded';
  END IF;
  IF OLD.onboarding_source IS NOT NULL
     AND NEW.onboarding_source IS DISTINCT FROM OLD.onboarding_source THEN
    RAISE EXCEPTION 'How a patient came onboard cannot be changed once recorded';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_freeze_onboarding_provenance ON public.profiles;
CREATE TRIGGER trg_freeze_onboarding_provenance
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.freeze_onboarding_provenance();

ALTER TABLE public.clinician_patient_records
  ADD COLUMN IF NOT EXISTS external_mrn text;

COMMENT ON COLUMN public.clinician_patient_records.external_mrn IS
  'The hospital''s own medical record number for this person. An attribute for reconciliation, never a key.';

CREATE INDEX IF NOT EXISTS idx_clinician_patient_records_mrn
  ON public.clinician_patient_records(practice_id, external_mrn)
  WHERE external_mrn IS NOT NULL;

CREATE OR REPLACE FUNCTION public.may_manage_practice_patient_records(_practice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.practice_members pm
    WHERE pm.practice_id = _practice_id
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND (
        pm.role IN ('owner', 'admin', 'sub_admin')
        OR public.practice_role_is_clinical(pm.role)
        OR COALESCE(pm.can_invite_patients, false)
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.may_manage_practice_patient_records(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.may_manage_practice_patient_records(uuid) TO authenticated;

DROP POLICY IF EXISTS "Practice staff read records their practice created" ON public.clinician_patient_records;
CREATE POLICY "Practice staff read records their practice created"
  ON public.clinician_patient_records FOR SELECT
  USING (
    practice_id IS NOT NULL
    AND public.may_manage_practice_patient_records(practice_id)
  );

DROP POLICY IF EXISTS "Practice staff create records for their practice" ON public.clinician_patient_records;
CREATE POLICY "Practice staff create records for their practice"
  ON public.clinician_patient_records FOR INSERT
  WITH CHECK (
    practice_id IS NOT NULL
    AND clinician_user_id = auth.uid()
    AND public.may_manage_practice_patient_records(practice_id)
  );

DROP POLICY IF EXISTS "Practice staff update records their practice created" ON public.clinician_patient_records;
CREATE POLICY "Practice staff update records their practice created"
  ON public.clinician_patient_records FOR UPDATE
  USING (
    practice_id IS NOT NULL
    AND public.may_manage_practice_patient_records(practice_id)
    AND linked_user_id IS NULL
  );

CREATE OR REPLACE FUNCTION public.record_onboarding_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.linked_user_id IS NULL OR OLD.linked_user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.practice_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.profiles p
     SET onboarded_via_practice_id = NEW.practice_id,
         onboarding_source = CASE
           WHEN NEW.data_sharing_model = 'imported' THEN 'practice_import'
           WHEN NEW.invitation_status = 'accepted' THEN 'practice_record'
           ELSE 'practice_record'
         END,
         onboarded_at = now()
   WHERE p.user_id = NEW.linked_user_id
     AND p.onboarded_via_practice_id IS NULL;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_record_onboarding_provenance ON public.clinician_patient_records;
CREATE TRIGGER trg_record_onboarding_provenance
  AFTER UPDATE ON public.clinician_patient_records
  FOR EACH ROW EXECUTE FUNCTION public.record_onboarding_provenance();

DROP POLICY IF EXISTS "Clinicians can update their own patient records" ON public.clinician_patient_records;
DROP POLICY IF EXISTS "Clinicians update their own unclaimed patient records" ON public.clinician_patient_records;

CREATE POLICY "Clinicians update their own unclaimed patient records"
  ON public.clinician_patient_records FOR UPDATE
  USING (auth.uid() = clinician_user_id AND linked_user_id IS NULL)
  WITH CHECK (auth.uid() = clinician_user_id);

CREATE OR REPLACE FUNCTION public.notification_is_mandatory(_category text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _category IN ('account_security', 'patient_vital_alert');
$$;