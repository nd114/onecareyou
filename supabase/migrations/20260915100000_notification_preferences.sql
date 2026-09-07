-- Per-category notification preferences, and one place that decides.
--
-- What this replaces: three boolean columns on `profiles`
-- (`email_notifications_enabled`, `push_notifications_enabled`,
-- `weekly_adherence_report_enabled`) offered as switches in Settings. The first
-- was read by none of the ten functions that send mail. The second was read by
-- nothing that sends a reminder — the reminder path checked the browser's
-- permission instead, so switching it off left the phone buzzing. The third
-- gated an in-app report; nothing has ever sent a weekly email.
--
-- The failure was not that the senders forgot. It was that "did this person
-- want this?" had no single answer to ask for, so ten places each had to
-- remember, and a place that forgets looks exactly like a place that has
-- decided yes.
--
-- So: rows the person owns, a catalogue in code that says what may be stored
-- (supabase/functions/_shared/notification-catalogue.ts), and
-- `notification_allowed()` as the only thing a sender calls. A sender that does
-- not call it is now visibly a sender that does not call it.

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  -- Validated against the catalogue in code rather than a CHECK constraint: a
  -- new category should be a deploy, not a migration, and an unknown key is
  -- refused by notification_allowed() anyway.
  category text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'push', 'in_app')),
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category, channel)
);

COMMENT ON TABLE public.notification_preferences IS
  'One row per choice a person has actually made. Absence means "use the catalogue default" — not "off" — so adding a category never silently mutes anyone, and never silently starts mailing them either.';

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "People read their own notification preferences"
  ON public.notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "People set their own notification preferences"
  ON public.notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "People change their own notification preferences"
  ON public.notification_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "People clear their own notification preferences"
  ON public.notification_preferences FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_lookup
  ON public.notification_preferences(user_id, category, channel);

-- ---------------------------------------------------------------------------
-- The one accessor
-- ---------------------------------------------------------------------------

-- Categories a person may not switch off. Kept here as well as in the code
-- catalogue on purpose: a sender running with the service role must not be able
-- to suppress a safety alert because a row somewhere says false.
CREATE OR REPLACE FUNCTION public.notification_is_mandatory(_category text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _category IN (
    'account_security',   -- how a person keeps control of their account
    'patient_vital_alert' -- a threshold the clinician set, on a reading that matters
  );
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

  -- No row means the person has never expressed a view. The catalogue's default
  -- is "on" for everything currently offered, and defaulting to off here would
  -- silently stop mail that people already receive.
  RETURN COALESCE(v_enabled, true);
END;
$function$;

REVOKE ALL ON FUNCTION public.notification_allowed(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_allowed(uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.notification_allowed(uuid, text, text) IS
  'The only question a sender should ask. Mandatory categories always return true, whatever is stored.';

-- The three old columns stay for now. Dropping a column that a deployed client
-- still selects is a broken settings page for anyone on a stale bundle; they go
-- in a later migration once nothing reads them.
COMMENT ON COLUMN public.profiles.email_notifications_enabled IS
  'Superseded by notification_preferences. Read by nothing; retained until the next release removes the client references.';
