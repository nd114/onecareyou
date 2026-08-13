CREATE OR REPLACE FUNCTION public.find_institution_by_slug(_slug text)
RETURNS TABLE(id uuid, name text, city text, country text, logo_url text, tenant_type text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.city, p.country, p.logo_url, p.tenant_type
  FROM public.practices p
  WHERE auth.uid() IS NOT NULL
    AND p.is_active IS NOT false
    AND p.slug IS NOT NULL
    AND lower(p.slug) = lower(trim(_slug))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_institution_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_institution_by_slug(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_institution_basic_info(_practice_ids uuid[])
RETURNS TABLE(id uuid, name text, city text, country text, logo_url text, tenant_type text, slug text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.city, p.country, p.logo_url, p.tenant_type, p.slug
  FROM public.practices p
  WHERE p.id = ANY(_practice_ids)
    AND auth.uid() IS NOT NULL
    AND (
      public.is_practice_member(p.id)
      OR EXISTS (
        SELECT 1 FROM public.practice_shares ps
        WHERE ps.practice_id = p.id AND ps.user_id = auth.uid()
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_institution_basic_info(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_institution_basic_info(uuid[]) TO authenticated;