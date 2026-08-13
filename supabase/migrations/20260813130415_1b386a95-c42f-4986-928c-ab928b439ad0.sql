CREATE OR REPLACE FUNCTION public.get_practice_tenant_info(_practice_id uuid)
RETURNS TABLE(
  id uuid,
  slug text,
  tenant_type text,
  storage_limit_gb numeric,
  revenue_share_pct numeric,
  subscription_tier text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.slug, p.tenant_type, p.storage_limit_gb, p.revenue_share_pct, p.subscription_tier
  FROM public.practices p
  WHERE p.id = _practice_id
    AND (public.is_practice_member(_practice_id) OR public.has_role(auth.uid(), 'admin'));
$$;

REVOKE ALL ON FUNCTION public.get_practice_tenant_info(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_practice_tenant_info(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_institution_slug(_practice_id uuid, _slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean text;
BEGIN
  IF NOT (public.can_manage_practice(_practice_id) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only practice owners and admins can set the hospital code';
  END IF;

  clean := lower(trim(_slug));

  IF clean IS NULL OR length(clean) < 3 OR length(clean) > 32 THEN
    RAISE EXCEPTION 'Hospital code must be between 3 and 32 characters';
  END IF;

  IF clean !~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' THEN
    RAISE EXCEPTION 'Hospital code may only contain lowercase letters, numbers and hyphens';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.practices p
    WHERE lower(p.slug) = clean AND p.id <> _practice_id
  ) THEN
    RAISE EXCEPTION 'That hospital code is already taken';
  END IF;

  UPDATE public.practices SET slug = clean, updated_at = now() WHERE id = _practice_id;
  RETURN clean;
END;
$$;

REVOKE ALL ON FUNCTION public.set_institution_slug(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_institution_slug(uuid, text) TO authenticated;