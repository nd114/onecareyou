-- The audit log records what was done to a patient's record.
--
-- Before this, useHipaaAuditLog was dead code and the only thing that ever
-- reached hipaa_audit_logs was a patient revoking a share — so a compliance
-- pack showed page views and empty patient columns. Worse, what little was
-- recorded was written by the client, which meant the log said whatever the
-- client chose to say.
--
-- These assert the two properties that make the log worth having: a change
-- cannot be made without being recorded, and a read cannot be forged.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/audit_trail.test.sql

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
  _patient  uuid := 'a9000000-0000-0000-0000-000000000001';
  _stranger uuid := 'a9000000-0000-0000-0000-000000000002';
  _doc      uuid := 'a9000000-0000-0000-0000-000000000003';
  _outsider uuid := 'a9000000-0000-0000-0000-000000000004';
  _count integer; _actor uuid; _pat uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_patient,'aud-patient@test.local'), (_stranger,'aud-stranger@test.local'),
    (_doc,'aud-doc@test.local'), (_outsider,'aud-outsider@test.local');

  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES (_patient, _doc, 'Dr Aud', 'aud-doc@test.local', 'audtst',
          '{"vitals":true,"meds":true,"adherence":true,"profile":true}'::jsonb, true);

  DELETE FROM public.hipaa_audit_logs;  -- start from a known state

  -- ==========================================================================
  -- 1. Issuing guidance records itself — the clinician has no say in it
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _doc::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.clinician_guidance
    (clinician_user_id, patient_user_id, title, instruction)
  VALUES (_doc, _patient, 'Check your BP', 'Twice daily for two weeks.');
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT count(*) INTO _count FROM public.hipaa_audit_logs WHERE action = 'guidance_issued';
  SELECT user_id, patient_user_id INTO _actor, _pat
    FROM public.hipaa_audit_logs WHERE action = 'guidance_issued' LIMIT 1;
  PERFORM pg_temp.assert(_count = 1, 'issuing guidance writes an audit entry');
  PERFORM pg_temp.assert(_actor = _doc, 'the entry names the clinician who did it');
  PERFORM pg_temp.assert(_pat = _patient, 'the entry names the patient it concerned');

  -- ==========================================================================
  -- 2. Changing guidance later is recorded too, distinctly from issuing it
  --    (misattributing a row to another clinician is not tested here because
  --    RLS refuses the insert outright — a stronger guarantee than the log.)
  -- ==========================================================================
  DELETE FROM public.hipaa_audit_logs;
  PERFORM set_config('request.jwt.claim.sub', _doc::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.clinician_guidance
     SET instruction = 'Three times daily instead.'
   WHERE patient_user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT count(*) INTO _count FROM public.hipaa_audit_logs
   WHERE action = 'guidance_issued_updated';
  PERFORM pg_temp.assert(_count = 1, 'amending guidance is recorded as a change, not a new issue');

  SELECT user_id INTO _actor FROM public.hipaa_audit_logs
   WHERE action = 'guidance_issued_updated' LIMIT 1;
  PERFORM pg_temp.assert(_actor = _doc, 'the amendment names the clinician from the session');

  -- ==========================================================================
  -- 3. Consent changes are recorded
  -- ==========================================================================
  DELETE FROM public.hipaa_audit_logs;
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.provider_shares SET is_active = false WHERE user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT count(*) INTO _count FROM public.hipaa_audit_logs
   WHERE action = 'provider_share_updated' AND patient_user_id = _patient;
  PERFORM pg_temp.assert(_count = 1, 'ending a share is recorded');

  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.provider_shares SET is_active = true WHERE user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';

  -- ==========================================================================
  -- 4. A read is logged for a clinician who has access
  -- ==========================================================================
  DELETE FROM public.hipaa_audit_logs;
  PERFORM set_config('request.jwt.claim.sub', _doc::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.log_record_access(_patient, 'patient_record', NULL);
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT count(*) INTO _count FROM public.hipaa_audit_logs WHERE action = 'record_viewed';
  PERFORM pg_temp.assert(_count = 1, 'a clinician opening a record they may see is logged');

  -- ==========================================================================
  -- 5. Someone with no access cannot write themselves an access entry
  -- ==========================================================================
  DELETE FROM public.hipaa_audit_logs;
  PERFORM set_config('request.jwt.claim.sub', _outsider::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.log_record_access(_patient, 'patient_record', NULL);
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT count(*) INTO _count FROM public.hipaa_audit_logs;
  PERFORM pg_temp.assert(_count = 0,
    'a caller with no access to the patient cannot log a read of them');

  -- ==========================================================================
  -- 6. Reading your own record is not an access event
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.log_record_access(_patient, 'patient_record', NULL);
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT count(*) INTO _count FROM public.hipaa_audit_logs;
  PERFORM pg_temp.assert(_count = 0, 'a patient reading their own record is not logged as access');

  -- ==========================================================================
  -- 7. Server-side work does not litter the log
  -- ==========================================================================
  DELETE FROM public.hipaa_audit_logs;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO public.clinician_guidance
    (clinician_user_id, patient_user_id, title, instruction)
  VALUES (_doc, _patient, 'Seeded by a migration', 'x');

  SELECT count(*) INTO _count FROM public.hipaa_audit_logs;
  PERFORM pg_temp.assert(_count = 0, 'a change with no signed-in actor writes no audit entry');

  RAISE NOTICE 'ALL AUDIT TRAIL TESTS PASSED';
END $$;

ROLLBACK;
