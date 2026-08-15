CREATE OR REPLACE FUNCTION public.patient_institution_contact(_practice_id uuid)
RETURNS TABLE(
  id uuid, name text, address text, city text, state text, zip_code text,
  country text, phone text, email text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.name, p.address, p.city, p.state, p.zip_code,
         p.country, p.phone, p.email
  FROM public.practices p
  WHERE p.id = _practice_id
    AND EXISTS (
      SELECT 1 FROM public.practice_shares s
      WHERE s.practice_id = p.id
        AND s.user_id = auth.uid()
        AND s.is_active = true
    );
$function$;

REVOKE ALL ON FUNCTION public.patient_institution_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_institution_contact(uuid) TO authenticated;