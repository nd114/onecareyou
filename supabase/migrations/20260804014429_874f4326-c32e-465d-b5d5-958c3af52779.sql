-- 1. has_role must not be callable by unauthenticated visitors
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

-- 2. Reuse get_current_user_email() instead of duplicating auth.users lookups
CREATE OR REPLACE FUNCTION public.clinician_has_patient_access(patient_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.provider_shares ps
    WHERE ps.user_id = patient_user_id
      AND ps.is_active = true
      AND (ps.expires_at IS NULL OR ps.expires_at > now())
      AND (
        ps.clinician_user_id = auth.uid()
        OR ps.provider_email = public.get_current_user_email()
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.clinician_has_patient_permission(patient_user_id uuid, permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    CASE WHEN auth.uid() IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.provider_shares ps
      WHERE ps.user_id = patient_user_id
        AND ps.is_active = true
        AND (ps.expires_at IS NULL OR ps.expires_at > now())
        AND (
          ps.clinician_user_id = auth.uid()
          OR ps.provider_email = public.get_current_user_email()
        )
        AND (ps.permissions->>permission_key)::boolean = true
    )
    END
$function$;

-- 3. Resume uploads must land in a unique random folder with an allowed file type
DROP POLICY IF EXISTS "Anyone can upload resumes" ON storage.objects;

CREATE POLICY "Resume uploads must use a unique random path"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'resumes'
  AND array_length(storage.foldername(name), 1) = 1
  AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND name ~* '\.(pdf|doc|docx|rtf|txt|odt)$'
  AND octet_length(name) <= 300
);