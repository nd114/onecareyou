DROP FUNCTION IF EXISTS public.admin_tenant_overview();

CREATE FUNCTION public.admin_tenant_overview()
RETURNS TABLE(
  id uuid,
  name text,
  slug text,
  tenant_type text,
  city text,
  country text,
  subscription_tier text,
  revenue_share_pct numeric,
  storage_limit_gb numeric,
  storage_bytes bigint,
  member_count bigint,
  active_share_count bigint,
  created_at timestamp with time zone,
  is_active boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    p.id,
    p.name,
    p.slug,
    p.tenant_type,
    p.city,
    p.country,
    p.subscription_tier,
    p.revenue_share_pct,
    p.storage_limit_gb,
    COALESCE((SELECT SUM(sl.bytes) FROM public.storage_ledger sl WHERE sl.practice_id = p.id), 0)::bigint,
    (SELECT COUNT(*) FROM public.practice_members pm WHERE pm.practice_id = p.id AND pm.status = 'active'),
    (SELECT COUNT(*) FROM public.practice_shares ps WHERE ps.practice_id = p.id AND ps.is_active = true),
    p.created_at,
    p.is_active
  FROM public.practices p
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY p.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.admin_tenant_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_tenant_overview() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_tenant_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_tenant_overview() TO service_role;