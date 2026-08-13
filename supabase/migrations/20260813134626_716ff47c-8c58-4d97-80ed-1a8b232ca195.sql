-- 1. Platform admin action log
CREATE TABLE public.platform_admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_admin_actions TO authenticated;
GRANT ALL ON public.platform_admin_actions TO service_role;
ALTER TABLE public.platform_admin_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can view admin actions"
ON public.platform_admin_actions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_platform_admin_actions_created ON public.platform_admin_actions (created_at DESC);

-- 2. Tenant owner invitations
CREATE TABLE public.tenant_owner_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  email text NOT NULL,
  invited_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  accepted_at timestamptz,
  accepted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tenant_owner_invitations TO authenticated;
GRANT ALL ON public.tenant_owner_invitations TO service_role;
ALTER TABLE public.tenant_owner_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can view tenant invitations"
ON public.tenant_owner_invitations FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Invited person can view their own invitation"
ON public.tenant_owner_invitations FOR SELECT TO authenticated
USING (lower(email) = lower(public.get_current_user_email()));

CREATE TRIGGER tenant_owner_invitations_updated_at
BEFORE UPDATE ON public.tenant_owner_invitations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX idx_tenant_owner_invitations_pending
ON public.tenant_owner_invitations (practice_id, lower(email))
WHERE status = 'pending';

