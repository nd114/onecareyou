-- Three small holes found in the follow-up audit of 9 October 2026.
--
--   1. Patient document search listed titles of other people's documents that
--      the caller could read through some other policy (a provider share
--      addressed to their confirmed email). It now finds the caller's own.
--   2. A clinician could re-point an alert rule at a patient who never shared
--      with them. Whose rule and about whom are now fixed once written, and a
--      live rule needs a live share, as creating one does.
--   3. A solo clinician could file a patient record into any practice through
--      the solo INSERT policy. Practice records go through the practice policy.

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
  _pat      uuid := 'a1000000-0000-4000-8000-0000000000f1';
  _other    uuid := 'a2000000-0000-4000-8000-0000000000f2';
  _dr       uuid := 'a3000000-0000-4000-8000-0000000000f3';
  _stranger uuid := 'a4000000-0000-4000-8000-0000000000f4';
  _owner    uuid := 'a5000000-0000-4000-8000-0000000000f5';
  _hosp     uuid := 'a6000000-0000-4000-8000-0000000000f6';
  _own_doc  uuid := 'a7000000-0000-4000-8000-0000000000f7';
  _their_doc uuid := 'a8000000-0000-4000-8000-0000000000f8';
  _pshare   uuid := 'a9000000-0000-4000-8000-0000000000f9';
  _drshare  uuid := 'aa000000-0000-4000-8000-0000000000fa';
  _rule     uuid;
  _n        integer;
  _num      numeric;
  _raised   boolean;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_pat,      'afu-pat@test.local',      now()),
    (_other,    'afu-other@test.local',    now()),
    (_dr,       'afu-dr@test.local',       now()),
    (_stranger, 'afu-stranger@test.local', now()),
    (_owner,    'afu-owner@test.local',    now());

  -- ==========================================================================
  -- 1. Patient document search finds the caller's own documents
  -- ==========================================================================
  INSERT INTO public.health_documents (id, user_id, uploaded_by_user_id, file_path, file_name, title, category)
  VALUES
    (_own_doc,   _pat,   _pat,   'afu/own.pdf',   'own.pdf',   'Blood panel March',  'lab_result'),
    (_their_doc, _other, _other, 'afu/their.pdf', 'their.pdf', 'Blood panel Other',  'lab_result');

  -- _other shares a document with whoever holds _pat's address. _pat can read
  -- it through the document share policy; it is still not _pat's document.
  INSERT INTO public.provider_shares
    (id, user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES (_pshare, _other, NULL, 'Someone', 'afu-pat@test.local', 'afu-doc-share', '{"documents":true}'::jsonb, true);
  INSERT INTO public.document_shares (document_id, user_id, provider_share_id, is_active)
  VALUES (_their_doc, _other, _pshare, true);

  PERFORM pg_temp.as_user(_pat);
  SELECT count(*) INTO _n FROM public.health_documents WHERE id = _their_doc;
  PERFORM pg_temp.assert(_n = 1, 'setup: the patient can read the other person''s shared document');

  SELECT count(*) INTO _n FROM public.search_documents('blood panel', 25) WHERE id = _own_doc;
  PERFORM pg_temp.assert(_n = 1, 'the patient finds their own document');
  SELECT count(*) INTO _n FROM public.search_documents('blood panel', 25) WHERE id = _their_doc;
  PERFORM pg_temp.assert(_n = 0, 'patient search does not list somebody else''s document');
  PERFORM pg_temp.as_user(NULL);

  -- ==========================================================================
  -- 2. An alert rule stays about the patient it was written for
  -- ==========================================================================
  INSERT INTO public.provider_shares
    (id, user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES (_drshare, _pat, _dr, 'Dr AFU', 'afu-dr@test.local', 'afu-dr-share', '{"vitals":true}'::jsonb, true);

  PERFORM pg_temp.as_user(_dr);
  INSERT INTO public.clinician_alert_rules
    (clinician_user_id, patient_user_id, share_id, vital_type, condition, threshold_value)
  VALUES (_dr, _pat, _drshare, 'blood_pressure', 'above', 140)
  RETURNING id INTO _rule;

  UPDATE public.clinician_alert_rules SET threshold_value = 150 WHERE id = _rule;
  PERFORM pg_temp.as_user(NULL);
  SELECT threshold_value INTO _num FROM public.clinician_alert_rules WHERE id = _rule;
  PERFORM pg_temp.assert(_num = 150, 'a clinician updates their own rule''s threshold');

  -- The bulk "replace" path writes the same patient and clinician back; that
  -- is not a change.
  PERFORM pg_temp.as_user(_dr);
  UPDATE public.clinician_alert_rules
     SET clinician_user_id = _dr, patient_user_id = _pat, threshold_value = 145
   WHERE id = _rule;
  PERFORM pg_temp.as_user(NULL);
  SELECT threshold_value INTO _num FROM public.clinician_alert_rules WHERE id = _rule;
  PERFORM pg_temp.assert(_num = 145, 'rewriting the same patient and clinician is allowed');

  PERFORM pg_temp.as_user(_dr);
  _raised := false;
  BEGIN
    UPDATE public.clinician_alert_rules SET patient_user_id = _stranger WHERE id = _rule;
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.clinician_alert_rules WHERE patient_user_id = _stranger;
  PERFORM pg_temp.assert(_raised AND _n = 0, 'a rule cannot be re-pointed at another patient');

  PERFORM pg_temp.as_user(_dr);
  _raised := false;
  BEGIN
    UPDATE public.clinician_alert_rules SET clinician_user_id = _stranger WHERE id = _rule;
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.clinician_alert_rules WHERE id = _rule AND clinician_user_id = _dr;
  PERFORM pg_temp.assert(_raised AND _n = 1, 'a rule cannot be handed to another clinician');

  -- Once the share has ended, the rule can be switched off but not kept live.
  UPDATE public.provider_shares SET is_active = false WHERE id = _drshare;
  PERFORM pg_temp.as_user(_dr);
  _raised := false;
  BEGIN
    UPDATE public.clinician_alert_rules SET threshold_value = 120, is_active = true WHERE id = _rule;
    GET DIAGNOSTICS _n = ROW_COUNT;
    _raised := _n = 0;
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'without a live share a rule cannot be kept firing');

  UPDATE public.clinician_alert_rules SET is_active = false, archived_at = now() WHERE id = _rule;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.clinician_alert_rules
   WHERE id = _rule AND NOT is_active AND archived_at IS NOT NULL AND threshold_value = 145;
  PERFORM pg_temp.assert(_n = 1, 'without a live share the clinician can still switch the rule off');

  -- ==========================================================================
  -- 3. The solo record policy files no record into a practice
  -- ==========================================================================
  INSERT INTO public.practices (id, name, created_by) VALUES (_hosp, 'AFU Hospital', _owner);

  PERFORM pg_temp.as_user(_dr);
  _raised := false;
  BEGIN
    INSERT INTO public.clinician_patient_records (clinician_user_id, patient_name, practice_id)
    VALUES (_dr, 'Planted Patient', _hosp);
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'a clinician cannot file a record into a practice they do not manage');

  INSERT INTO public.clinician_patient_records (clinician_user_id, patient_name, practice_id)
  VALUES (_dr, 'Solo Patient', NULL);
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.clinician_patient_records
   WHERE clinician_user_id = _dr AND patient_name = 'Solo Patient' AND practice_id IS NULL;
  PERFORM pg_temp.assert(_n = 1, 'a solo clinician creates a record of their own');
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE practice_id = _hosp;
  PERFORM pg_temp.assert(_n = 0, 'nothing was filed into the practice');

  RAISE NOTICE 'audit_follow_ups: all assertions passed';
END $$;

ROLLBACK;
