-- Front desk and billing do not read the clinical record, all of it.
--
-- Two functions decide what a practice's staff may see of a patient who has
-- shared with it. institution_has_patient_permission asks whether the share
-- covers a category and whether this member has the patient on their roster.
-- institution_has_clinical_permission asks that and also whether the member
-- holds a clinical role (practice_role_is_clinical). Only the second belongs
-- on clinical data. vitals, encounters and notes use it; four other places
-- did not, so a receptionist or a biller with the roster still read the
-- patient's medication list, whether each dose was taken, the documents they
-- filed, and, through get_patient_clinical_profile, their diagnoses and
-- allergies (P0-3 in the Sept 2026 audit).
--
-- Medications had been fixed once, in 20260904044932, and 20260904213723
-- recreated the policy from an older copy and put the leak back. The
-- remaining three were never switched.
--
-- The same gap was open on two write paths. A front desk member could record
-- a clinician-sourced vital and propose starting, changing or stopping a
-- medication, both of which the patient sees as coming from their care team.
-- Those checks move to the clinical function too.
--
-- Each policy is recreated exactly as it stood, with only the permission
-- function changed. Front desk keeps what it was given for its own work —
-- appointments, invoices, identity and demographics — none of which is here.

-- ---------------------------------------------------------------------------
-- 1. Reads
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Institution team can view shared medications" ON public.medications;
CREATE POLICY "Institution team can view shared medications"
  ON public.medications FOR SELECT TO authenticated
  USING (public.institution_has_clinical_permission(user_id, 'medications'));

DROP POLICY IF EXISTS "Institution team can view shared schedules" ON public.schedule_entries;
CREATE POLICY "Institution team can view shared schedules"
  ON public.schedule_entries FOR SELECT TO authenticated
  USING (public.institution_has_clinical_permission(user_id, 'adherence'));

DROP POLICY IF EXISTS "Institution team can view shared documents" ON public.health_documents;
CREATE POLICY "Institution team can view shared documents"
  ON public.health_documents FOR SELECT
  USING (
    retracted_at IS NULL
    AND archived_at IS NULL
    AND COALESCE(source_context, '') <> 'patient_recording'
    AND public.institution_has_clinical_permission(user_id, 'documents')
  );

-- ---------------------------------------------------------------------------
-- 2. Diagnoses and allergies
--
-- Non-clinical staff still get a row for a patient on their roster, as they
-- did before, but with both clinical columns empty.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_patient_clinical_profile(patient_ids uuid[])
 RETURNS TABLE(user_id uuid, health_conditions jsonb, allergies jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.user_id,
    CASE
      WHEN p.user_id = auth.uid()
        OR public.clinician_has_patient_permission(p.user_id, 'conditions')
        OR public.institution_has_clinical_permission(p.user_id, 'conditions')
      THEN p.health_conditions
      ELSE NULL
    END,
    CASE
      WHEN p.user_id = auth.uid()
        OR public.clinician_has_patient_permission(p.user_id, 'allergies')
        OR public.institution_has_clinical_permission(p.user_id, 'allergies')
      THEN p.allergies
      ELSE NULL
    END
  FROM public.profiles p
  WHERE p.user_id = ANY(patient_ids)
    AND auth.uid() IS NOT NULL
    AND (
      p.user_id = auth.uid()
      OR public.clinician_has_patient_access(p.user_id)
      OR public.institution_has_patient_access(p.user_id)
    );
$function$;

-- ---------------------------------------------------------------------------
-- 3. Writes that speak for the care team
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Clinicians can record vitals for their patients" ON public.vitals;
CREATE POLICY "Clinicians can record vitals for their patients"
  ON public.vitals FOR INSERT TO authenticated
  WITH CHECK (
    recorded_by_user_id = auth.uid()
    AND user_id <> auth.uid()
    AND source = 'clinician'
    AND (
      public.clinician_has_patient_permission(user_id, 'vitals')
      OR public.institution_has_clinical_permission(user_id, 'vitals')
    )
  );

DROP POLICY IF EXISTS "Clinicians propose to patients who share with them" ON public.record_change_proposals;
CREATE POLICY "Clinicians propose to patients who share with them"
  ON public.record_change_proposals FOR INSERT TO authenticated
  WITH CHECK (
    proposed_by_user_id = auth.uid()
    AND patient_user_id <> auth.uid()
    AND status = 'pending'
    AND responded_at IS NULL
    AND applied_medication_id IS NULL
    AND (
      public.clinician_has_patient_permission(patient_user_id, 'medications')
      OR public.institution_has_clinical_permission(patient_user_id, 'medications')
    )
    AND (
      medication_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.medications m
         WHERE m.id = record_change_proposals.medication_id
           AND m.user_id = record_change_proposals.patient_user_id
      )
    )
  );
