-- The hospital code is the hospital's identifier: 3 to 7 characters.
--
-- It is what a patient types into Care Circle to connect, and what fronts the
-- tenant's own address (<code>.onecare.you). The old rule allowed up to 32,
-- which is fine for a URL and wrong for something people read off a card and
-- type on a phone. Tightening it here, in the availability check, and in the
-- client so all three agree.
--
-- Existing codes are not rewritten — a tenant already live on a longer code
-- keeps working. The limit applies to codes set from now on.

CREATE OR REPLACE FUNCTION public.set_institution_slug(_practice_id uuid, _slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean text;
BEGIN
  IF NOT public.can_manage_practice(_practice_id) THEN
    RAISE EXCEPTION 'Only practice owners and admins can set the hospital code';
  END IF;

  clean := lower(trim(_slug));

  IF length(clean) < 3 OR length(clean) > 7 THEN
    RAISE EXCEPTION 'Hospital code must be between 3 and 7 characters';
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

REVOKE ALL ON FUNCTION public.set_institution_slug(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_institution_slug(uuid, text) TO authenticated;

-- The availability check has to agree, or the UI shows a code as available and
-- then refuses to save it.
CREATE OR REPLACE FUNCTION public.is_institution_slug_available(_slug text, _practice_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR _slug IS NULL THEN false
    WHEN length(trim(_slug)) < 3 OR length(trim(_slug)) > 7 THEN false
    WHEN lower(trim(_slug)) !~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM public.practices p
      WHERE lower(p.slug) = lower(trim(_slug))
        AND (_practice_id IS NULL OR p.id <> _practice_id)
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.is_institution_slug_available(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_institution_slug_available(text, uuid) TO authenticated;

COMMENT ON COLUMN public.practices.slug IS
  'The hospital code: 3-7 lowercase characters, the identifier a patient types to connect and the '
  'label on <code>.onecare.you. Unique across tenants.';

-- Tenant creation from the platform console uses its own validation; keep it in
-- step so a tenant cannot be created with a code the tenant admin could never
-- set themselves.
DO $$
DECLARE
  _src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'admin_create_tenant'
  LIMIT 1;

  IF _src IS NOT NULL AND position('length(_clean_slug) > 32' in _src) > 0 THEN
    _src := replace(_src, 'length(_clean_slug) > 32', 'length(_clean_slug) > 7');
    EXECUTE _src;
  END IF;
END $$;
