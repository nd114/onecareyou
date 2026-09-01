-- The audit log cannot be written by the account it describes.
--
-- hipaa_audit_logs accepted INSERT from the browser under a policy whose only
-- check was that the actor named themselves. Everything else was the client's
-- to choose — the action, the resource, the details, and patient_user_id. A
-- clinician could record an access they never made against a patient they had
-- no relationship with, label a real access with a milder action, or bury a
-- genuine entry under noise. It is the compensating control for tenant
-- visibility being broad, so it has to be evidence rather than testimony.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/audit_log_integrity.test.sql

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(_condition boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _condition IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', _label; END IF;
  RAISE NOTICE '  ok — %', _label;
END;
$$;

DO $$
DECLARE
  _patient   uuid := 'e9000000-0000-0000-0000-000000000001';
  _doctor    uuid := 'e9000000-0000-0000-0000-000000000002';
  _stranger  uuid := 'e9000000-0000-0000-0000-000000000003';
  _outsider  uuid := 'e9000000-0000-0000-0000-000000000004';
  _count integer; _txt text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_patient,'al-patient@test.local'), (_doctor,'al-doctor@test.local'),
    (_stranger,'al-stranger@test.local'), (_outsider,'al-outsider@test.local');

  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES (_patient, _doctor, 'Dr Audit', 'al-doctor@test.local', 'altest',
          '{"vitals":true,"meds":true,"adherence":true,"profile":true}'::jsonb, true);

  -- ==========================================================================
  -- 1. The browser can no longer author an entry at all
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.hipaa_audit_logs (user_id, action, resource_type, patient_user_id)
    VALUES (_doctor, 'record_viewed', 'vitals', _patient);
    _txt := 'inserted';
  EXCEPTION WHEN insufficient_privilege THEN
    _txt := 'denied';
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_txt = 'denied',
    'a signed-in clinician cannot write an audit entry directly');

  -- ==========================================================================
  -- 2. Nor can they rewrite or delete one
  -- ==========================================================================
  PERFORM public.log_record_access(_patient, 'vitals', NULL, 'vitals_viewed');
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.log_record_access(_patient, 'vitals', NULL, 'vitals_viewed');
  BEGIN
    UPDATE public.hipaa_audit_logs SET action = 'nothing_happened' WHERE user_id = _doctor;
    _txt := 'updated';
  EXCEPTION WHEN insufficient_privilege THEN
    _txt := 'denied';
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_txt = 'denied', 'nor can they relabel an entry after the fact');

  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    DELETE FROM public.hipaa_audit_logs WHERE user_id = _doctor;
    _txt := 'deleted';
  EXCEPTION WHEN insufficient_privilege THEN
    _txt := 'denied';
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_txt = 'denied', 'nor delete one');

  SELECT count(*) INTO _count FROM public.hipaa_audit_logs WHERE user_id = _doctor;
  PERFORM pg_temp.assert(_count = 2, 'and the entries that were legitimately made are still there');

  -- ==========================================================================
  -- 3. The function records a real access
  -- ==========================================================================
  SELECT action INTO _txt FROM public.hipaa_audit_logs
   WHERE user_id = _doctor AND patient_user_id = _patient LIMIT 1;
  PERFORM pg_temp.assert(_txt = 'vitals_viewed', 'the action the clinician named is recorded');

  -- ==========================================================================
  -- 4. It refuses to record an access the caller could not have made
  --
  -- This is the substance: without it the log holds claims, not events.
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _stranger::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.log_record_access(_patient, 'vitals', NULL, 'vitals_viewed');
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT count(*) INTO _count FROM public.hipaa_audit_logs WHERE user_id = _stranger;
  PERFORM pg_temp.assert(_count = 0,
    'a clinician with no access to the patient cannot plant an entry against them');

  -- ==========================================================================
  -- 5. An action outside the set is stored as what it is, not as given
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.log_record_access(_patient, 'vitals', NULL, 'looked_at_nothing_important');
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT count(*) INTO _count FROM public.hipaa_audit_logs
   WHERE action = 'looked_at_nothing_important';
  PERFORM pg_temp.assert(_count = 0, 'an invented action is not stored as given');
  SELECT count(*) INTO _count FROM public.hipaa_audit_logs
   WHERE user_id = _doctor AND action = 'record_viewed';
  PERFORM pg_temp.assert(_count = 1, 'it falls back to record_viewed rather than being dropped');

  -- ==========================================================================
  -- 6. Reading your own record is not an access event
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.log_record_access(_patient, 'vitals', NULL, 'vitals_viewed');
  EXECUTE 'SET LOCAL ROLE postgres';
  SELECT count(*) INTO _count FROM public.hipaa_audit_logs WHERE user_id = _patient;
  PERFORM pg_temp.assert(_count = 0, 'a patient opening their own record logs nothing');

  -- ==========================================================================
  -- 7. The older three-argument call still works
  --
  -- A client deployed against the previous schema must keep logging through a
  -- rollout rather than failing silently.
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.log_record_access(_patient, 'documents', 'doc-1');
  EXECUTE 'SET LOCAL ROLE postgres';
  SELECT count(*) INTO _count FROM public.hipaa_audit_logs
   WHERE resource_type = 'documents' AND action = 'record_viewed';
  PERFORM pg_temp.assert(_count = 1, 'the three-argument form still records an access');

  -- ==========================================================================
  -- 8. The subject can still read their own log
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.hipaa_audit_logs;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count > 0, 'the actor can still read back their own entries');

  PERFORM set_config('request.jwt.claim.sub', _outsider::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.hipaa_audit_logs;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'an unrelated account reads none of it');

  -- ==========================================================================
  -- 9. The write side is still covered by triggers
  -- ==========================================================================
  SELECT count(*) INTO _count
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE NOT t.tgisinternal AND t.tgname LIKE 'trg_audit_%';
  PERFORM pg_temp.assert(_count >= 6,
    'the change-logging triggers from 20260819160000 are still attached');

  RAISE NOTICE 'ALL AUDIT LOG INTEGRITY TESTS PASSED';
END $$;

ROLLBACK;
