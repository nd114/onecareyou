-- Platform admin oversight (read-only) across tenants
CREATE POLICY "Platform admins can view all practices"
ON public.practices FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Platform admins can view all practice members"
ON public.practice_members FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Platform admins can view all institution shares"
ON public.practice_shares FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Hospital code availability check (no data leaked beyond a boolean)
CREATE OR REPLACE FUNCTION public.is_institution_slug_available(_slug text, _practice_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL OR _slug IS NULL OR length(trim(_slug)) < 3 THEN false
  ELSE NOT EXISTS (
    SELECT 1 FROM public.practices p
    WHERE lower(p.slug) = lower(trim(_slug))
      AND (_practice_id IS NULL OR p.id <> _practice_id)
  )
  END;
$$;

REVOKE ALL ON FUNCTION public.is_institution_slug_available(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_institution_slug_available(text, uuid) TO authenticated;

-- Platform admin tenant overview
CREATE OR REPLACE FUNCTION public.admin_tenant_overview()
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
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
    p.created_at
  FROM public.practices p
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY p.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_tenant_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_tenant_overview() TO authenticated;