WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY practice_id, patient_user_id, clinician_user_id
           ORDER BY effective_from ASC, created_at ASC, id ASC
         ) AS rn
  FROM public.practice_patient_assignments
  WHERE effective_from <= now()
    AND (effective_to IS NULL OR effective_to > now())
), ended AS (
  UPDATE public.practice_patient_assignments ppa
  SET effective_to = now(),
      notes = concat_ws(E'\n', nullif(ppa.notes, ''), 'Ended automatically: duplicate active assignment consolidated.'),
      updated_at = now()
  FROM ranked r
  WHERE ppa.id = r.id
    AND r.rn > 1
  RETURNING ppa.id, ppa.practice_id, ppa.patient_user_id, ppa.clinician_user_id, ppa.assigned_by
)
INSERT INTO public.patient_action_log (
  patient_user_id,
  actor_user_id,
  practice_id,
  action,
  ref_table,
  ref_id,
  summary,
  metadata
)
SELECT
  patient_user_id,
  COALESCE(assigned_by, clinician_user_id),
  practice_id,
  'duplicate_assignment_consolidated',
  'practice_patient_assignments',
  id,
  'A duplicate active hospital assignment was ended; the original assignment remains active.',
  jsonb_build_object('clinician_user_id', clinician_user_id)
FROM ended;

CREATE UNIQUE INDEX IF NOT EXISTS practice_patient_assignments_one_active_relationship
ON public.practice_patient_assignments (practice_id, patient_user_id, clinician_user_id)
WHERE effective_to IS NULL;

CREATE OR REPLACE FUNCTION public.assign_practice_patient(
  _practice_id uuid,
  _patient_user_id uuid,
  _clinician_user_id uuid,
  _department_id uuid DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS public.practice_patient_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _existing public.practice_patient_assignments;
  _created public.practice_patient_assignments;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_practice_capability(auth.uid(), 'assign_patients', _practice_id) THEN
    RAISE EXCEPTION 'You do not have permission to assign patients in this practice' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.practice_shares ps
    WHERE ps.practice_id = _practice_id
      AND ps.user_id = _patient_user_id
      AND ps.is_active = true
      AND ps.practice_suspended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This patient is not currently connected to the practice' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.practice_members pm
    WHERE pm.practice_id = _practice_id
      AND pm.user_id = _clinician_user_id
      AND pm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'The selected staff member is not active in this practice' USING ERRCODE = '23503';
  END IF;

  SELECT ppa.* INTO _existing
  FROM public.practice_patient_assignments ppa
  WHERE ppa.practice_id = _practice_id
    AND ppa.patient_user_id = _patient_user_id
    AND ppa.clinician_user_id = _clinician_user_id
    AND ppa.effective_to IS NULL
  ORDER BY ppa.effective_from ASC, ppa.created_at ASC
  LIMIT 1;

  IF _existing.id IS NOT NULL THEN
    RETURN _existing;
  END IF;

  INSERT INTO public.practice_patient_assignments (
    practice_id,
    patient_user_id,
    clinician_user_id,
    department_id,
    assigned_by,
    notes
  ) VALUES (
    _practice_id,
    _patient_user_id,
    _clinician_user_id,
    _department_id,
    auth.uid(),
    _notes
  )
  ON CONFLICT (practice_id, patient_user_id, clinician_user_id)
    WHERE effective_to IS NULL
  DO UPDATE SET updated_at = public.practice_patient_assignments.updated_at
  RETURNING * INTO _created;

  INSERT INTO public.patient_action_log (
    patient_user_id,
    actor_user_id,
    practice_id,
    action,
    ref_table,
    ref_id,
    summary,
    metadata
  ) VALUES (
    _patient_user_id,
    auth.uid(),
    _practice_id,
    'patient_assigned',
    'practice_patient_assignments',
    _created.id,
    'Patient assigned to a hospital staff member.',
    jsonb_build_object(
      'clinician_user_id', _clinician_user_id,
      'department_id', _department_id
    )
  );

  RETURN _created;
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_practice_patient(uuid, uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_practice_patient(uuid, uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_practice_patient(uuid, uuid, uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.is_assigned_to_patient_in_practice(
  _user_id uuid,
  _patient_user_id uuid,
  _practice_id uuid
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
    JOIN public.practice_members pm
      ON pm.practice_id = ppa.practice_id
     AND pm.user_id = ppa.clinician_user_id
    JOIN public.practices p
      ON p.id = ppa.practice_id
    WHERE ppa.practice_id = _practice_id
      AND ppa.patient_user_id = _patient_user_id
      AND ppa.clinician_user_id = _user_id
      AND ppa.effective_from <= now()
      AND (ppa.effective_to IS NULL OR ppa.effective_to > now())
      AND ps.is_active = true
      AND ps.practice_suspended_at IS NULL
      AND pm.status = 'active'
      AND p.is_active = true
  );
$function$;

REVOKE ALL ON FUNCTION public.is_assigned_to_patient_in_practice(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_assigned_to_patient_in_practice(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_assigned_to_patient_in_practice(uuid, uuid, uuid) TO service_role;

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
    JOIN public.practice_members pm
      ON pm.practice_id = ppa.practice_id
     AND pm.user_id = ppa.clinician_user_id
    JOIN public.practices p
      ON p.id = ppa.practice_id
    WHERE ppa.patient_user_id = _patient_user_id
      AND ppa.clinician_user_id = _user_id
      AND ppa.effective_from <= now()
      AND (ppa.effective_to IS NULL OR ppa.effective_to > now())
      AND ps.is_active = true
      AND ps.practice_suspended_at IS NULL
      AND pm.status = 'active'
      AND p.is_active = true
  );
$function$;

REVOKE ALL ON FUNCTION public.is_assigned_to_patient(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_assigned_to_patient(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_assigned_to_patient(uuid, uuid) TO service_role;