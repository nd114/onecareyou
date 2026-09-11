-- ADV-31 fixed one instance of this. It was not the only one.
--
-- `confirmed_email()` exists precisely so identity can be matched on an
-- address someone has proved they can read, not one they merely typed at
-- sign-up. It was applied to accept_tenant_owner_invitation() and to
-- clinician_patient_records claiming. Everything built on the same
-- `x = get_current_user_email()` shape elsewhere in the schema was not
-- checked at the time, and grep says there is a lot of it.
--
-- The sharpest instance: a patient shares their record with
-- "dr.smith@clinic.com" before Dr Smith has an account — `provider_shares`
-- with `provider_email` set and `clinician_user_id` still null, which is the
-- documented, intended shape for exactly this case. Register that address,
-- unconfirmed, and "Clinicians can claim shares matching their email" hands
-- the row to you: `clinician_user_id` becomes yours, and every policy that
-- derives from provider_shares — document_shares, health_documents itself,
-- the health-documents and lab-reports storage buckets, share_events,
-- referrals — now reads you as the treating clinician. This is not a lesser
-- version of ADV-31; it reaches the actual clinical record where the tenant
-- invitation only reached who administers a hospital.
--
-- Two shapes below are lower stakes but the same bug and fixed the same way,
-- for the reason rule 7 exists: `patient_invitations` and
-- `practice_invitations` let an unconfirmed address view or act on an
-- invitation addressed to it, which is the identical claiming pattern one
-- level down the stack. `tenant_owner_invitations`, `practice_clinician_allowlist`
-- and `job_applications` only ever expose that something exists for an
-- address, never a capability — tightened anyway, because there is no reason
-- an unconfirmed address should see even that much about somebody else's
-- business with this platform.

-- ---------------------------------------------------------------------------
-- 0. The actual root: the two functions almost everything else calls
-- ---------------------------------------------------------------------------
-- onecare-map says it plainly: "Every RLS policy that lets somebody else read
-- a patient's data goes through one of two helpers." clinician_has_patient_
-- permission() is one of them, and it carried this exact hole — found only
-- because fixing the policies below and then testing against them still let
-- an unconfirmed address read a shared document, through this function
-- rather than through anything just rewritten. Fixing it here is what
-- actually closes vitals, medications, clinician_guidance, encounters and
-- everything else gated the same way, none of which are touched by name
-- below. institution_has_patient_permission() is practice-membership based,
-- not email based, and does not have this shape.

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
        OR lower(ps.provider_email) = public.confirmed_email()
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
          OR lower(ps.provider_email) = public.confirmed_email()
        )
        AND public.share_grants(ps.permissions, permission_key)
    )
    END
$function$;

-- ---------------------------------------------------------------------------
-- 1. provider_shares itself — the root of the whole chain
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Clinicians can claim shares matching their email" ON public.provider_shares;
CREATE POLICY "Clinicians can claim shares matching their email"
  ON public.provider_shares FOR UPDATE
  USING (lower(provider_email) = public.confirmed_email() AND clinician_user_id IS NULL)
  WITH CHECK (lower(provider_email) = public.confirmed_email() AND clinician_user_id = auth.uid());

DROP POLICY IF EXISTS "Clinicians can view shares by email or user_id" ON public.provider_shares;
CREATE POLICY "Clinicians can view shares by email or user_id"
  ON public.provider_shares FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = clinician_user_id OR lower(provider_email) = public.confirmed_email());

-- ---------------------------------------------------------------------------
-- 2. Everything that derives access through provider_shares.provider_email
-- ---------------------------------------------------------------------------
-- Each of these embeds its own copy of the email check rather than relying on
-- being able to SELECT provider_shares first, so each needs the same fix
-- independently — fixing the row above does not narrow these.

DROP POLICY IF EXISTS "Clinicians can view active shares for their patients" ON public.document_shares;
CREATE POLICY "Clinicians can view active shares for their patients"
  ON public.document_shares FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.provider_shares ps
       WHERE ps.id = document_shares.provider_share_id
         AND ps.is_active = true
         AND (ps.expires_at IS NULL OR ps.expires_at > now())
         AND (ps.clinician_user_id = auth.uid() OR lower(ps.provider_email) = public.confirmed_email())
    )
  );

