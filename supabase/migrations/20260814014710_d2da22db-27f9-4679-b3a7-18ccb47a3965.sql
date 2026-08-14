REVOKE EXECUTE ON FUNCTION public.find_institution_by_slug(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.find_institution_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_institution_by_slug(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_institution_by_slug(text) TO service_role;