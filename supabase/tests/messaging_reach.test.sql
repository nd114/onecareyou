-- A hospital clinician can message the patient they are treating, and the
-- inbox counts the whole conversation.
--
-- Both message policies resolved the relationship through provider_shares
-- alone, so a clinician assigned through a hospital — who has no such row by
-- design — could neither send nor read. The patient still appeared in their
-- sidebar, because that list comes from the merged panel.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/messaging_reach.test.sql

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
  _patient  uuid := 'e9000000-0000-0000-0000-000000000001';
  _hospdoc  uuid := 'e9000000-0000-0000-0000-000000000002';
  _privdoc  uuid := 'e9000000-0000-0000-0000-000000000003';
  _stranger uuid := 'e9000000-0000-0000-0000-000000000004';
  _other    uuid := 'e9000000-0000-0000-0000-000000000005';
  _hosp     uuid := 'e9111111-0000-0000-0000-000000000001';
  _txt text; _count integer; _who uuid;
  _t0 timestamptz := now() - interval '1 hour';
BEGIN
  INSERT INTO auth.users (id,email) VALUES
    (_patient,'mr-pat@test.local'), (_hospdoc,'mr-hosp@test.local'),
    (_privdoc,'mr-priv@test.local'), (_stranger,'mr-str@test.local'),
    (_other,'mr-other@test.local');

  INSERT INTO public.practices (id,name,tenant_type,slug,created_by)
  VALUES (_hosp,'Messaging Test Hospital','hospital','mrhosp',_hospdoc);
  INSERT INTO public.practice_members (practice_id,user_id,role,status,can_view_all_patients)
  VALUES (_hosp,_hospdoc,'clinician','active',true)
  ON CONFLICT (practice_id,user_id) DO UPDATE SET status='active', can_view_all_patients=true;
  INSERT INTO public.practice_shares (practice_id,user_id,share_all,permissions)
  VALUES (_hosp,_patient,true,'{}'::jsonb);
  INSERT INTO public.practice_patient_assignments (practice_id,patient_user_id,clinician_user_id,assigned_by)
  VALUES (_hosp,_patient,_hospdoc,_hospdoc);

  -- A private share too, so both pathways are exercised side by side. Dated
  -- before the messages below: clinician_had_patient_access_at() is
  -- point-in-time, so a share created after a message does not unlock it.
  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active, created_at)
  VALUES (_patient,_privdoc,'Dr Private','mr-priv@test.local','mrpriv',
          '{"vitals":true,"meds":true,"adherence":true,"profile":true}'::jsonb,true,
          _t0 - interval '1 day');

  -- ==========================================================================
  -- 1. The hospital clinician can send — this was refused outright
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _hospdoc::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body, created_at)
    VALUES (_patient,_hospdoc,_hospdoc,'Your results are back — please book a follow-up.', _t0);
    _txt := 'sent';
  EXCEPTION WHEN insufficient_privilege THEN _txt := 'refused';
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_txt = 'sent',
    'a hospital clinician can message the patient they are assigned to');

  -- ==========================================================================
  -- 2. And can read what the patient sends back
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body, created_at)
  VALUES (_patient,_hospdoc,_patient,'Is the swelling normal?', _t0 + interval '10 min');
  INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body, created_at)
  VALUES (_patient,_hospdoc,_patient,'It has not gone down since Tuesday.', _t0 + interval '20 min');
  INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body, created_at)
  VALUES (_patient,_privdoc,_patient,'Separate question for you.', _t0 + interval '30 min');
  EXECUTE 'SET LOCAL ROLE postgres';

  PERFORM set_config('request.jwt.claim.sub', _hospdoc::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.messages WHERE patient_user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 3,
    'the hospital clinician reads their own thread, and only their own');

  -- ==========================================================================
  -- 3. The private-share clinician is unaffected
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _privdoc::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.messages WHERE patient_user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1,
    'a private-share clinician still sees their thread and not the hospital one');

  -- ==========================================================================
  -- 4. Widening the pathway did not widen who counts as a clinician
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _stranger::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body)
    VALUES (_patient,_stranger,_stranger,'Hello, I am nobody.');
    _txt := 'sent';
  EXCEPTION WHEN insufficient_privilege THEN _txt := 'refused';
  END;
  SELECT count(*) INTO _count FROM public.messages WHERE patient_user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_txt = 'refused',
    'a clinician with no relationship still cannot message the patient');
  PERFORM pg_temp.assert(_count = 0,
    'and reads none of the patient''s messages');

  -- A hospital colleague cannot post as the assigned clinician either.
  PERFORM set_config('request.jwt.claim.sub', _hospdoc::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body)
    VALUES (_patient,_privdoc,_hospdoc,'Impersonating a colleague.');
    _txt := 'sent';
  EXCEPTION WHEN insufficient_privilege THEN _txt := 'refused';
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_txt = 'refused',
    'nobody can post into a thread belonging to another clinician');

  -- ==========================================================================
  -- 5. The inbox counts the whole thread
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _hospdoc::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT last_body INTO _txt
    FROM public.my_message_threads('clinician') WHERE counterparty_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_txt = 'It has not gone down since Tuesday.',
    'the thread list carries the most recent message, not the oldest');

  PERFORM set_config('request.jwt.claim.sub', _hospdoc::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT unread INTO _count FROM public.my_message_threads('clinician')
   WHERE counterparty_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 2,
    'unread counts the patient''s two messages and not the clinician''s own');

  -- ==========================================================================
  -- 6. The patient's own inbox, from the other side
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.my_message_threads('patient');
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 2,
    'the patient sees one thread per clinician, both pathways together');

  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT unread INTO _count FROM public.my_message_threads('patient')
   WHERE counterparty_id = _hospdoc;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1,
    'the patient''s unread count is the clinician''s message to them');

  -- ==========================================================================
  -- 7. Newest conversation first
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT counterparty_id INTO _who FROM public.my_message_threads('patient') LIMIT 1;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_who = _privdoc,
    'the thread that moved most recently is listed first');

  -- ==========================================================================
  -- 8. Nobody reads a conversation they are not in
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _other::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.my_message_threads('patient');
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0,
    'an unrelated signed-in user gets an empty inbox, not someone else''s');

  RAISE NOTICE 'ALL MESSAGING REACH TESTS PASSED';
END $$;

ROLLBACK;