DROP POLICY IF EXISTS "Users and shared clinicians can view documents" ON public.health_documents;
CREATE POLICY "Users and shared clinicians can view documents"
  ON public.health_documents FOR SELECT
  USING (
    retracted_at IS NULL
    AND (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1
          FROM public.document_shares ds
          JOIN public.provider_shares ps ON ds.provider_share_id = ps.id
         WHERE ds.document_id = health_documents.id
           AND ds.is_active = true
           AND ps.is_active = true
           AND (ps.expires_at IS NULL OR ps.expires_at > now())
           AND (ps.clinician_user_id = auth.uid() OR lower(ps.provider_email) = public.confirmed_email())
      )
    )
  );

DROP POLICY IF EXISTS "Clinicians can view shared health documents" ON storage.objects;
CREATE POLICY "Clinicians can view shared health documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'health-documents'
  AND EXISTS (
    SELECT 1
      FROM public.health_documents hd
      JOIN public.document_shares ds ON ds.document_id = hd.id
      JOIN public.provider_shares ps ON ps.id = ds.provider_share_id
     WHERE hd.file_path = storage.objects.name
       AND hd.retracted_at IS NULL
       AND ds.is_active = true
       AND ps.is_active = true
       AND (ps.expires_at IS NULL OR ps.expires_at > now())
       AND (ps.clinician_user_id = auth.uid() OR lower(ps.provider_email) = public.confirmed_email())
  )
);

DROP POLICY IF EXISTS "Clinicians can view shared lab reports" ON storage.objects;
CREATE POLICY "Clinicians can view shared lab reports"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'lab-reports'
  AND EXISTS (
    SELECT 1
      FROM public.health_documents hd
      JOIN public.document_shares ds ON ds.document_id = hd.id
      JOIN public.provider_shares ps ON ps.id = ds.provider_share_id
     WHERE hd.file_path = storage.objects.name
       AND hd.retracted_at IS NULL
       AND ds.is_active = true
       AND ps.is_active = true
       AND (ps.expires_at IS NULL OR ps.expires_at > now())
       AND (ps.clinician_user_id = auth.uid() OR lower(ps.provider_email) = public.confirmed_email())
  )
);

DROP POLICY IF EXISTS "Clinicians can view their own relationship history" ON public.share_events;
CREATE POLICY "Clinicians can view their own relationship history"
  ON public.share_events FOR SELECT
  USING (
    auth.uid() = clinician_user_id
    OR EXISTS (
      SELECT 1 FROM public.provider_shares ps
       WHERE ps.id = share_events.share_id
         AND (ps.clinician_user_id = auth.uid() OR lower(ps.provider_email) = public.confirmed_email())
    )
  );

DROP POLICY IF EXISTS "Participants can append share history" ON public.share_events;
CREATE POLICY "Participants can append share history"
  ON public.share_events FOR INSERT
  WITH CHECK (
    auth.uid() = actor_user_id
    AND EXISTS (
      SELECT 1 FROM public.provider_shares ps
       WHERE ps.id = share_events.share_id
         AND (ps.user_id = auth.uid() OR ps.clinician_user_id = auth.uid() OR lower(ps.provider_email) = public.confirmed_email())
    )
  );

DROP POLICY IF EXISTS "Referrals visible to from/to clinicians" ON public.referrals;
CREATE POLICY "Referrals visible to from/to clinicians"
  ON public.referrals FOR SELECT
  USING (
    auth.uid() = from_clinician_user_id
    OR auth.uid() = to_clinician_user_id
    OR lower(to_email) = public.confirmed_email()
  );

-- ---------------------------------------------------------------------------
-- 3. The same claiming shape, one level down the stack
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Patients can view invitations by email" ON public.patient_invitations;
CREATE POLICY "Patients can view invitations by email"
  ON public.patient_invitations FOR SELECT
  USING (lower(patient_email) = public.confirmed_email());

DROP POLICY IF EXISTS "Patients can accept or decline invitations" ON public.patient_invitations;
CREATE POLICY "Patients can accept or decline invitations"
  ON public.patient_invitations FOR UPDATE
  USING (lower(patient_email) = public.confirmed_email());

DROP POLICY IF EXISTS "Practice members can view invitations" ON public.practice_invitations;
CREATE POLICY "Practice members can view invitations"
  ON public.practice_invitations FOR SELECT
  USING (public.is_practice_member(practice_id) OR lower(email) = public.confirmed_email());

