-- What we are working towards, and whether it is working.
--
-- The platform holds medications, readings, appointments and guidance, and a
-- patient sees each of them separately. What none of them says is what any of it
-- is *for*. A care plan is the missing sentence: "get the HbA1c under 7% by
-- March, and here is what we are doing about it."
--
-- The goals are deliberately measurable rather than free text. A goal that names
-- a vital, a comparator and a number can be checked against readings the patient
-- is already taking — so progress is shown from data that exists rather than
-- asked for again at the next visit. A goal with no measure is still allowed,
-- because "walk more" is a real thing a clinician says; it simply cannot be
-- scored, and the UI says so rather than inventing a number.

CREATE TABLE IF NOT EXISTS public.fhir_care_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  patient_user_id uuid NOT NULL,
  practice_id uuid REFERENCES public.practices(id) ON DELETE CASCADE,

  title text NOT NULL,
  description text,

  -- FHIR CarePlan.status and .intent.
  status text NOT NULL DEFAULT 'draft',
  intent text NOT NULL DEFAULT 'plan',

  period_start date,
  period_end   date,

  resource jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fhir_care_plans_status_check CHECK (status IN (
    'draft','active','on-hold','revoked','completed','entered-in-error','unknown'
  )),
  CONSTRAINT fhir_care_plans_intent_check CHECK (intent IN (
    'proposal','plan','order','option'
  )),
  CONSTRAINT fhir_care_plans_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT fhir_care_plans_period_sane CHECK (
    period_start IS NULL OR period_end IS NULL OR period_end >= period_start
  )
);

-- FHIR Goal, kept alongside its plan.
CREATE TABLE IF NOT EXISTS public.fhir_care_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  care_plan_id uuid NOT NULL REFERENCES public.fhir_care_plans(id) ON DELETE CASCADE,

  description text NOT NULL,

  -- What to measure it against, when it can be measured. Matches the vitals
  -- type keys so progress reads from readings the patient already takes.
  measure_type text,
  target_comparator text,
  target_value numeric,
  target_unit text,

  due_date date,

  -- FHIR Goal.achievementStatus, set by a clinician. Deliberately not derived:
  -- whether a goal was achieved is a clinical judgement, and a single reading
  -- crossing a threshold is not the same thing.
  achievement_status text NOT NULL DEFAULT 'in-progress',

  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fhir_care_goals_description_not_blank CHECK (btrim(description) <> ''),
  CONSTRAINT fhir_care_goals_comparator_check CHECK (
    target_comparator IS NULL OR target_comparator IN ('<','<=','>','>=')
  ),
  -- A measurable goal needs all three parts or none. Half a target is a target
  -- nobody can check, and it would render as a number with no meaning.
  CONSTRAINT fhir_care_goals_target_complete CHECK (
    (measure_type IS NULL AND target_comparator IS NULL AND target_value IS NULL)
    OR (measure_type IS NOT NULL AND target_comparator IS NOT NULL AND target_value IS NOT NULL)
  ),
  CONSTRAINT fhir_care_goals_achievement_check CHECK (achievement_status IN (
    'in-progress','improving','worsening','no-change','achieved','sustaining',
    'not-achieved','no-progress','not-attainable'
  ))
);

