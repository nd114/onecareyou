-- 1. beta_events: validate anonymous analytics inserts
DROP POLICY IF EXISTS "Anyone can log a beta event" ON public.beta_events;
CREATE POLICY "Anyone can log a validated beta event"
ON public.beta_events FOR INSERT TO anon, authenticated
WITH CHECK (
  event_name ~ '^[a-z0-9_\-]{3,80}$'
  AND source IN ('beta-landing','beta-booking','beta-book','beta-nda','careers','pricing')
  AND (metadata IS NULL OR (jsonb_typeof(metadata) = 'object' AND length(metadata::text) <= 2000))
);

-- 2. Former-clinician message history is bounded to the access window
CREATE OR REPLACE FUNCTION public.clinician_had_patient_access_at(
  patient_user_id uuid,
  at_time timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false
  ELSE EXISTS (
    SELECT 1
    FROM public.provider_shares ps
    WHERE ps.user_id = patient_user_id
      AND (
        ps.clinician_user_id = auth.uid()
        OR ps.provider_email = public.get_current_user_email()
      )
      -- message must have been created after access started
      AND at_time >= ps.created_at
      -- and before access ended (or while still active)
      AND at_time <= COALESCE(
            ps.revoked_at,
            CASE WHEN ps.is_active AND (ps.expires_at IS NULL OR ps.expires_at > now())
                 THEN now() ELSE ps.expires_at END,
            ps.created_at
          )
      -- ended relationships keep a bounded 90-day wind-down for read access
      AND (
        (ps.is_active AND (ps.expires_at IS NULL OR ps.expires_at > now()))
        OR COALESCE(ps.revoked_at, ps.expires_at, ps.created_at) > now() - interval '90 days'
      )
  )
  END
$$;

REVOKE ALL ON FUNCTION public.clinician_had_patient_access_at(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinician_had_patient_access_at(uuid, timestamptz) TO authenticated, service_role;

DROP POLICY IF EXISTS "Clinicians can read message history they took part in" ON public.messages;
CREATE POLICY "Clinicians can read message history they took part in"
ON public.messages FOR SELECT TO authenticated
USING (
  auth.uid() = clinician_user_id
  AND public.clinician_had_patient_access_at(patient_user_id, created_at)
);

-- 3. Resume access verified against the job application record
CREATE OR REPLACE FUNCTION public.can_read_resume_object(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false
  ELSE EXISTS (
    SELECT 1
    FROM public.job_applications ja
    WHERE ja.resume_path = object_name
      AND lower(ja.email) = lower(COALESCE(public.get_current_user_email(), ''))
  )
  END
$$;

REVOKE ALL ON FUNCTION public.can_read_resume_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_resume_object(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Applicants can read their own resumes" ON storage.objects;
CREATE POLICY "Applicants can read their own resumes"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'resumes' AND public.can_read_resume_object(name));