DROP POLICY IF EXISTS "Practice managers can update invitations" ON public.practice_invitations;
CREATE POLICY "Practice managers can update invitations"
  ON public.practice_invitations FOR UPDATE
  USING (public.can_manage_practice(practice_id) OR lower(email) = public.confirmed_email());

-- ---------------------------------------------------------------------------
-- 4. Existence-only leaks — no capability granted, tightened anyway
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Invited person can view their own invitation" ON public.tenant_owner_invitations;
CREATE POLICY "Invited person can view their own invitation"
ON public.tenant_owner_invitations FOR SELECT TO authenticated
USING (lower(email) = public.confirmed_email());

DROP POLICY IF EXISTS "Clinicians see their own allowlist entry" ON public.practice_clinician_allowlist;
CREATE POLICY "Clinicians see their own allowlist entry"
  ON public.practice_clinician_allowlist FOR SELECT
  USING (lower(email) = public.confirmed_email());

DROP POLICY IF EXISTS "Applicants can view their own applications" ON public.job_applications;
CREATE POLICY "Applicants can view their own applications"
  ON public.job_applications FOR SELECT
  USING (lower(email) = public.confirmed_email());

-- ---------------------------------------------------------------------------
-- 5. And the listing function ADV-31's fix left alone on purpose
-- ---------------------------------------------------------------------------
-- my_tenant_owner_invitations() only ever lists what accept_tenant_owner_invitation()
-- already refuses to act on for an unconfirmed address — but an unconfirmed
-- address seeing which hospital invited it is still more than it has earned.

