-- An alert rule watches vitals, so creating one (or switching it back on)
-- needs a share that grants vitals. A share granting only medications used to
-- accept a rule that check-vital-alerts then skipped forever, silently.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(_condition boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _condition IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', _label; END IF;
  RAISE NOTICE '  ok — %', _label;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', COALESCE(_uid::text, ''), true);
  IF _uid IS NOT NULL THEN EXECUTE 'SET LOCAL ROLE authenticated'; END IF;
END;
$$;

DO $$
DECLARE
  _doc     uuid := 'a1e70000-0000-4000-8000-0000000000d1';
  _vitals  uuid := 'a1e70000-0000-4000-8000-0000000000a1';
  _medsonly uuid := 'a1e70000-0000-4000-8000-0000000000a2';
  _rule    uuid;
  _raised  boolean;
  _n       integer;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_doc,      'arv-doc@test.local',  now()),
    (_vitals,   'arv-p1@test.local',   now()),
    (_medsonly, 'arv-p2@test.local',   now());
  INSERT INTO public.clinician_profiles (user_id, first_name, last_name) VALUES (_doc, 'Alert', 'Doc');

  INSERT INTO public.provider_shares (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES
    (_vitals,   _doc, 'Alert Doc', 'arv-doc@test.local', 'ARVVITAL', '{"vitals": true}', true),
    (_medsonly, _doc, 'Alert Doc', 'arv-doc@test.local', 'ARVMEDS1', '{"medications": true}', true);

  PERFORM pg_temp.as_user(_doc);

  INSERT INTO public.clinician_alert_rules (clinician_user_id, patient_user_id, vital_type, condition, threshold_value)
  VALUES (_doc, _vitals, 'blood_pressure', 'above', 160)
  RETURNING id INTO _rule;
  PERFORM pg_temp.assert(_rule IS NOT NULL, 'a share granting vitals accepts an alert rule');

  _raised := false;
  BEGIN
    INSERT INTO public.clinician_alert_rules (clinician_user_id, patient_user_id, vital_type, condition, threshold_value)
    VALUES (_doc, _medsonly, 'blood_pressure', 'above', 160);
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'a share without vitals refuses a rule that could never fire');

  -- The patient withdraws vitals: the rule can be switched off, not back on.
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.provider_shares SET permissions = '{"medications": true}' WHERE user_id = _vitals;
  PERFORM pg_temp.as_user(_doc);

  UPDATE public.clinician_alert_rules SET is_active = false WHERE id = _rule;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 1, 'a rule can still be switched off once vitals are withdrawn');

  _raised := false;
  BEGIN
    UPDATE public.clinician_alert_rules SET is_active = true WHERE id = _rule;
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'and cannot be switched back on without vitals');

  RAISE NOTICE 'alert_rules_need_vitals: all assertions passed';
END $$;

ROLLBACK;
