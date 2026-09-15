REVOKE ALL ON FUNCTION public.guard_provider_share_consent() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_provider_share_consent() TO service_role;