CREATE OR REPLACE FUNCTION public.my_tenant_owner_invitations()
RETURNS TABLE(id uuid, practice_id uuid, practice_name text, tenant_type text, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.practice_id, p.name, p.tenant_type, i.expires_at
  FROM public.tenant_owner_invitations i
  JOIN public.practices p ON p.id = i.practice_id
  WHERE i.status = 'pending'
    AND i.expires_at > now()
    AND lower(i.email) = COALESCE(public.confirmed_email(), '')
  ORDER BY i.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.my_tenant_owner_invitations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_tenant_owner_invitations() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Six more, found by testing against the fix above rather than by grep
-- ---------------------------------------------------------------------------
-- Section 1's fix to clinician_has_patient_permission() was tested by trying
-- to read a shared document as the unconfirmed impostor — and it still
-- worked, through a *different* function than the one just fixed. These six
-- carry the identical `x = get_current_user_email()` shape and were not in
-- the original grep because they use it inside a larger function body rather
-- than directly in a policy's USING clause. Found by re-querying pg_proc for
-- every function whose source still mentions get_current_user_email() after
-- the policy fixes above, not by re-grepping migration files by hand.
--
-- request_practice_affiliation is the sharpest of the six: an unconfirmed
-- address whose domain matches a hospital's allowlist was granted *active*
-- practice_members status immediately — full staff membership, no email
-- ever proved. Swapping in confirmed_email() does not need an explicit
-- refusal: NULL fails every match in the function unchanged, so an
-- unconfirmed request now falls through to the pending_approval path that
-- already exists for anyone the allowlist does not recognise.

CREATE OR REPLACE FUNCTION public.get_clinician_basic_info(clinician_ids uuid[])
RETURNS TABLE(user_id uuid, first_name text, last_name text, title text, practice_name text, avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT cp.user_id, cp.first_name, cp.last_name, cp.title, cp.practice_name, cp.avatar_url
  FROM public.clinician_profiles cp
  WHERE cp.user_id = ANY(clinician_ids)
    AND auth.uid() IS NOT NULL
    AND (
      cp.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.clinician_patient_records cpr
        WHERE cpr.clinician_user_id = cp.user_id
          AND lower(cpr.patient_email) = public.confirmed_email()
          AND cpr.linked_user_id IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.provider_shares ps
        WHERE ps.clinician_user_id = cp.user_id
          AND ps.user_id = auth.uid()
          AND ps.is_active = true
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.clinician_had_patient_access(patient_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN auth.uid() IS NULL THEN false
  ELSE EXISTS (
    SELECT 1
    FROM public.provider_shares ps
    WHERE ps.user_id = patient_user_id
      AND (
        ps.clinician_user_id = auth.uid()
        OR lower(ps.provider_email) = public.confirmed_email()
      )
  )
  END
$function$;

CREATE OR REPLACE FUNCTION public.clinician_had_patient_access_at(patient_user_id uuid, at_time timestamp with time zone)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN auth.uid() IS NULL THEN false
  ELSE EXISTS (
    SELECT 1
    FROM public.provider_shares ps
    WHERE ps.user_id = patient_user_id
      AND (
        ps.clinician_user_id = auth.uid()
        OR lower(ps.provider_email) = public.confirmed_email()
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
$function$;

CREATE OR REPLACE FUNCTION public.get_patient_identity(patient_ids uuid[])
RETURNS TABLE(user_id uuid, name text, email text, phone_number text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.user_id, p.name, p.email, p.phone_number
  FROM public.profiles p
  WHERE p.user_id = ANY(patient_ids)
    AND auth.uid() IS NOT NULL
    AND (
      p.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.provider_shares ps
        WHERE ps.user_id = p.user_id
          AND ps.is_active = true
          AND (
            ps.clinician_user_id = auth.uid()
            OR lower(ps.provider_email) = public.confirmed_email()
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.clinician_patient_records cpr
        WHERE cpr.linked_user_id = p.user_id
          AND cpr.clinician_user_id = auth.uid()
      )
      OR public.institution_has_patient_access(p.user_id)
      OR EXISTS (
        SELECT 1 FROM public.practice_shares ps2
        WHERE ps2.user_id = p.user_id
          AND public.can_manage_practice(ps2.practice_id)
      )
    )
$function$;

CREATE OR REPLACE FUNCTION public.can_read_resume_object(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN auth.uid() IS NULL THEN false
  ELSE EXISTS (
    SELECT 1
    FROM public.job_applications ja
    WHERE ja.resume_path = object_name
      AND lower(ja.email) = COALESCE(public.confirmed_email(), '')
  )
  END
$function$;

CREATE OR REPLACE FUNCTION public.request_practice_affiliation(_slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _practice_id uuid;
  _email text;
  _domain text;
  _allowed boolean := false;
  _role public.practice_role := 'clinician';
  _department_id uuid;
  _existing text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;

  SELECT id INTO _practice_id
  FROM public.practices
  WHERE lower(slug) = lower(trim(_slug))
    AND COALESCE(is_active, true) = true;

  IF _practice_id IS NULL THEN
    RAISE EXCEPTION 'No hospital found with that code';
  END IF;

  SELECT status INTO _existing
  FROM public.practice_members
  WHERE practice_id = _practice_id AND user_id = auth.uid();

  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  -- NULL for an unconfirmed address. Every match below then fails, which is
  -- correct: an address nobody has proved should not fast-track anyone past
  -- an allowlist meant to name a specific, real member of staff.
  _email := public.confirmed_email();
  _domain := split_part(COALESCE(_email, ''), '@', 2);

  SELECT true, a.intended_role, a.department_id
    INTO _allowed, _role, _department_id
  FROM public.practice_clinician_allowlist a
  WHERE a.practice_id = _practice_id
    AND lower(a.email) = _email
  LIMIT 1;

  IF NOT COALESCE(_allowed, false) THEN
    SELECT COALESCE(_domain <> '' AND _domain = ANY(p.allowed_email_domains), false) INTO _allowed
    FROM public.practices p WHERE p.id = _practice_id;
  END IF;

  INSERT INTO public.practice_members (practice_id, user_id, role, status)
  VALUES (
    _practice_id,
    auth.uid(),
    COALESCE(_role, 'clinician'),
    CASE WHEN COALESCE(_allowed, false) THEN 'active' ELSE 'pending_approval' END
  );

  IF COALESCE(_allowed, false) AND _department_id IS NOT NULL THEN
    INSERT INTO public.practice_department_members (department_id, practice_id, user_id, is_lead)
    VALUES (_department_id, _practice_id, auth.uid(), false)
    ON CONFLICT (department_id, user_id) DO NOTHING;
  END IF;

  RETURN CASE WHEN COALESCE(_allowed, false) THEN 'active' ELSE 'pending_approval' END;
END;
$function$;
