-- admin_create_tenant has allowed hospital codes of 3 to 7 characters since
-- 20260815060000_hospital_code_length, but its error message still said 3-32,
-- so a platform admin rejected for an 8-character code was told a limit that
-- would have allowed it. The rule is unchanged; only the message now matches.
CREATE OR REPLACE FUNCTION public.admin_create_tenant(_name text, _tenant_type text DEFAULT 'practice'::text, _city text DEFAULT NULL::text, _country text DEFAULT NULL::text, _subscription_tier text DEFAULT 'trial'::text, _storage_limit_gb numeric DEFAULT 25, _revenue_share_pct numeric DEFAULT 0, _slug text DEFAULT NULL::text, _patient_limit integer DEFAULT 25, _member_limit integer DEFAULT 5, _address text DEFAULT NULL::text, _state text DEFAULT NULL::text, _zip_code text DEFAULT NULL::text, _phone text DEFAULT NULL::text, _email text DEFAULT NULL::text, _npi text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
  _clean_slug text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only platform admins can create tenants';
  END IF;

  IF _name IS NULL OR length(trim(_name)) < 2 THEN
    RAISE EXCEPTION 'Tenant name is required';
  END IF;

  IF _tenant_type NOT IN ('practice', 'hospital') THEN
    RAISE EXCEPTION 'Tenant type must be practice or hospital';
  END IF;

  IF _slug IS NOT NULL AND length(trim(_slug)) > 0 THEN
    _clean_slug := lower(trim(_slug));
    IF _clean_slug !~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' OR length(_clean_slug) < 3 OR length(_clean_slug) > 7 THEN
      RAISE EXCEPTION 'Hospital code must be 3-7 characters of lowercase letters, numbers or hyphens';
    END IF;
    IF EXISTS (SELECT 1 FROM public.practices WHERE lower(slug) = _clean_slug) THEN
      RAISE EXCEPTION 'That hospital code is already taken';
    END IF;
  END IF;

  INSERT INTO public.practices (
    name, tenant_type, city, country, subscription_tier,
    storage_limit_gb, revenue_share_pct, slug, patient_limit, member_limit, created_by,
    address, state, zip_code, phone, email, npi
  ) VALUES (
    trim(_name), _tenant_type, _city, COALESCE(_country, 'US'), COALESCE(_subscription_tier, 'trial'),
    COALESCE(_storage_limit_gb, 25), COALESCE(_revenue_share_pct, 0), _clean_slug,
    COALESCE(_patient_limit, 25), COALESCE(_member_limit, 5), auth.uid(),
    NULLIF(trim(COALESCE(_address, '')), ''), NULLIF(trim(COALESCE(_state, '')), ''),
    NULLIF(trim(COALESCE(_zip_code, '')), ''), NULLIF(trim(COALESCE(_phone, '')), ''),
    NULLIF(lower(trim(COALESCE(_email, ''))), ''), NULLIF(trim(COALESCE(_npi, '')), '')
  ) RETURNING id INTO _id;

  DELETE FROM public.practice_members WHERE practice_id = _id AND user_id = auth.uid();

  PERFORM public.log_platform_admin_action('create_tenant', 'practice', _id,
    jsonb_build_object('name', trim(_name), 'tenant_type', _tenant_type, 'slug', _clean_slug));

  RETURN _id;
END;
$function$;

