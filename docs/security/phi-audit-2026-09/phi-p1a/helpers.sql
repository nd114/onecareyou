-- ===== can_manage_practice(uuid) definer=true
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


-- ===== clinician_has_patient_access(uuid) definer=true
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


-- ===== clinician_has_patient_permission(uuid,text) definer=true
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


-- ===== confirmed_email() definer=true
CREATE OR REPLACE FUNCTION public.confirmed_email()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT lower(u.email)
    FROM auth.users u
   WHERE u.id = auth.uid()
     AND u.email_confirmed_at IS NOT NULL
$function$


-- ===== has_role(uuid,app_role) definer=true
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$


-- ===== institution_has_patient_access(uuid) definer=true
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


-- ===== institution_has_patient_permission(uuid,text) definer=true
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


-- ===== is_department_lead(uuid) definer=true
CREATE OR REPLACE FUNCTION public.is_department_lead(_practice_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM public.practice_department_members pdm
    JOIN public.practice_members pm
      ON pm.practice_id = pdm.practice_id AND pm.user_id = pdm.user_id AND pm.status = 'active'
    WHERE pdm.user_id = auth.uid()
      AND pdm.practice_id = _practice_id
      AND pdm.is_lead = true
  ) END;
$function$


-- ===== is_practice_member(uuid) definer=true
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


-- ===== led_department_ids() definer=true
CREATE OR REPLACE FUNCTION public.led_department_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(pdm.department_id), '{}')
  FROM public.practice_department_members pdm
  JOIN public.practice_members pm
    ON pm.practice_id = pdm.practice_id AND pm.user_id = pdm.user_id AND pm.status = 'active'
  WHERE pdm.user_id = auth.uid()
    AND pdm.is_lead = true;
$function$


-- ===== practice_role_is_clinical(practice_role) definer=false
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


-- ===== share_grants(jsonb,text) definer=false
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

