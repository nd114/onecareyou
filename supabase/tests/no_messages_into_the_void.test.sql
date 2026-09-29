-- No message is sent into a thread nobody can read.
--
-- Before 20261010090000 the patient's INSERT policy on messages asked only
-- that the sender was the patient. A private clinician reads only messages
-- written while their share was live, and a hospital thread is read only by
-- clinicians on the patient's care there, so after a patient stopped sharing,
-- a share expired, or a hospital clinician was taken off the patient's care,
-- the composer stayed open and what the patient wrote was read by nobody.
--
-- A hospital thread outlives its clinician: once they leave, the patient's
-- messages in it are read by the staff now on the patient's care there
-- (20261010070000). That must keep working, and must stop when there is
-- nobody on the patient's care to read it.
--
-- my_message_counterparties() tells the patient which conversations are open
-- and, for the closed ones, why. It is computed by the same helper the policy
-- uses, so the screen and the rule cannot disagree.

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

-- True when the statement wrote a row; a refusal (raised or silent) is false.
CREATE OR REPLACE FUNCTION pg_temp.changed(_sql text) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE _n integer;
BEGIN
  EXECUTE _sql;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n > 0;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.n(_sql text) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE _n integer;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || _sql || ') q' INTO _n;
  RETURN _n;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.send(_patient uuid, _clinician uuid, _sender uuid, _body text)
RETURNS text LANGUAGE sql AS $$
  SELECT format(
    'INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body) VALUES (%L, %L, %L, %L)',
    _patient, _clinician, _sender, _body);
$$;

