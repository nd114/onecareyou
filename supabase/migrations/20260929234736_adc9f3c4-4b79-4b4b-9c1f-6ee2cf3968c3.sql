-- Staff who have left a practice, and staff who are not clinical, no longer
-- read or write encounters through a leftover patient assignment.
-- (See supabase/migrations/20261009030000_removed_staff_lose_the_record.sql for the full rationale.)

DROP POLICY IF EXISTS "Clinicians read encounters for their patients" ON public.encounters;
CREATE POLICY "Clinicians read encounters for their patients"
ON public.encounters FOR SELECT
USING (
  clinician_user_id = auth.uid()
  OR public.clinician_has_patient_access(patient_user_id)
  OR public.institution_has_clinical_access(patient_user_id)
);

DROP POLICY IF EXISTS "Clinicians create encounters for accessible patients" ON public.encounters;
CREATE POLICY "Clinicians create encounters for accessible patients"
ON public.encounters FOR INSERT
WITH CHECK (
  clinician_user_id = auth.uid()
  AND (
    public.clinician_has_patient_access(patient_user_id)
    OR public.institution_has_clinical_access(patient_user_id)
  )
);

DROP POLICY IF EXISTS "Read addenda of a readable note" ON public.encounter_addenda;
CREATE POLICY "Read addenda of a readable note"
ON public.encounter_addenda FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.encounters e
    WHERE e.id = encounter_addenda.encounter_id
      AND (
        e.clinician_user_id = auth.uid()
        OR public.clinician_has_patient_access(e.patient_user_id)
        OR public.institution_has_clinical_access(e.patient_user_id)
      )
  )
);

CREATE OR REPLACE FUNCTION public.is_assigned_to_patient(_user_id uuid, _patient_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_members pm
    WHERE pm.user_id = _user_id
      AND pm.status = 'active'
      AND public.practice_role_is_clinical(pm.role)
      AND public.is_assigned_to_patient_in_practice(_user_id, _patient_user_id, pm.practice_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.end_assignments_of_departed_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'active'
     OR NOT public.practice_role_is_clinical(NEW.role) THEN
    UPDATE public.practice_patient_assignments
       SET effective_to = now()
     WHERE practice_id = NEW.practice_id
       AND clinician_user_id = NEW.user_id
       AND (effective_to IS NULL OR effective_to > now());
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.end_assignments_of_departed_member() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_end_assignments_of_departed_member ON public.practice_members;
CREATE TRIGGER trg_end_assignments_of_departed_member
AFTER UPDATE OF status, role ON public.practice_members
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status OR NEW.role IS DISTINCT FROM OLD.role)
EXECUTE FUNCTION public.end_assignments_of_departed_member();