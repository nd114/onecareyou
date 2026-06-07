
-- ============ ENCOUNTERS ============
CREATE TABLE public.encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id uuid NOT NULL,
  clinician_user_id uuid NOT NULL,
  practice_id uuid REFERENCES public.practices(id) ON DELETE SET NULL,
  visit_type text NOT NULL DEFAULT 'follow_up',
  status text NOT NULL DEFAULT 'in_progress',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  chief_complaint text,
  subjective text,
  objective text,
  assessment text,
  plan text,
  cpt_codes text[] DEFAULT '{}'::text[],
  icd_codes text[] DEFAULT '{}'::text[],
  follow_up_in_days integer,
  follow_up_task_id uuid,
  signed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.encounters TO authenticated;
GRANT ALL ON public.encounters TO service_role;
ALTER TABLE public.encounters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinicians read encounters for their patients"
  ON public.encounters FOR SELECT TO authenticated
  USING (
    clinician_user_id = auth.uid()
    OR public.clinician_has_patient_access(patient_user_id)
    OR public.is_assigned_to_patient(auth.uid(), patient_user_id)
    OR public.practice_has_patient_access(patient_user_id)
  );

CREATE POLICY "Clinicians create encounters for accessible patients"
  ON public.encounters FOR INSERT TO authenticated
  WITH CHECK (
    clinician_user_id = auth.uid()
    AND (
      public.clinician_has_patient_access(patient_user_id)
      OR public.is_assigned_to_patient(auth.uid(), patient_user_id)
      OR public.practice_has_patient_access(patient_user_id)
    )
  );

CREATE POLICY "Authors update own encounters"
  ON public.encounters FOR UPDATE TO authenticated
  USING (clinician_user_id = auth.uid())
  WITH CHECK (clinician_user_id = auth.uid());

CREATE POLICY "Patients view their encounters"
  ON public.encounters FOR SELECT TO authenticated
  USING (patient_user_id = auth.uid());

CREATE TRIGGER encounters_updated_at
  BEFORE UPDATE ON public.encounters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_encounters_patient ON public.encounters(patient_user_id, occurred_at DESC);
CREATE INDEX idx_encounters_clinician ON public.encounters(clinician_user_id, occurred_at DESC);

-- ============ CLINICAL TEMPLATES ============
CREATE TABLE public.clinical_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid REFERENCES public.practices(id) ON DELETE CASCADE,
  owner_user_id uuid,
  kind text NOT NULL DEFAULT 'visit',
  specialty text,
  name text NOT NULL,
  description text,
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinical_templates TO authenticated;
GRANT ALL ON public.clinical_templates TO service_role;
ALTER TABLE public.clinical_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read system or own-practice templates"
  ON public.clinical_templates FOR SELECT TO authenticated
  USING (
    is_system = true
    OR owner_user_id = auth.uid()
    OR (practice_id IS NOT NULL AND public.is_practice_member(practice_id))
  );

CREATE POLICY "Practice managers manage practice templates"
  ON public.clinical_templates FOR INSERT TO authenticated
  WITH CHECK (
    owner_user_id = auth.uid()
    AND (practice_id IS NULL OR public.can_manage_practice(practice_id))
  );

CREATE POLICY "Owners update their templates"
  ON public.clinical_templates FOR UPDATE TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR (practice_id IS NOT NULL AND public.can_manage_practice(practice_id))
  )
  WITH CHECK (
    owner_user_id = auth.uid()
    OR (practice_id IS NOT NULL AND public.can_manage_practice(practice_id))
  );

CREATE POLICY "Owners delete their templates"
  ON public.clinical_templates FOR DELETE TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR (practice_id IS NOT NULL AND public.can_manage_practice(practice_id))
  );

CREATE TRIGGER clinical_templates_updated_at
  BEFORE UPDATE ON public.clinical_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_clinical_templates_practice ON public.clinical_templates(practice_id, kind);

-- ============ PATIENT ACTION LOG ============
CREATE TABLE public.patient_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  practice_id uuid REFERENCES public.practices(id) ON DELETE SET NULL,
  action text NOT NULL,
  ref_table text,
  ref_id uuid,
  summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.patient_action_log TO authenticated;
GRANT ALL ON public.patient_action_log TO service_role;
ALTER TABLE public.patient_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read action log for accessible patients"
  ON public.patient_action_log FOR SELECT TO authenticated
  USING (
    actor_user_id = auth.uid()
    OR patient_user_id = auth.uid()
    OR public.clinician_has_patient_access(patient_user_id)
    OR public.is_assigned_to_patient(auth.uid(), patient_user_id)
    OR public.practice_has_patient_access(patient_user_id)
  );

CREATE POLICY "Actors insert action log entries"
  ON public.patient_action_log FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid());

CREATE INDEX idx_action_log_patient ON public.patient_action_log(patient_user_id, created_at DESC);
