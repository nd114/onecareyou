-- notification_allowed(): the single question a sender asks.
--
-- The two that matter most are 1 and 4. Absence of a row must mean "the
-- catalogue default", never "off" — otherwise shipping a new category silently
-- mutes mail people already rely on. And a stored row must never be able to
-- suppress a safety alert, which is why mandatory is decided in the database
-- and not only in the client that writes the rows.
DO $$
DECLARE v_user uuid := gen_random_uuid();
BEGIN
  IF NOT public.notification_allowed(v_user, 'care_circle_missed_doses', 'email') THEN
    RAISE EXCEPTION 'FAIL: absence of a row muted an existing notification';
  END IF;

  INSERT INTO public.notification_preferences(user_id, category, channel, enabled)
    VALUES (v_user, 'care_circle_missed_doses', 'email', false);
  IF public.notification_allowed(v_user, 'care_circle_missed_doses', 'email') THEN
    RAISE EXCEPTION 'FAIL: an explicit off was ignored';
  END IF;

  IF NOT public.notification_allowed(v_user, 'care_circle_missed_doses', 'push') THEN
    RAISE EXCEPTION 'FAIL: switching off one channel switched off another';
  END IF;

  INSERT INTO public.notification_preferences(user_id, category, channel, enabled)
    VALUES (v_user, 'patient_vital_alert', 'email', false);
  IF NOT public.notification_allowed(v_user, 'patient_vital_alert', 'email') THEN
    RAISE EXCEPTION 'FAIL: a stored row muted a clinician threshold alert';
  END IF;

  INSERT INTO public.notification_preferences(user_id, category, channel, enabled)
    VALUES (v_user, 'account_security', 'email', false);
  IF NOT public.notification_allowed(v_user, 'account_security', 'email') THEN
    RAISE EXCEPTION 'FAIL: account and security mail was muted';
  END IF;

  IF NOT public.notification_allowed(gen_random_uuid(), 'care_circle_missed_doses', 'email') THEN
    RAISE EXCEPTION 'FAIL: one persons preference leaked to another';
  END IF;

  RAISE NOTICE 'notification_preferences: 6 assertions passed';
END $$;
