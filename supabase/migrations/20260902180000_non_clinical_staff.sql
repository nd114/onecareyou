-- Front desk is not a clinician.
--
-- Ten staff roles exist in the enum. practice_role_permissions, the table that
-- was meant to say what each one may do, is empty — so access has been decided
-- entirely by the can_view_all_patients flag, and role has meant nothing. A
-- front-desk hire given the roster so they can book people in gets the same
-- reach as a doctor: signed assessments, ambient transcripts, team notes.
--
-- That is wrong in the ordinary case rather than the adversarial one. A clinic
-- receptionist needs the diary, the contact details and the bill. They do not
-- need to know a patient started sertraline, and a platform that hands it to
-- them by default has made the clinic's compliance problem, not solved it.
--
-- The split below is deliberately conservative: only the roles that exist
-- *specifically* to denote non-clinical staff lose clinical reach. Nobody who
-- has access today loses it unless their role already said they were not
-- clinical.

-- ---------------------------------------------------------------------------
-- Which roles do clinical work
--
-- An allowlist, not a denylist. A role added later gets nothing clinical until
-- somebody decides it should — which is the safe direction to be wrong in, and
-- the test suite fails loudly if a real clinical role is left out.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.practice_role_is_clinical(_role public.practice_role)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _role IN (
    'owner',      -- in most practices on this platform the owner is the doctor
    'admin',
    'sub_admin',  -- a department lead, per the tenancy plan
    'provider',
    'clinician',
    'nurse'
  );
$$;

COMMENT ON FUNCTION public.practice_role_is_clinical(public.practice_role) IS
  'Whether a staff role may read clinical content. An allowlist: front_desk, billing, '
  'read_only and staff are not on it, and a role added later is not either until somebody '
  'decides. Owner and admin are included because on this platform they are usually the '
  'doctor; a hospital wanting a purely administrative owner should use a separate account.';

-- ---------------------------------------------------------------------------
-- The clinical variants of the three institution pathways
--
-- Each mirrors its administrative counterpart exactly and adds the role test,
-- so a change to how a practice reaches a patient does not need making twice
-- in two different shapes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.institution_has_clinical_access(patient_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM public.practice_shares ps
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    WHERE ps.user_id = patient_user_id
      AND ps.is_active = true
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND public.practice_role_is_clinical(pm.role)
      AND (
        pm.can_view_all_patients = true
        OR public.is_assigned_to_patient_in_practice(auth.uid(), patient_user_id, ps.practice_id)
      )
  ) END;
$$;

CREATE OR REPLACE FUNCTION public.practice_has_clinical_access(patient_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_patient_access ppa
    JOIN public.practice_members pm ON pm.practice_id = ppa.practice_id
    WHERE ppa.patient_user_id = patient_uuid
      AND ppa.is_active = true
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND pm.can_view_all_patients = true
      AND public.practice_role_is_clinical(pm.role)
      AND EXISTS (
        SELECT 1 FROM public.practice_shares ps
         WHERE ps.practice_id = ppa.practice_id
           AND ps.user_id = patient_uuid
           AND ps.is_active = true
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.institution_has_clinical_permission(
  patient_user_id uuid, _category text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.institution_has_patient_permission(patient_user_id, _category)
     AND public.institution_has_clinical_access(patient_user_id);
$$;

COMMENT ON FUNCTION public.institution_has_clinical_access(uuid) IS
  'institution_has_patient_access, restricted to clinical roles. Use for anything a '
  'receptionist should not read; use the plain one for scheduling and billing, which are '
  'their work.';

-- ---------------------------------------------------------------------------
-- Clinical surfaces: restricted
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Clinicians read encounters for their patients" ON public.encounters;
CREATE POLICY "Clinicians read encounters for their patients"
  ON public.encounters FOR SELECT TO authenticated
  USING (
    clinician_user_id = auth.uid()
    OR public.clinician_has_patient_access(patient_user_id)
    OR public.is_assigned_to_patient(auth.uid(), patient_user_id)
    OR public.practice_has_clinical_access(patient_user_id)
  );

DROP POLICY IF EXISTS "Clinicians read internal notes for accessible patients" ON public.internal_notes;
CREATE POLICY "Clinicians read internal notes for accessible patients"
  ON public.internal_notes FOR SELECT TO authenticated
  USING (
    author_user_id = auth.uid()
    OR (
      visibility = 'team'
      AND (
        public.clinician_has_patient_access(patient_user_id)
        OR public.institution_has_clinical_access(patient_user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Institution team can view guidance for shared patients" ON public.clinician_guidance;
CREATE POLICY "Institution team can view guidance for shared patients"
  ON public.clinician_guidance FOR SELECT TO authenticated
  USING (public.institution_has_clinical_access(patient_user_id));

DROP POLICY IF EXISTS "Clinicians read care plans for their patients" ON public.fhir_care_plans;
CREATE POLICY "Clinicians read care plans for their patients"
  ON public.fhir_care_plans FOR SELECT TO authenticated
  USING (
    public.clinician_has_patient_access(patient_user_id)
    OR public.institution_has_clinical_access(patient_user_id)
  );

DROP POLICY IF EXISTS "Institution team can view shared vitals" ON public.vitals;
CREATE POLICY "Institution team can view shared vitals"
  ON public.vitals FOR SELECT TO authenticated
  USING (public.institution_has_clinical_permission(user_id, 'vitals'));

DROP POLICY IF EXISTS "Institution team can view shared medications" ON public.medications;
CREATE POLICY "Institution team can view shared medications"
  ON public.medications FOR SELECT TO authenticated
  USING (public.institution_has_clinical_permission(user_id, 'medications'));

DROP POLICY IF EXISTS "Read action log for accessible patients" ON public.patient_action_log;
CREATE POLICY "Read action log for accessible patients"
  ON public.patient_action_log FOR SELECT TO authenticated
  USING (
    public.clinician_has_patient_access(patient_user_id)
    OR public.practice_has_clinical_access(patient_user_id)
  );

-- ---------------------------------------------------------------------------
-- Administrative surfaces: unchanged, and deliberately so
--
-- Scheduling and billing are exactly what front-desk and billing staff are
-- employed to do. Restricting those would not protect a patient; it would stop
-- the clinic booking them in.
-- ---------------------------------------------------------------------------
COMMENT ON POLICY "Clinicians read appointments for their patients" ON public.fhir_appointments IS
  'Open to all active staff on purpose. Booking is front-desk work, and a receptionist who '
  'cannot see the diary cannot do their job. What they must not see is why the appointment '
  'is happening, which lives in encounters and care plans.';

COMMENT ON POLICY "Practice staff read invoices they raised" ON public.fhir_invoices IS
  'Open to all active staff on purpose — billing staff exist. The line items describe what '
  'was charged for, not what was found.';
