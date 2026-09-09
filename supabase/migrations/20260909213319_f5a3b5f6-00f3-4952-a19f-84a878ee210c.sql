CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'push', 'in_app')),
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category, channel)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

COMMENT ON TABLE public.notification_preferences IS
  'One row per choice a person has actually made. Absence means "use the catalogue default".';

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "People read their own notification preferences" ON public.notification_preferences;
CREATE POLICY "People read their own notification preferences"
  ON public.notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "People set their own notification preferences" ON public.notification_preferences;
CREATE POLICY "People set their own notification preferences"
  ON public.notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "People change their own notification preferences" ON public.notification_preferences;
CREATE POLICY "People change their own notification preferences"
  ON public.notification_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "People clear their own notification preferences" ON public.notification_preferences;
CREATE POLICY "People clear their own notification preferences"
  ON public.notification_preferences FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_lookup
  ON public.notification_preferences(user_id, category, channel);

CREATE OR REPLACE FUNCTION public.notification_is_mandatory(_category text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _category IN ('account_security', 'patient_vital_alert');
$$;

CREATE OR REPLACE FUNCTION public.notification_allowed(
  _user_id uuid,
  _category text,
  _channel text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_enabled boolean;
BEGIN
  IF public.notification_is_mandatory(_category) THEN
    RETURN true;
  END IF;

  SELECT enabled INTO v_enabled
    FROM public.notification_preferences
   WHERE user_id = _user_id
     AND category = _category
     AND channel = _channel;

  RETURN COALESCE(v_enabled, true);
END;
$function$;

REVOKE ALL ON FUNCTION public.notification_allowed(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_allowed(uuid, text, text) TO authenticated, service_role;

COMMENT ON COLUMN public.profiles.email_notifications_enabled IS
  'Superseded by notification_preferences.';

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS assignment_first_access boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.practices.assignment_first_access IS
  'When true, a clinician at this practice sees only patients assigned to them.';

CREATE OR REPLACE FUNCTION public.practice_member_default_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.role IN ('owner', 'admin') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.practices p
     WHERE p.id = NEW.practice_id
       AND p.assignment_first_access
  ) THEN
    NEW.can_view_all_patients := false;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_practice_member_default_scope ON public.practice_members;
CREATE TRIGGER trg_practice_member_default_scope
  BEFORE INSERT ON public.practice_members
  FOR EACH ROW EXECUTE FUNCTION public.practice_member_default_scope();

CREATE OR REPLACE FUNCTION public.practice_set_assignment_first(
  _practice_id uuid,
  _enabled boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_changed integer;
BEGIN
  IF NOT public.can_manage_practice(_practice_id) THEN
    RAISE EXCEPTION 'Only the practice owner or an admin can change how access is scoped';
  END IF;

  UPDATE public.practices
     SET assignment_first_access = _enabled
   WHERE id = _practice_id;

  UPDATE public.practice_members
     SET can_view_all_patients = NOT _enabled
   WHERE practice_id = _practice_id
     AND role NOT IN ('owner', 'admin')
     AND can_view_all_patients IS DISTINCT FROM (NOT _enabled);

  GET DIAGNOSTICS v_changed = ROW_COUNT;

  INSERT INTO public.hipaa_audit_logs (user_id, action, resource_type, resource_id, details)
  VALUES (
    auth.uid(),
    CASE WHEN _enabled THEN 'assignment_first_enabled' ELSE 'assignment_first_disabled' END,
    'practice',
    _practice_id::text,
    jsonb_build_object('members_changed', v_changed)
  );

  RETURN v_changed;
END;
$function$;

REVOKE ALL ON FUNCTION public.practice_set_assignment_first(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_set_assignment_first(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_signin_allowed(_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _key text := lower(btrim(COALESCE(_email, '')));
  _ip text := public.request_client_ip();
BEGIN
  IF _key = '' THEN
    RETURN;
  END IF;

  PERFORM public.enforce_rate_limit(
    'signin_email', _key, 10, interval '15 minutes',
    'Too many sign-in attempts for this email. Wait a few minutes, or reset your password.'
  );

  IF _ip IS NOT NULL AND btrim(_ip) <> '' THEN
    PERFORM public.enforce_rate_limit(
      'signin_ip', _ip, 50, interval '15 minutes',
      'Too many sign-in attempts from this connection. Please wait a few minutes.'
    );
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.check_signin_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_signin_allowed(text) TO anon, authenticated;