-- 1) Real names for practice team lists (clinicians often have no patient profile row)
CREATE OR REPLACE FUNCTION public.practice_member_directory(_practice_id uuid)
RETURNS TABLE(
  member_id uuid,
  user_id uuid,
  display_name text,
  email text,
  avatar_url text,
  specialty text,
  title text,
  first_name text,
  last_name text,
  role practice_role,
  status text,
  can_view_all_patients boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    pm.id,
    pm.user_id,
    COALESCE(
      NULLIF(btrim(concat_ws(' ', cp.title, cp.first_name, cp.last_name)), ''),
      NULLIF(btrim(pr.name), ''),
      NULLIF(pr.email, ''),
      u.email,
      'Team member'
    ) AS display_name,
    COALESCE(NULLIF(pr.email, ''), u.email) AS email,
    cp.avatar_url,
    cp.specialty,
    cp.title,
    cp.first_name,
    cp.last_name,
    pm.role,
    pm.status,
    COALESCE(pm.can_view_all_patients, false),
    pm.created_at
  FROM public.practice_members pm
  LEFT JOIN public.clinician_profiles cp ON cp.user_id = pm.user_id
  LEFT JOIN public.profiles pr ON pr.user_id = pm.user_id
  LEFT JOIN auth.users u ON u.id = pm.user_id
  WHERE pm.practice_id = _practice_id
    AND auth.uid() IS NOT NULL
    AND public.is_practice_member(_practice_id)
  ORDER BY pm.role, 3;
$function$;

REVOKE ALL ON FUNCTION public.practice_member_directory(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.practice_member_directory(uuid) TO authenticated, service_role;

-- 2) Staff overview should prefer the clinician's professional name, then fall back to email
CREATE OR REPLACE FUNCTION public.practice_staff_overview(_practice_id uuid)
RETURNS TABLE(user_id uuid, name text, email text, role practice_role, status text, departments text[], leads_departments text[], assigned_patient_count bigint, has_tenant_wide_view boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    pm.user_id,
    COALESCE(
      NULLIF(btrim(concat_ws(' ', cp.title, cp.first_name, cp.last_name)), ''),
      NULLIF(btrim(pr.name), ''),
      NULLIF(pr.email, ''),
      u.email
    ) AS name,
    COALESCE(NULLIF(pr.email, ''), u.email) AS email,
    pm.role,
    pm.status,
    COALESCE((
      SELECT array_agg(d.name ORDER BY d.name)
      FROM public.practice_department_members pdm
      JOIN public.practice_departments d ON d.id = pdm.department_id
      WHERE pdm.user_id = pm.user_id AND pdm.practice_id = _practice_id
    ), '{}'),
    COALESCE((
      SELECT array_agg(d.name ORDER BY d.name)
      FROM public.practice_department_members pdm
      JOIN public.practice_departments d ON d.id = pdm.department_id
      WHERE pdm.user_id = pm.user_id AND pdm.practice_id = _practice_id AND pdm.is_lead
    ), '{}'),
    (
      SELECT count(*)
      FROM public.practice_patient_assignments ppa
      WHERE ppa.clinician_user_id = pm.user_id
        AND ppa.practice_id = _practice_id
        AND (ppa.effective_to IS NULL OR ppa.effective_to > now())
    ),
    COALESCE(pm.can_view_all_patients, false)
  FROM public.practice_members pm
  LEFT JOIN public.profiles pr ON pr.user_id = pm.user_id
  LEFT JOIN public.clinician_profiles cp ON cp.user_id = pm.user_id
  LEFT JOIN auth.users u ON u.id = pm.user_id
  WHERE pm.practice_id = _practice_id
    AND (public.can_manage_practice(_practice_id) OR public.is_department_lead(_practice_id))
  ORDER BY pm.role, 2 NULLS LAST;
$function$;

-- 3) Let owners/admins rename their practice
CREATE OR REPLACE FUNCTION public.practice_set_name(_practice_id uuid, _name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_manage_practice(_practice_id) THEN
    RAISE EXCEPTION 'Only the practice owner or an admin can rename the practice';
  END IF;

  IF _name IS NULL OR length(btrim(_name)) < 2 THEN
    RAISE EXCEPTION 'Enter a practice name of at least 2 characters';
  END IF;

  UPDATE public.practices
     SET name = btrim(_name), updated_at = now()
   WHERE id = _practice_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.practice_set_name(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.practice_set_name(uuid, text) TO authenticated, service_role;