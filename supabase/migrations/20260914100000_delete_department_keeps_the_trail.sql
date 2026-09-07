-- Deleting a department, without losing what it was.
--
-- Departments could be created and staffed and nothing else. Closing one is now
-- `is_active = false`, which is the ordinary case: a reorganisation, a ward that
-- moved, a name that stopped being used. The row stays and so does the record of
-- who worked in it and which patients it held.
--
-- Deletion is different and belongs to the facility's master admin alone. The
-- rule it has to satisfy: **the audit trail remains.** A DELETE takes the
-- department row and cascades through its members and its patient routings, so
-- an audit entry saying "department deleted" would point at three tables that no
-- longer hold the answer. The entry therefore carries the department's contents
-- with it — its name, who was in it, who led it, which patients were routed
-- there — written before anything is removed.
--
-- Two guards, both deliberate:
--   * Owner only. An admin can close a department; only the owner can end one.
--   * Archived first. A live department cannot be deleted in one action, so no
--     single click destroys something people are working in.

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

  -- The master admin of the facility, not any administrator.
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

  -- Everything the audit entry has to survive on, gathered before the delete.
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
  'Owner-only. Requires the department to be archived first. Writes the department''s full membership and patient routing into hipaa_audit_logs before deleting, so the trail survives the cascade.';
