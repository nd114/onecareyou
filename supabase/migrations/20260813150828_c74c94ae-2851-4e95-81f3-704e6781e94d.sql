-- Full tenant profile for platform admins
CREATE OR REPLACE FUNCTION public.admin_tenant_detail(_practice_id uuid)
RETURNS TABLE(
  id uuid, name text, slug text, tenant_type text, city text, country text,
  address text, state text, zip_code text, phone text, email text, npi text,
  subscription_tier text, subscription_status text, subscription_ends_at timestamptz,
  storage_limit_gb numeric, revenue_share_pct numeric,
  patient_limit integer, member_limit integer, is_active boolean,
  logo_url text, primary_color text, brand_logo_url text, brand_accent_color text,
  storage_bytes bigint, member_count bigint, active_share_count bigint,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.slug, p.tenant_type, p.city, p.country,
         p.address, p.state, p.zip_code, p.phone, p.email, p.npi,
         p.subscription_tier, p.subscription_status, p.subscription_ends_at,
         p.storage_limit_gb, p.revenue_share_pct,
         p.patient_limit, p.member_limit, p.is_active,
         p.logo_url, p.primary_color, p.brand_logo_url, p.brand_accent_color,
         public.get_practice_storage_bytes(p.id) AS storage_bytes,
         (SELECT count(*) FROM public.practice_members pm WHERE pm.practice_id = p.id) AS member_count,
         (SELECT count(*) FROM public.practice_shares ps WHERE ps.practice_id = p.id AND ps.is_active = true) AS active_share_count,
         p.created_at, p.updated_at
  FROM public.practices p
  WHERE p.id = _practice_id
    AND public.has_role(auth.uid(), 'admin');
$$;

REVOKE ALL ON FUNCTION public.admin_tenant_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_tenant_detail(uuid) TO authenticated;

-- Tenant team roster for platform admins
CREATE OR REPLACE FUNCTION public.admin_tenant_members(_practice_id uuid)
RETURNS TABLE(
  user_id uuid, email text, name text, role practice_role, status text,
  accepted_at timestamptz, created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pm.user_id, pr.email, pr.name, pm.role, pm.status, pm.accepted_at, pm.created_at
  FROM public.practice_members pm
  LEFT JOIN public.profiles pr ON pr.user_id = pm.user_id
  WHERE pm.practice_id = _practice_id
    AND public.has_role(auth.uid(), 'admin')
  ORDER BY pm.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.admin_tenant_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_tenant_members(uuid) TO authenticated;

-- Platform admins can set branding on a tenant's behalf
CREATE OR REPLACE FUNCTION public.admin_set_tenant_branding(
  _practice_id uuid,
  _logo_url text DEFAULT NULL,
  _primary_color text DEFAULT NULL,
  _accent_color text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only platform admins can change tenant branding';
  END IF;

  UPDATE public.practices
  SET brand_logo_url = COALESCE(NULLIF(_logo_url, ''), brand_logo_url),
      logo_url = COALESCE(NULLIF(_logo_url, ''), logo_url),
      primary_color = COALESCE(NULLIF(_primary_color, ''), primary_color),
      brand_accent_color = COALESCE(NULLIF(_accent_color, ''), brand_accent_color),
      updated_at = now()
  WHERE id = _practice_id;

  PERFORM public.log_platform_admin_action(
    'update_tenant_branding', 'practice', _practice_id,
    jsonb_build_object('logo_url', _logo_url, 'primary_color', _primary_color, 'accent_color', _accent_color)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_tenant_branding(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_tenant_branding(uuid, text, text, text) TO authenticated;

-- Public, pre-auth branded lookup used by the institution sign-up page
CREATE OR REPLACE FUNCTION public.public_institution_by_slug(_slug text)
RETURNS TABLE(
  id uuid, name text, slug text, city text, country text,
  tenant_type text, logo_url text, primary_color text, accent_color text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.slug, p.city, p.country, p.tenant_type,
         COALESCE(p.brand_logo_url, p.logo_url) AS logo_url,
         p.primary_color,
         p.brand_accent_color AS accent_color
  FROM public.practices p
  WHERE p.slug = lower(trim(_slug))
    AND COALESCE(p.is_active, true) = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.public_institution_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_institution_by_slug(text) TO anon, authenticated;