CREATE INDEX IF NOT EXISTS idx_fhir_care_plans_patient
  ON public.fhir_care_plans (patient_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fhir_care_goals_plan
  ON public.fhir_care_goals (care_plan_id, sort_order);

COMMENT ON TABLE public.fhir_care_plans IS
  'FHIR R4 CarePlan. The sentence that says what the medications, readings and appointments '
  'are for. Drafts stay with the practice; an active plan is the patient''s to see.';

COMMENT ON COLUMN public.fhir_care_goals.measure_type IS
  'A vitals type key, when the goal can be checked against readings the patient already takes. '
  'Null for a goal like "walk more", which is real but not scoreable — the UI says so rather '
  'than inventing a number.';

COMMENT ON COLUMN public.fhir_care_goals.achievement_status IS
  'Set by a clinician, never derived. Whether a goal was achieved is a clinical judgement, and '
  'one reading crossing a threshold is not the same thing.';

CREATE OR REPLACE FUNCTION public.touch_care_plan()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_touch_care_plan ON public.fhir_care_plans;
CREATE TRIGGER trg_touch_care_plan BEFORE UPDATE ON public.fhir_care_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_care_plan();

DROP TRIGGER IF EXISTS trg_touch_care_goal ON public.fhir_care_goals;
CREATE TRIGGER trg_touch_care_goal BEFORE UPDATE ON public.fhir_care_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_care_plan();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
ALTER TABLE public.fhir_care_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fhir_care_goals ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.fhir_care_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fhir_care_goals TO authenticated;

REVOKE DELETE, TRUNCATE ON public.fhir_care_plans FROM anon, authenticated;
REVOKE ALL ON public.fhir_care_plans FROM anon;
REVOKE ALL ON public.fhir_care_goals FROM anon;

-- A patient sees their plan once it is active. A draft is the clinician still
-- deciding, and a patient watching a plan for their own body change shape while
-- it is being thought about cannot usefully ask about any version of it.
DROP POLICY IF EXISTS "Patients read their active care plans" ON public.fhir_care_plans;
CREATE POLICY "Patients read their active care plans"
  ON public.fhir_care_plans FOR SELECT TO authenticated
  USING (patient_user_id = auth.uid() AND status <> 'draft');

DROP POLICY IF EXISTS "Clinicians read care plans for their patients" ON public.fhir_care_plans;
CREATE POLICY "Clinicians read care plans for their patients"
  ON public.fhir_care_plans FOR SELECT TO authenticated
  USING (
    public.clinician_has_patient_access(patient_user_id)
    OR public.institution_has_patient_access(patient_user_id)
  );

DROP POLICY IF EXISTS "Clinicians write care plans" ON public.fhir_care_plans;
CREATE POLICY "Clinicians write care plans"
  ON public.fhir_care_plans FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (public.clinician_has_patient_access(patient_user_id)
         OR public.institution_has_patient_access(patient_user_id))
  );

DROP POLICY IF EXISTS "Clinicians amend care plans" ON public.fhir_care_plans;
CREATE POLICY "Clinicians amend care plans"
  ON public.fhir_care_plans FOR UPDATE TO authenticated
  USING (
    public.clinician_has_patient_access(patient_user_id)
    OR public.institution_has_patient_access(patient_user_id)
  )
  WITH CHECK (
    public.clinician_has_patient_access(patient_user_id)
    OR public.institution_has_patient_access(patient_user_id)
  );

-- Goals follow their plan: a plan without its goals is a title.
DROP POLICY IF EXISTS "Read goals of a readable plan" ON public.fhir_care_goals;
CREATE POLICY "Read goals of a readable plan"
  ON public.fhir_care_goals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fhir_care_plans p WHERE p.id = care_plan_id));

DROP POLICY IF EXISTS "Clinicians write goals" ON public.fhir_care_goals;
CREATE POLICY "Clinicians write goals"
  ON public.fhir_care_goals FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fhir_care_plans p
     WHERE p.id = care_plan_id
       AND (public.clinician_has_patient_access(p.patient_user_id)
            OR public.institution_has_patient_access(p.patient_user_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.fhir_care_plans p
     WHERE p.id = care_plan_id
       AND (public.clinician_has_patient_access(p.patient_user_id)
            OR public.institution_has_patient_access(p.patient_user_id))
  ));

COMMENT ON POLICY "Patients read their active care plans" ON public.fhir_care_plans IS
  'Drafts excluded deliberately: a plan for your own body changing shape while somebody is '
  'still deciding is not something you can usefully ask about. Once active it is yours.';
