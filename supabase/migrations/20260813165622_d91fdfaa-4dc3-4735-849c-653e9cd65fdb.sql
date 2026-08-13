CREATE OR REPLACE FUNCTION public.practice_contact_details(_practice_id uuid)
RETURNS TABLE(
  id uuid, name text, address text, city text, state text, zip_code text,
  country text, phone text, email text, npi text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.name, p.address, p.city, p.state, p.zip_code,
         p.country, p.phone, p.email, p.npi
  FROM public.practices p
  WHERE p.id = _practice_id
    AND (public.is_practice_member(_practice_id) OR public.has_role(auth.uid(), 'admin'));
$function$;

REVOKE ALL ON FUNCTION public.practice_contact_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.practice_contact_details(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.practice_set_contact(
  _practice_id uuid,
  _address text DEFAULT NULL,
  _city text DEFAULT NULL,
  _state text DEFAULT NULL,
  _zip_code text DEFAULT NULL,
  _country text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _email text DEFAULT NULL,
  _npi text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_manage_practice(_practice_id) THEN
    RAISE EXCEPTION 'Only the practice owner or an admin can update these details';
  END IF;

  IF _email IS NOT NULL AND length(trim(_email)) > 0
     AND trim(_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address';
  END IF;

  UPDATE public.practices SET
    address   = NULLIF(trim(COALESCE(_address, '')), ''),
    city      = NULLIF(trim(COALESCE(_city, '')), ''),
    state     = NULLIF(trim(COALESCE(_state, '')), ''),
    zip_code  = NULLIF(trim(COALESCE(_zip_code, '')), ''),
    country   = NULLIF(trim(COALESCE(_country, '')), ''),
    phone     = NULLIF(trim(COALESCE(_phone, '')), ''),
    email     = NULLIF(lower(trim(COALESCE(_email, ''))), ''),
    npi       = NULLIF(trim(COALESCE(_npi, '')), ''),
    updated_at = now()
  WHERE id = _practice_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.practice_set_contact(uuid, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.practice_set_contact(uuid, text, text, text, text, text, text, text, text) TO authenticated;