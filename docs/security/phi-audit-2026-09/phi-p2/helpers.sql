CREATE OR REPLACE FUNCTION public.is_assigned_to_patient(_user_id uuid, _patient_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_patient_assignments ppa
    JOIN public.practice_shares ps
      ON ps.practice_id = ppa.practice_id
     AND ps.user_id = ppa.patient_user_id
    WHERE ppa.patient_user_id = _patient_user_id
      AND ppa.clinician_user_id = _user_id
      AND (ppa.effective_to IS NULL OR ppa.effective_to > now())
      AND ppa.effective_from <= now()
      -- The patient's own switch, and the practice's. Both were already
      -- required by every other gate; this one was not asking.
      AND ps.is_active = true
      AND ps.practice_suspended_at IS NULL
  );
$function$

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
$function$

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
$function$

CREATE OR REPLACE FUNCTION public.institution_has_patient_access(patient_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM public.practice_shares ps
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    WHERE ps.user_id = patient_user_id
      AND ps.is_active = true
      AND ps.practice_suspended_at IS NULL
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND (
        pm.can_view_all_patients = true
        OR public.is_assigned_to_patient_in_practice(auth.uid(), patient_user_id, ps.practice_id)
      )
  ) END;
$function$

CREATE OR REPLACE FUNCTION public.institution_has_clinical_access(patient_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM public.practice_shares ps
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    WHERE ps.user_id = patient_user_id
      AND ps.is_active = true
      AND ps.practice_suspended_at IS NULL
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND public.practice_role_is_clinical(pm.role)
      AND (
        pm.can_view_all_patients = true
        OR public.is_assigned_to_patient_in_practice(auth.uid(), patient_user_id, ps.practice_id)
      )
  ) END;
$function$

CREATE OR REPLACE FUNCTION public.institution_has_patient_permission(patient_user_id uuid, permission_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM public.practice_shares ps
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    WHERE ps.user_id = patient_user_id
      AND ps.is_active = true
      AND ps.practice_suspended_at IS NULL
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND (
        pm.can_view_all_patients = true
        OR public.is_assigned_to_patient_in_practice(auth.uid(), patient_user_id, ps.practice_id)
      )
      AND (
        ps.share_all = true
        OR public.share_grants(ps.permissions, permission_key)
      )
  ) END;
$function$

CREATE OR REPLACE FUNCTION public.practice_has_clinical_access(patient_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_shares ps
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    WHERE ps.user_id = patient_uuid
      AND ps.is_active = true
      AND ps.practice_suspended_at IS NULL
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND pm.can_view_all_patients = true
      AND public.practice_role_is_clinical(pm.role)
  )
$function$

CREATE OR REPLACE FUNCTION public.practice_has_patient_access(patient_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_shares ps
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    WHERE ps.user_id = patient_uuid
      AND ps.is_active = true                 -- the patient's decision
      AND ps.practice_suspended_at IS NULL    -- the practice's own switch
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND pm.can_view_all_patients = true
  )
$function$

CREATE OR REPLACE FUNCTION public.share_grants(permissions jsonb, permission_key text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
  SELECT CASE
    -- Canonical names, and the older spellings that mean the same thing.
    WHEN permission_key = 'medications' THEN
      public.share_granted_flag(permissions, 'medications')
      OR public.share_granted_flag(permissions, 'meds')

    -- 'profile' was one grant covering both lists. It stays readable as such,
    -- so a share written before this migration keeps opening what it opened.
    WHEN permission_key IN ('conditions', 'allergies') THEN
      public.share_granted_flag(permissions, permission_key)
      OR public.share_granted_flag(permissions, 'profile')

    -- Aliases run one way only. 'profile' still opens each clinical list,
    -- because it was one permission covering both. The reverse does not hold:
    -- 'profile' opens the whole profiles row — name, date of birth, blood
    -- type, contact details — so somebody who granted 'conditions' and
    -- 'allergies' granted two lists and not those. Treating the pair as adding
    -- up to 'profile' would widen a share past what the patient agreed to.

    ELSE public.share_granted_flag(permissions, permission_key)
  END), false);
$function$

CREATE OR REPLACE FUNCTION public.practice_role_is_clinical(_role practice_role)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT _role IN (
    'owner',      -- in most practices on this platform the owner is the doctor
    'admin',
    'sub_admin',  -- a department lead, per the tenancy plan
    'provider',
    'clinician',
    'nurse'
  );
$function$

CREATE OR REPLACE FUNCTION public.is_practice_member(practice_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_members
    WHERE practice_id = practice_uuid
      AND user_id = auth.uid()
      AND status = 'active'
  )
$function$

CREATE OR REPLACE FUNCTION public.can_manage_practice(practice_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_members
    WHERE practice_id = practice_uuid
      AND user_id = auth.uid()
      AND status = 'active'
      AND role IN ('owner', 'admin')
  )
$function$

