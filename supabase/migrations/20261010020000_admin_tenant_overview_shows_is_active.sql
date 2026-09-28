-- The tenant list says whether each tenant is active.
--
-- admin_tenant_overview() did not return is_active, so the admin console's
-- edit dialog had nothing to start its Active switch from and always opened it
-- switched on. admin_update_tenant() writes is_active from whatever the dialog
-- sends, so saving any change to a suspended tenant (a plan, a storage
-- allowance, a spelling fix in the name) quietly reactivated it, and patients
-- could find it again. Nothing in the list showed that it had been suspended
-- in the first place.
--
-- The function now returns is_active as its last column. Adding a column to
-- RETURNS TABLE cannot be done with CREATE OR REPLACE, so it is dropped and
-- recreated. The body is otherwise the one replayed from 20260813130332: the
-- same counts, the same order, and the same gate, which answers a caller
-- without the platform admin role with no rows rather than an error.
--
-- A dropped function loses its grants and a recreated one is executable by
-- PUBLIC, so they are set again as they stood: no PUBLIC, no anon
-- (20260814013717), and EXECUTE for authenticated and service_role.

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