-- 3. Internal logging helper
CREATE OR REPLACE FUNCTION public.log_platform_admin_action(
  _action text, _target_type text, _target_id uuid, _details jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.platform_admin_actions (actor_user_id, action, target_type, target_id, details)
  SELECT auth.uid(), _action, _target_type, _target_id, COALESCE(_details, '{}'::jsonb)
  WHERE public.has_role(auth.uid(), 'admin');
$$;

REVOKE ALL ON FUNCTION public.log_platform_admin_action(text, text, uuid, jsonb) FROM PUBLIC, anon;

-- 4. Tenant creation
CREATE OR REPLACE FUNCTION public.admin_create_tenant(
  _name text,
  _tenant_type text DEFAULT 'practice',
  _city text DEFAULT NULL,
  _country text DEFAULT NULL,
  _subscription_tier text DEFAULT 'trial',
  _storage_limit_gb numeric DEFAULT 25,
  _revenue_share_pct numeric DEFAULT 0,
  _slug text DEFAULT NULL,
  _patient_limit integer DEFAULT 25,
  _member_limit integer DEFAULT 5
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    IF _clean_slug !~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' OR length(_clean_slug) < 3 OR length(_clean_slug) > 32 THEN
      RAISE EXCEPTION 'Hospital code must be 3-32 characters of lowercase letters, numbers or hyphens';
    END IF;
    IF EXISTS (SELECT 1 FROM public.practices WHERE lower(slug) = _clean_slug) THEN
      RAISE EXCEPTION 'That hospital code is already taken';
    END IF;
  END IF;

  INSERT INTO public.practices (
    name, tenant_type, city, country, subscription_tier,
    storage_limit_gb, revenue_share_pct, slug, patient_limit, member_limit, created_by
  ) VALUES (
    trim(_name), _tenant_type, _city, COALESCE(_country, 'US'), COALESCE(_subscription_tier, 'trial'),
    COALESCE(_storage_limit_gb, 25), COALESCE(_revenue_share_pct, 0), _clean_slug,
    COALESCE(_patient_limit, 25), COALESCE(_member_limit, 5), auth.uid()
  ) RETURNING id INTO _id;

  -- The tenant belongs to its invited owner, not to OneCare staff: drop the
  -- auto-created owner membership so the tenant starts empty.
  DELETE FROM public.practice_members WHERE practice_id = _id AND user_id = auth.uid();

  PERFORM public.log_platform_admin_action('create_tenant', 'practice', _id,
    jsonb_build_object('name', trim(_name), 'tenant_type', _tenant_type, 'slug', _clean_slug));

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_tenant(text, text, text, text, text, numeric, numeric, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_tenant(text, text, text, text, text, numeric, numeric, text, integer, integer) TO authenticated;

-- 5. Tenant update
CREATE OR REPLACE FUNCTION public.admin_update_tenant(
  _practice_id uuid,
  _name text DEFAULT NULL,
  _tenant_type text DEFAULT NULL,
  _city text DEFAULT NULL,
  _country text DEFAULT NULL,
  _subscription_tier text DEFAULT NULL,
  _storage_limit_gb numeric DEFAULT NULL,
  _revenue_share_pct numeric DEFAULT NULL,
  _patient_limit integer DEFAULT NULL,
  _member_limit integer DEFAULT NULL,
  _is_active boolean DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only platform admins can update tenants';
  END IF;

  IF _tenant_type IS NOT NULL AND _tenant_type NOT IN ('practice', 'hospital') THEN
    RAISE EXCEPTION 'Tenant type must be practice or hospital';
  END IF;

  UPDATE public.practices SET
    name = COALESCE(NULLIF(trim(COALESCE(_name, '')), ''), name),
    tenant_type = COALESCE(_tenant_type, tenant_type),
    city = COALESCE(_city, city),
    country = COALESCE(_country, country),
    subscription_tier = COALESCE(_subscription_tier, subscription_tier),
    storage_limit_gb = COALESCE(_storage_limit_gb, storage_limit_gb),
    revenue_share_pct = COALESCE(_revenue_share_pct, revenue_share_pct),
    patient_limit = COALESCE(_patient_limit, patient_limit),
    member_limit = COALESCE(_member_limit, member_limit),
    is_active = COALESCE(_is_active, is_active),
    updated_at = now()
  WHERE id = _practice_id;

  PERFORM public.log_platform_admin_action('update_tenant', 'practice', _practice_id,
    jsonb_build_object('tier', _subscription_tier, 'storage_limit_gb', _storage_limit_gb,
                       'revenue_share_pct', _revenue_share_pct, 'is_active', _is_active));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_tenant(uuid, text, text, text, text, text, numeric, numeric, integer, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_tenant(uuid, text, text, text, text, text, numeric, numeric, integer, integer, boolean) TO authenticated;

-- 6. Tenant owner invitations
CREATE OR REPLACE FUNCTION public.admin_invite_tenant_owner(_practice_id uuid, _email text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only platform admins can invite tenant owners';
  END IF;

  IF _email IS NULL OR _email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'A valid email address is required';
  END IF;

  INSERT INTO public.tenant_owner_invitations (practice_id, email, invited_by)
  VALUES (_practice_id, lower(trim(_email)), auth.uid())
  RETURNING id INTO _id;

  PERFORM public.log_platform_admin_action('invite_tenant_owner', 'practice', _practice_id,
    jsonb_build_object('email', lower(trim(_email))));

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_invite_tenant_owner(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_invite_tenant_owner(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_cancel_tenant_invitation(_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only platform admins can cancel invitations';
  END IF;

  UPDATE public.tenant_owner_invitations
     SET status = 'cancelled', updated_at = now()
   WHERE id = _invitation_id AND status = 'pending';

  PERFORM public.log_platform_admin_action('cancel_tenant_invitation', 'invitation', _invitation_id, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cancel_tenant_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_tenant_invitation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_tenant_owner_invitation(_invitation_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _inv public.tenant_owner_invitations;
BEGIN
  SELECT * INTO _inv FROM public.tenant_owner_invitations WHERE id = _invitation_id;

  IF _inv.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF _inv.status <> 'pending' OR _inv.expires_at < now() THEN
    RAISE EXCEPTION 'This invitation is no longer valid';
  END IF;

  IF lower(_inv.email) <> lower(COALESCE(public.get_current_user_email(), '')) THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address';
  END IF;

  INSERT INTO public.practice_members (
    practice_id, user_id, role, can_invite_patients, can_invite_members,
    can_manage_billing, can_view_all_patients, can_manage_settings, status, accepted_at
  ) VALUES (
    _inv.practice_id, auth.uid(), 'owner', true, true, true, true, true, 'active', now()
  )
  ON CONFLICT (practice_id, user_id) DO UPDATE
    SET role = 'owner', status = 'active', accepted_at = now();

  UPDATE public.tenant_owner_invitations
     SET status = 'accepted', accepted_at = now(), accepted_by = auth.uid(), updated_at = now()
   WHERE id = _invitation_id;

  RETURN _inv.practice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_tenant_owner_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_tenant_owner_invitation(uuid) TO authenticated;

-- 7. Delegated platform admin access
CREATE OR REPLACE FUNCTION public.admin_grant_platform_admin(_email text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _target uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only platform admins can delegate admin access';
  END IF;

  SELECT id INTO _target FROM auth.users WHERE lower(email) = lower(trim(_email));

  IF _target IS NULL THEN
    RAISE EXCEPTION 'No OneCare account exists for that email yet. Ask them to sign up first.';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (_target, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  PERFORM public.log_platform_admin_action('grant_platform_admin', 'user', _target,
    jsonb_build_object('email', lower(trim(_email))));

  RETURN _target;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_platform_admin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_platform_admin(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_revoke_platform_admin(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only platform admins can revoke admin access';
  END IF;

  SELECT COUNT(*) INTO _count FROM public.user_roles WHERE role = 'admin';

  IF _count <= 1 THEN
    RAISE EXCEPTION 'Cannot remove the last remaining platform admin';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'admin';

  PERFORM public.log_platform_admin_action('revoke_platform_admin', 'user', _user_id, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_platform_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_platform_admin(uuid) TO authenticated;

-- 8. Admin read helpers
CREATE OR REPLACE FUNCTION public.admin_list_platform_admins()
RETURNS TABLE(user_id uuid, email text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ur.user_id, u.email::text, ur.created_at
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.role = 'admin' AND public.has_role(auth.uid(), 'admin')
  ORDER BY ur.created_at;
$$;

REVOKE ALL ON FUNCTION public.admin_list_platform_admins() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_platform_admins() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_tenant_invitations()
RETURNS TABLE(id uuid, practice_id uuid, practice_name text, email text, status text, expires_at timestamptz, accepted_at timestamptz, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.practice_id, p.name, i.email, i.status, i.expires_at, i.accepted_at, i.created_at
  FROM public.tenant_owner_invitations i
  JOIN public.practices p ON p.id = i.practice_id
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY i.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_list_tenant_invitations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_tenant_invitations() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_recent_actions(_limit integer DEFAULT 50)
RETURNS TABLE(id uuid, actor_email text, action text, target_type text, target_id uuid, details jsonb, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, u.email::text, a.action, a.target_type, a.target_id, a.details, a.created_at
  FROM public.platform_admin_actions a
  LEFT JOIN auth.users u ON u.id = a.actor_user_id
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY a.created_at DESC
  LIMIT LEAST(COALESCE(_limit, 50), 200);
$$;

REVOKE ALL ON FUNCTION public.admin_recent_actions(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_recent_actions(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_tenant_owner_invitations()
RETURNS TABLE(id uuid, practice_id uuid, practice_name text, tenant_type text, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.practice_id, p.name, p.tenant_type, i.expires_at
  FROM public.tenant_owner_invitations i
  JOIN public.practices p ON p.id = i.practice_id
  WHERE i.status = 'pending'
    AND i.expires_at > now()
    AND auth.uid() IS NOT NULL
    AND lower(i.email) = lower(COALESCE(public.get_current_user_email(), ''))
  ORDER BY i.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.my_tenant_owner_invitations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_tenant_owner_invitations() TO authenticated;