DO $$
DECLARE
  _pat      uuid := '9a000000-0000-4000-8000-000000000001';
  _dr_live  uuid := '9a000000-0000-4000-8000-000000000011';  -- private share, live
  _dr_rev   uuid := '9a000000-0000-4000-8000-000000000012';  -- private share, the patient stopped sharing
  _dr_exp   uuid := '9a000000-0000-4000-8000-000000000013';  -- private share, expired
  _carer    uuid := '9a000000-0000-4000-8000-000000000014';  -- claimed a provider share, not a clinician
  _stranger uuid := '9a000000-0000-4000-8000-000000000015';  -- no relationship at all
  _owner    uuid := '9a000000-0000-4000-8000-000000000021';
  _leaver   uuid := '9a000000-0000-4000-8000-000000000022';  -- hospital clinician who leaves
  _cover    uuid := '9a000000-0000-4000-8000-000000000023';  -- hospital clinician with the wide view
  _benched  uuid := '9a000000-0000-4000-8000-000000000024';  -- still at the hospital, off the patient's care
  _newdoc   uuid := '9a000000-0000-4000-8000-000000000025';  -- assigned after the leaver goes
  _prac     uuid := '9b000000-0000-4000-8000-000000000001';
  _row      record;
  _n        integer;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_pat,      'void-pat@test.local',      now()),
    (_dr_live,  'void-live@test.local',     now()),
    (_dr_rev,   'void-rev@test.local',      now()),
    (_dr_exp,   'void-exp@test.local',      now()),
    (_carer,    'void-carer@test.local',    now()),
    (_stranger, 'void-stranger@test.local', now()),
    (_owner,    'void-owner@test.local',    now()),
    (_leaver,   'void-leaver@test.local',   now()),
    (_cover,    'void-cover@test.local',    now()),
    (_benched,  'void-benched@test.local',  now()),
    (_newdoc,   'void-newdoc@test.local',   now());
  INSERT INTO public.profiles (user_id, name) VALUES (_pat, 'Vera Void'), (_carer, 'Carol Carer')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;
  INSERT INTO public.clinician_profiles (user_id, title, first_name, last_name) VALUES
    (_dr_live, 'Dr', 'Liv', 'Live'), (_dr_rev, 'Dr', 'Rhys', 'Revoked'), (_dr_exp, 'Dr', 'Ezra', 'Expired'),
    (_stranger, 'Dr', 'Sam', 'Stranger'),
    (_leaver, 'Dr', 'Lena', 'Leaver'), (_cover, 'Dr', 'Cora', 'Cover'),
    (_benched, 'Dr', 'Ben', 'Benched'), (_newdoc, 'Dr', 'Nadia', 'Newdoc');

  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active, expires_at, revoked_at, revoked_by)
  VALUES
    (_pat, _dr_live, 'Dr Live',  'void-live@test.local',  'VOID0001', '{"vitals":true}', true,  NULL, NULL, NULL),
    (_pat, _dr_rev,  'Dr Rev',   'void-rev@test.local',   'VOID0002', '{"vitals":true}', true,  NULL, NULL, NULL),
    (_pat, _dr_exp,  'Dr Exp',   'void-exp@test.local',   'VOID0003', '{"vitals":true}', true,  now() + interval '1 day', NULL, NULL),
    -- A share a caregiver claimed before 20261010050000 closed the claim.
    (_pat, _carer,   'Carol',    'void-carer@test.local', 'VOID0004', '{"vitals":true}', true,  NULL, NULL, NULL);

  -- Each private clinician wrote while the share was live.
  PERFORM pg_temp.as_user(_dr_rev);
  EXECUTE pg_temp.send(_pat, _dr_rev, _dr_rev, 'void: how are the readings?');
  PERFORM pg_temp.as_user(_dr_exp);
  EXECUTE pg_temp.send(_pat, _dr_exp, _dr_exp, 'void: see you soon');

  -- The patient stops sharing with one; the other's share runs out.
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.provider_shares SET is_active = false, revoked_at = now() - interval '2 days', revoked_by = _pat
   WHERE clinician_user_id = _dr_rev;
  UPDATE public.provider_shares SET expires_at = now() - interval '1 hour' WHERE clinician_user_id = _dr_exp;

  -- The hospital. Nobody has the wide view unless a test gives it to them.
  INSERT INTO public.practices (id, name, created_by) VALUES (_prac, 'Void General', _owner);
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES (_prac, _owner, 'owner', 'active')
  ON CONFLICT (practice_id, user_id) DO UPDATE SET role = 'owner', status = 'active';
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (_prac, _leaver,  'provider', 'active'),
    (_prac, _cover,   'provider', 'active'),
    (_prac, _benched, 'provider', 'active'),
    (_prac, _newdoc,  'provider', 'active');
  UPDATE public.practice_members SET can_view_all_patients = false WHERE practice_id = _prac;
  INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions)
  VALUES (_prac, _pat, true, true, '{}');
  INSERT INTO public.practice_patient_assignments (practice_id, patient_user_id, clinician_user_id, assigned_by)
  VALUES (_prac, _pat, _leaver, _owner), (_prac, _pat, _benched, _owner);

  PERFORM pg_temp.as_user(_leaver);
  EXECUTE pg_temp.send(_pat, _leaver, _leaver, 'void: welcome to the ward');
  PERFORM pg_temp.as_user(_benched);
  EXECUTE pg_temp.send(_pat, _benched, _benched, 'void: I will look after your bloods');

  -- Then the hospital takes Dr Benched off the patient's care; they still work there.
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.practice_patient_assignments SET effective_to = now() - interval '1 minute'
   WHERE practice_id = _prac AND patient_user_id = _pat AND clinician_user_id = _benched;

  -- ==========================================================================
  -- 1. Private shares: open while live, closed once it ends
  -- ==========================================================================
  PERFORM pg_temp.as_user(_pat);
  PERFORM pg_temp.assert(pg_temp.changed(pg_temp.send(_pat, _dr_live, _pat, 'void: hello')),
    'a patient messages a clinician whose share is live');
  PERFORM pg_temp.assert(NOT pg_temp.changed(pg_temp.send(_pat, _dr_rev, _pat, 'void: are you there?')),
    'but not one they stopped sharing with, who could never read it');
  PERFORM pg_temp.assert(NOT pg_temp.changed(pg_temp.send(_pat, _dr_exp, _pat, 'void: are you there?')),
    'nor one whose share has expired');
  PERFORM pg_temp.assert(NOT pg_temp.changed(pg_temp.send(_pat, _carer, _pat, 'void: hi Carol')),
    'nor a caregiver holding a provider share, who reads no clinical thread');
  PERFORM pg_temp.assert(NOT pg_temp.changed(pg_temp.send(_pat, _stranger, _pat, 'void: hi')),
    'nor a clinician they never shared with');
  PERFORM pg_temp.assert(NOT pg_temp.changed(pg_temp.send(_pat, _dr_live, _dr_live, 'void: forged')),
    'and a patient still cannot write as the clinician');

  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM public.messages WHERE patient_user_id = %L AND body = %L', _pat, 'void: are you there?')) = 0,
    'nothing was written into the closed threads');

  -- What the patient had before stays theirs to read.
  PERFORM pg_temp.as_user(_pat);
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM public.messages WHERE clinician_user_id = %L', _dr_rev)) = 1,
    'the patient still reads the history of a closed thread');

  -- The clinician side: no relationship, no message.
  PERFORM pg_temp.as_user(_dr_live);
  PERFORM pg_temp.assert(pg_temp.changed(pg_temp.send(_pat, _dr_live, _dr_live, 'void: hello back')),
    'a clinician with a live share replies');
  PERFORM pg_temp.as_user(_dr_rev);
  PERFORM pg_temp.assert(NOT pg_temp.changed(pg_temp.send(_pat, _dr_rev, _dr_rev, 'void: still there?')),
    'a clinician the patient stopped sharing with cannot write');
  PERFORM pg_temp.as_user(_dr_exp);
  PERFORM pg_temp.assert(NOT pg_temp.changed(pg_temp.send(_pat, _dr_exp, _dr_exp, 'void: still there?')),
    'nor one whose share expired');
  PERFORM pg_temp.as_user(_carer);
  PERFORM pg_temp.assert(NOT pg_temp.changed(pg_temp.send(_pat, _carer, _carer, 'void: from your carer')),
    'nor a caregiver on a provider share');

  -- ==========================================================================
  -- 2. Hospital threads
  -- ==========================================================================
  PERFORM pg_temp.as_user(_pat);
  PERFORM pg_temp.assert(pg_temp.changed(pg_temp.send(_pat, _leaver, _pat, 'void: thank you')),
    'a patient replies to the hospital clinician on their care');
  PERFORM pg_temp.assert(NOT pg_temp.changed(pg_temp.send(_pat, _benched, _pat, 'void: about my bloods')),
    'but not to one the hospital has taken off their care, who can no longer read the thread');

  -- The clinician leaves. Nobody else is on the patient's care yet.
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.practice_members SET status = 'revoked', ended_at = now(), end_reason = 'left'
   WHERE practice_id = _prac AND user_id = _leaver;

  PERFORM pg_temp.as_user(_pat);
  PERFORM pg_temp.assert(NOT pg_temp.changed(pg_temp.send(_pat, _leaver, _pat, 'void: hello?')),
    'with the clinician gone and nobody on the patient''s care, the hospital thread is closed');

  PERFORM pg_temp.as_user(_leaver);
  PERFORM pg_temp.assert(NOT pg_temp.changed(pg_temp.send(_pat, _leaver, _leaver, 'void: from my new job')),
    'and the leaver cannot write to the hospital''s patient');

  -- A colleague with the wide view covers.
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.practice_members SET can_view_all_patients = true WHERE practice_id = _prac AND user_id = _cover;
  PERFORM pg_temp.as_user(_pat);
  PERFORM pg_temp.assert(pg_temp.changed(pg_temp.send(_pat, _leaver, _pat, 'void: is anyone covering?')),
    'once someone covers, the patient writes in the departed clinician''s thread again');
  PERFORM pg_temp.as_user(_cover);
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM public.messages WHERE patient_user_id = %L AND body = %L', _pat, 'void: is anyone covering?')) = 1,
    'and the covering clinician reads it');

  -- The wide view goes; a named clinician is assigned instead.
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.practice_members SET can_view_all_patients = false WHERE practice_id = _prac AND user_id = _cover;
  INSERT INTO public.practice_patient_assignments (practice_id, patient_user_id, clinician_user_id, assigned_by)
  VALUES (_prac, _pat, _newdoc, _owner);
  PERFORM pg_temp.as_user(_pat);
  PERFORM pg_temp.assert(pg_temp.changed(pg_temp.send(_pat, _leaver, _pat, 'void: hello Dr Newdoc')),
    'an assigned clinician covers the departed clinician''s thread');
  PERFORM pg_temp.assert(pg_temp.changed(pg_temp.send(_pat, _newdoc, _pat, 'void: nice to meet you')),
    'and the patient can start a thread with them directly');
  PERFORM pg_temp.as_user(_newdoc);
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM public.messages WHERE patient_user_id = %L AND body = %L', _pat, 'void: hello Dr Newdoc')) = 1,
    'who reads what was written in the departed clinician''s thread');

  -- ==========================================================================
  -- 3. What the patient is told
  -- ==========================================================================
  PERFORM pg_temp.as_user(_pat);
  SELECT * INTO _row FROM public.my_message_counterparties() WHERE clinician_user_id = _dr_live;
  PERFORM pg_temp.assert(_row.can_send AND _row.reason = 'open' AND _row.clinician_name = 'Dr Liv Live',
    'a live private share reads as open, with the clinician''s name');
  SELECT * INTO _row FROM public.my_message_counterparties() WHERE clinician_user_id = _dr_rev;
  PERFORM pg_temp.assert(NOT _row.can_send AND _row.reason = 'sharing_stopped' AND _row.ended_by_patient
                         AND _row.ended_at::date = (now() - interval '2 days')::date,
    'a share the patient ended reads as sharing_stopped, by them, on the day they did it');
  SELECT * INTO _row FROM public.my_message_counterparties() WHERE clinician_user_id = _dr_exp;
  PERFORM pg_temp.assert(NOT _row.can_send AND _row.reason = 'share_expired' AND _row.ended_at IS NOT NULL,
    'an expired share reads as share_expired, with the date');
  SELECT * INTO _row FROM public.my_message_counterparties() WHERE clinician_user_id = _carer;
  PERFORM pg_temp.assert(NOT _row.can_send AND _row.reason = 'not_a_clinician',
    'a caregiver on a provider share reads as not_a_clinician');
  SELECT * INTO _row FROM public.my_message_counterparties() WHERE clinician_user_id = _leaver;
  PERFORM pg_temp.assert(_row.can_send AND _row.reason = 'covered' AND _row.practice_name = 'Void General',
    'a departed clinician''s hospital thread reads as covered by the hospital');
  PERFORM pg_temp.assert(_row.continues_with @> jsonb_build_array(jsonb_build_object('user_id', _newdoc, 'name', 'Dr Nadia Newdoc')),
    'naming who the patient''s care continues with');
  SELECT * INTO _row FROM public.my_message_counterparties() WHERE clinician_user_id = _benched;
  PERFORM pg_temp.assert(NOT _row.can_send AND _row.reason = 'not_on_care_team',
    'a clinician taken off the patient''s care reads as not_on_care_team');
  SELECT * INTO _row FROM public.my_message_counterparties() WHERE clinician_user_id = _newdoc;
  PERFORM pg_temp.assert(_row.can_send AND _row.reason = 'open',
    'the newly assigned clinician is listed, open');
  PERFORM pg_temp.assert(
    pg_temp.n('SELECT 1 FROM public.my_message_counterparties() WHERE clinician_user_id = ''' || _stranger || '''') = 0,
    'a clinician the patient never had is not listed');

  -- Asked about somebody else's thread, the helper says nothing.
  PERFORM pg_temp.as_user(_stranger);
  PERFORM pg_temp.assert(NOT public.message_thread_readers_exist(_pat, _dr_live, NULL),
    'a third party learns nothing from message_thread_readers_exist');
  PERFORM pg_temp.assert(pg_temp.n('SELECT 1 FROM public.my_message_counterparties()') = 0,
    'and a clinician has no patient-side counterparties');

  -- Every answer in the list is the rule the policy applies.
  PERFORM pg_temp.as_user(_pat);
  FOR _row IN SELECT * FROM public.my_message_counterparties() LOOP
    PERFORM pg_temp.as_user(_pat);
    IF pg_temp.changed(pg_temp.send(_pat, _row.clinician_user_id, _pat, 'void: agreement check')) IS DISTINCT FROM _row.can_send THEN
      RAISE EXCEPTION 'FAILED: counterparty % (%) says can_send=% but the policy disagrees',
        _row.clinician_user_id, _row.reason, _row.can_send;
    END IF;
  END LOOP;
  PERFORM pg_temp.assert(true, 'the list and the policy agree for every counterparty');

  -- ==========================================================================
  -- 4. The patient stops sharing with the hospital
  -- ==========================================================================
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.practice_shares SET is_active = false, revoked_at = now(), revoked_by = _pat
   WHERE practice_id = _prac AND user_id = _pat;
  PERFORM pg_temp.as_user(_pat);
  PERFORM pg_temp.assert(NOT pg_temp.changed(pg_temp.send(_pat, _newdoc, _pat, 'void: after I stopped')),
    'after the patient stops sharing with the hospital, they cannot write to its clinicians');
  PERFORM pg_temp.assert(NOT pg_temp.changed(pg_temp.send(_pat, _leaver, _pat, 'void: after I stopped')),
    'nor into the departed clinician''s thread');
  SELECT * INTO _row FROM public.my_message_counterparties() WHERE clinician_user_id = _newdoc;
  PERFORM pg_temp.assert(NOT _row.can_send AND _row.reason = 'sharing_stopped' AND _row.ended_by_patient,
    'and is told they stopped sharing with the hospital');
  PERFORM pg_temp.as_user(_newdoc);
  PERFORM pg_temp.assert(NOT pg_temp.changed(pg_temp.send(_pat, _newdoc, _newdoc, 'void: follow-up')),
    'and the hospital''s clinician cannot write to them either');

  RAISE NOTICE 'no_messages_into_the_void: all assertions passed';
END $$;

ROLLBACK;
