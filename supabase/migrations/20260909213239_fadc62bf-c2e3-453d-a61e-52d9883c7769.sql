ALTER TABLE public.clinician_dictations
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

COMMENT ON COLUMN public.clinician_dictations.archived_at IS
  'Set when the clinician archives the dictation. Nothing is deleted: a filed dictation is part of a patient record.';

CREATE INDEX IF NOT EXISTS idx_clinician_dictations_active
  ON public.clinician_dictations(clinician_user_id, created_at DESC)
  WHERE archived_at IS NULL;

DROP POLICY IF EXISTS "Clinicians delete own dictations" ON public.clinician_dictations;
DROP POLICY IF EXISTS "Clinicians delete own unfiled dictations" ON public.clinician_dictations;

CREATE POLICY "Clinicians delete own unfiled dictations"
  ON public.clinician_dictations FOR DELETE
  USING (
    auth.uid() = clinician_user_id
    AND status <> 'filed'
    AND filed_at IS NULL
    AND summary_approved_at IS NULL
  );

CREATE OR REPLACE FUNCTION public.practice_delete_department(
  _department_id uuid,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_dept public.practice_departments%ROWTYPE;
  v_members jsonb;
  v_patients jsonb;
BEGIN
  SELECT * INTO v_dept FROM public.practice_departments WHERE id = _department_id;
  IF v_dept.id IS NULL THEN
    RAISE EXCEPTION 'Department not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.practice_members pm
    WHERE pm.practice_id = v_dept.practice_id
      AND pm.user_id = auth.uid()
      AND pm.role = 'owner'
      AND pm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only the facility owner can delete a department';
  END IF;

  IF v_dept.is_active THEN
    RAISE EXCEPTION 'Archive the department before deleting it';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'user_id', pdm.user_id,
           'is_lead', pdm.is_lead
         )), '[]'::jsonb)
    INTO v_members
    FROM public.practice_department_members pdm
   WHERE pdm.department_id = _department_id;

  SELECT COALESCE(jsonb_agg(ppd.patient_user_id), '[]'::jsonb)
    INTO v_patients
    FROM public.practice_patient_departments ppd
   WHERE ppd.department_id = _department_id;

  INSERT INTO public.hipaa_audit_logs (
    user_id, action, resource_type, resource_id, details
  ) VALUES (
    auth.uid(),
    'department_deleted',
    'practice_department',
    _department_id::text,
    jsonb_build_object(
      'practice_id', v_dept.practice_id,
      'name', v_dept.name,
      'description', v_dept.description,
      'created_at', v_dept.created_at,
      'reason', _reason,
      'members', v_members,
      'patients', v_patients
    )
  );

  DELETE FROM public.practice_departments WHERE id = _department_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.practice_delete_department(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_delete_department(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.practice_delete_department(uuid, text) IS
  'Owner-only. Requires the department to be archived first. Writes the department''s full membership and patient routing into hipaa_audit_logs before deleting.';