CREATE OR REPLACE FUNCTION public.admin_recent_signups(_limit integer DEFAULT 20)
RETURNS TABLE(user_id uuid, email text, name text, is_clinician boolean, created_at timestamp with time zone)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id,
         p.email::text,
         p.name,
         EXISTS (SELECT 1 FROM public.clinician_profiles cp WHERE cp.user_id = p.user_id),
         p.created_at
  FROM public.profiles p
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY p.created_at DESC
  LIMIT LEAST(COALESCE(_limit, 20), 200);
$$;

REVOKE ALL ON FUNCTION public.admin_recent_signups(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recent_signups(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recent_signups(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_access_log_search(_search text DEFAULT NULL, _limit integer DEFAULT 100)
RETURNS TABLE(id uuid, action text, actor_email text, target_email text, resource_type text, resource_id uuid, created_at timestamp with time zone)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id,
         l.action,
         actor.email::text,
         target.email::text,
         l.resource_type,
         l.resource_id,
         l.created_at
  FROM public.access_audit_logs l
  LEFT JOIN public.profiles actor ON actor.user_id = l.actor_user_id
  LEFT JOIN public.profiles target ON target.user_id = l.target_user_id
  WHERE public.has_role(auth.uid(), 'admin')
    AND (
      _search IS NULL OR length(trim(_search)) = 0
      OR l.action ILIKE '%' || trim(_search) || '%'
      OR actor.email ILIKE '%' || trim(_search) || '%'
      OR target.email ILIKE '%' || trim(_search) || '%'
    )
  ORDER BY l.created_at DESC
  LIMIT LEAST(COALESCE(_limit, 100), 200);
$$;

REVOKE ALL ON FUNCTION public.admin_access_log_search(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_access_log_search(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_access_log_search(text, integer) TO service_role;