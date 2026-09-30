-- A conversation is part of the medical record, so both sides keep reading it
-- after the relationship ends. Neither side can write in it any more.
--
-- Before 20261010100000 a private clinician read their messages with a patient
-- for 90 days after the share ended and then lost them, and a hospital's staff
-- lost a patient's threads the moment the patient stopped sharing. By the
-- founder's decision, medical records are preserved: the private clinician keeps
-- read-only access to that thread permanently; at a hospital, the clinical staff
-- on the patient's care keep it, and the owners and admins do for governance;
-- the patient always keeps theirs. Leavers still lose the hospital's threads,
-- which were never theirs.
--
-- Also here: the patient's Messages screen is told whether the clinician of a
-- hospital thread is still there, so a thread whose clinician has gone can be
-- shown as the hospital's.

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

-- How many messages of the thread (patient, clinician) the caller reads.
CREATE OR REPLACE FUNCTION pg_temp.reads(_patient uuid, _clinician uuid) RETURNS integer
LANGUAGE sql AS $$
  SELECT pg_temp.n(format('SELECT 1 FROM public.messages WHERE patient_user_id = %L AND clinician_user_id = %L',
                          _patient, _clinician));
$$;

DO $$
DECLARE
  _pat      uuid := '9c000000-0000-4000-8000-000000000001';
  _dr_priv  uuid := '9c000000-0000-4000-8000-000000000011';  -- private share, ended long ago by the patient
  _dr_exp   uuid := '9c000000-0000-4000-8000-000000000012';  -- private share, expired long ago
  _stranger uuid := '9c000000-0000-4000-8000-000000000013';  -- a clinician the patient never shared with
  _owner    uuid := '9c000000-0000-4000-8000-000000000021';
  _admin    uuid := '9c000000-0000-4000-8000-000000000022';  -- admin, not on the patient's care
  _doc      uuid := '9c000000-0000-4000-8000-000000000023';  -- assigned to the patient
  _viewall  uuid := '9c000000-0000-4000-8000-000000000024';  -- sees every patient
  _other    uuid := '9c000000-0000-4000-8000-000000000025';  -- works there, not on the patient's care
  _desk     uuid := '9c000000-0000-4000-8000-000000000026';  -- front desk with the wide view
  _leaver   uuid := '9c000000-0000-4000-8000-000000000027';  -- assigned, then leaves
  _prac     uuid := '9d000000-0000-4000-8000-000000000001';
  _row      record;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_pat,      'kept-pat@test.local',      now()),
    (_dr_priv,  'kept-priv@test.local',     now()),
    (_dr_exp,   'kept-exp@test.local',      now()),
    (_stranger, 'kept-stranger@test.local', now()),
    (_owner,    'kept-owner@test.local',    now()),
    (_admin,    'kept-admin@test.local',    now()),
    (_doc,      'kept-doc@test.local',      now()),
    (_viewall,  'kept-viewall@test.local',  now()),
    (_other,    'kept-other@test.local',    now()),
    (_desk,     'kept-desk@test.local',     now()),
    (_leaver,   'kept-leaver@test.local',   now());
  INSERT INTO public.profiles (user_id, name) VALUES (_pat, 'Kit Kept')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;
  -- Provider shares are for clinicians (20261010050000).
  INSERT INTO public.clinician_profiles (user_id, title, first_name, last_name) VALUES
    (_dr_priv, 'Dr', 'Pia', 'Private'), (_dr_exp, 'Dr', 'Eli', 'Expired'), (_stranger, 'Dr', 'Sol', 'Stranger'),
    (_doc, 'Dr', 'Dee', 'Doc'), (_viewall, 'Dr', 'Vi', 'Viewall'), (_other, 'Dr', 'Otto', 'Other'),
    (_leaver, 'Dr', 'Lee', 'Leaver');

  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES
    (_pat, _dr_priv, 'Dr Private', 'kept-priv@test.local', 'KEPT0001', '{"vitals":true}', true),
    (_pat, _dr_exp,  'Dr Expired', 'kept-exp@test.local',  'KEPT0002', '{"vitals":true}', true);

  -- Each private conversation happens while the share is live.
  PERFORM pg_temp.as_user(_dr_priv);
  EXECUTE pg_temp.send(_pat, _dr_priv, _dr_priv, 'kept: your results are fine');
  PERFORM pg_temp.as_user(_pat);
  EXECUTE pg_temp.send(_pat, _dr_priv, _pat, 'kept: thank you');
  PERFORM pg_temp.as_user(_dr_exp);
  EXECUTE pg_temp.send(_pat, _dr_exp, _dr_exp, 'kept: see you in a year');

  -- Then, long ago in the record's terms, one share was ended by the patient
  -- and the other ran out: well past the 90 days the old rule allowed.
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.provider_shares
     SET created_at = now() - interval '400 days',
         is_active = false, revoked_at = now() - interval '200 days', revoked_by = _pat
   WHERE clinician_user_id = _dr_priv;
  UPDATE public.provider_shares
     SET created_at = now() - interval '400 days', expires_at = now() - interval '150 days'
   WHERE clinician_user_id = _dr_exp;
  UPDATE public.messages SET created_at = now() - interval '300 days'
   WHERE patient_user_id = _pat AND clinician_user_id IN (_dr_priv, _dr_exp);

  -- ==========================================================================
  -- 1. A private clinician keeps the thread, read-only, for good
  -- ==========================================================================
  PERFORM pg_temp.as_user(_dr_priv);
  PERFORM pg_temp.assert(pg_temp.reads(_pat, _dr_priv) = 2,
    'a clinician the patient stopped sharing with 200 days ago still reads both sides of their thread');
  PERFORM pg_temp.assert(NOT pg_temp.changed(pg_temp.send(_pat, _dr_priv, _dr_priv, 'kept: checking in')),
    'but cannot write in it');
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('UPDATE public.messages SET read_at = now() WHERE patient_user_id = %L AND clinician_user_id = %L',
                               _pat, _dr_priv)),
    'nor change anything in it');
  PERFORM pg_temp.as_user(_dr_exp);
  PERFORM pg_temp.assert(pg_temp.reads(_pat, _dr_exp) = 1,
    'a clinician whose share expired 150 days ago still reads their thread');
  PERFORM pg_temp.assert(NOT pg_temp.changed(pg_temp.send(_pat, _dr_exp, _dr_exp, 'kept: checking in')),
    'and cannot write in it either');
  PERFORM pg_temp.as_user(_stranger);
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.messages WHERE patient_user_id = %L', _pat)) = 0,
    'a clinician the patient never shared with reads nothing');
  PERFORM pg_temp.as_user(_pat);
  PERFORM pg_temp.assert(NOT pg_temp.changed(pg_temp.send(_pat, _dr_priv, _pat, 'kept: are you there?')),
    'the patient cannot write into the ended thread');
  PERFORM pg_temp.assert(pg_temp.reads(_pat, _dr_priv) = 2 AND pg_temp.reads(_pat, _dr_exp) = 1,
    'and still reads all of it');

  -- The clinician can find the conversation: who it was with, by name.
  PERFORM pg_temp.as_user(_dr_priv);
  SELECT * INTO _row FROM public.my_message_history_patients() WHERE patient_user_id = _pat;
  PERFORM pg_temp.assert(_row.patient_name = 'Kit Kept' AND _row.practice_id IS NULL,
    'the ended private thread is listed for the clinician, with the patient''s name');
  PERFORM pg_temp.as_user(_stranger);
  PERFORM pg_temp.assert(pg_temp.n('SELECT 1 FROM public.my_message_history_patients()') = 0,
    'and for nobody else');

  -- ==========================================================================
  -- 2. The hospital keeps its threads after the patient stops sharing
  -- ==========================================================================
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.practices (id, name, created_by) VALUES (_prac, 'Kept General', _owner);
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES (_prac, _owner, 'owner', 'active')
  ON CONFLICT (practice_id, user_id) DO UPDATE SET role = 'owner', status = 'active';
  INSERT INTO public.practice_members (practice_id, user_id, role, status, can_view_all_patients) VALUES
    (_prac, _admin,   'admin',      'active', false),
    (_prac, _doc,     'provider',   'active', false),
    (_prac, _viewall, 'provider',   'active', true),
    (_prac, _other,   'provider',   'active', false),
    (_prac, _desk,    'front_desk', 'active', true),
    (_prac, _leaver,  'provider',   'active', false);
  UPDATE public.practice_members SET can_view_all_patients = false WHERE practice_id = _prac AND user_id = _owner;
  INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions)
  VALUES (_prac, _pat, true, true, '{}');
  INSERT INTO public.practice_patient_assignments (practice_id, patient_user_id, clinician_user_id, assigned_by)
  VALUES (_prac, _pat, _doc, _owner), (_prac, _pat, _leaver, _owner);

  PERFORM pg_temp.as_user(_doc);
  EXECUTE pg_temp.send(_pat, _doc, _doc, 'kept: welcome to Kept General');
  PERFORM pg_temp.as_user(_leaver);
  INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body, attachment_path)
  VALUES (_pat, _leaver, _leaver, 'kept: I will see you on the ward', _pat || '/' || _leaver || '/ward-plan.pdf');
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('message-attachments', _pat || '/' || _leaver || '/ward-plan.pdf', _leaver);
  PERFORM pg_temp.as_user(_pat);
  EXECUTE pg_temp.send(_pat, _doc, _pat, 'kept: thanks, Dr Doc');

  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.messages WHERE patient_user_id = _pat AND practice_id = _prac) = 3,
    'the hospital conversations belong to the hospital');

  -- While the patient shares, governance is not a reason to read.
  PERFORM pg_temp.as_user(_admin);
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.messages WHERE patient_user_id = %L', _pat)) = 0,
    'while the patient shares, an admin not on their care reads none of their threads');

  -- One clinician leaves; their colleague on the patient's care now reads that thread.
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.practice_members SET status = 'revoked', ended_at = now(), end_reason = 'left'
   WHERE practice_id = _prac AND user_id = _leaver;

  -- Then the patient stops sharing with the hospital.
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.practice_shares SET is_active = false, revoked_at = now(), revoked_by = _pat
   WHERE practice_id = _prac AND user_id = _pat;

  PERFORM pg_temp.as_user(_doc);
  PERFORM pg_temp.assert(pg_temp.reads(_pat, _doc) = 2,
    'the clinician on the patient''s care still reads their thread after the patient stops sharing');
  PERFORM pg_temp.assert(pg_temp.reads(_pat, _leaver) = 1,
    'and the thread of the colleague who left, which the hospital keeps');
  PERFORM pg_temp.assert(NOT pg_temp.changed(pg_temp.send(_pat, _doc, _doc, 'kept: follow-up')),
    'but cannot write to the patient');
  PERFORM pg_temp.changed(format('SELECT public.mark_practice_thread_read(%L)', _pat));
  PERFORM pg_temp.changed(format('UPDATE public.messages SET read_at = now() WHERE patient_user_id = %L AND sender_user_id = %L', _pat, _pat));
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM public.messages WHERE patient_user_id = %L AND read_at IS NOT NULL AND sender_user_id = %L', _pat, _pat)) = 0,
    'nor mark the patient''s messages read');

  PERFORM pg_temp.as_user(_viewall);
  PERFORM pg_temp.assert(pg_temp.reads(_pat, _leaver) = 1,
    'a clinician with the wide view reads the departed colleague''s thread');
  PERFORM pg_temp.assert(pg_temp.reads(_pat, _doc) = 0,
    'but not a colleague''s thread while that colleague still works there');

  PERFORM pg_temp.as_user(_admin);
  PERFORM pg_temp.assert(pg_temp.reads(_pat, _doc) = 2 AND pg_temp.reads(_pat, _leaver) = 1,
    'after the patient stops sharing, an admin reads the hospital''s threads for governance');
  PERFORM pg_temp.assert(NOT pg_temp.changed(pg_temp.send(_pat, _admin, _admin, 'kept: from the admin')),
    'and cannot write to the patient');
  PERFORM pg_temp.as_user(_owner);
  PERFORM pg_temp.assert(pg_temp.reads(_pat, _doc) = 2,
    'so does the owner');

  PERFORM pg_temp.as_user(_other);
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.messages WHERE patient_user_id = %L', _pat)) = 0,
    'a clinician there who was never on the patient''s care reads nothing');
  PERFORM pg_temp.as_user(_desk);
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.messages WHERE patient_user_id = %L', _pat)) = 0,
    'nor does the front desk, wide view or not');
  PERFORM pg_temp.as_user(_leaver);
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.messages WHERE patient_user_id = %L', _pat)) = 0,
    'and the leaver keeps none of the hospital''s threads, their own included');
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM public.my_message_history_patients() WHERE patient_user_id = %L', _pat)) = 0,
    'nor finds the patient in their history');
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM storage.objects WHERE bucket_id = %L AND name = %L',
                     'message-attachments', _pat || '/' || _leaver || '/ward-plan.pdf')) = 0,
    'nor opens the file they sent in it, although their id is in its path');

  -- The file goes with the message.
  PERFORM pg_temp.as_user(_admin);
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM storage.objects WHERE bucket_id = %L AND name = %L',
                     'message-attachments', _pat || '/' || _leaver || '/ward-plan.pdf')) = 1,
    'whoever keeps the thread opens its attachment');
  PERFORM pg_temp.as_user(_other);
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM storage.objects WHERE bucket_id = %L AND name = %L',
                     'message-attachments', _pat || '/' || _leaver || '/ward-plan.pdf')) = 0,
    'and nobody else does');
  PERFORM pg_temp.as_user(_pat);
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM storage.objects WHERE bucket_id = %L AND name = %L',
                     'message-attachments', _pat || '/' || _leaver || '/ward-plan.pdf')) = 1,
    'the patient always does');

  PERFORM pg_temp.as_user(_doc);
  SELECT * INTO _row FROM public.my_message_history_patients() WHERE patient_user_id = _pat;
  PERFORM pg_temp.assert(_row.patient_name = 'Kit Kept' AND _row.practice_name = 'Kept General',
    'the clinician on the care finds the patient''s thread in their history, under the hospital');

  PERFORM pg_temp.as_user(_pat);
  PERFORM pg_temp.assert(pg_temp.reads(_pat, _doc) = 2 AND pg_temp.reads(_pat, _leaver) = 1,
    'the patient still reads every hospital conversation');
  PERFORM pg_temp.assert(NOT pg_temp.changed(pg_temp.send(_pat, _doc, _pat, 'kept: hello again')),
    'and cannot write into them while not sharing');

  -- The hospital's own switch for this patient stops its clinical staff, not its governance.
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.practice_shares SET practice_suspended_at = now() WHERE practice_id = _prac AND user_id = _pat;
  PERFORM pg_temp.as_user(_doc);
  PERFORM pg_temp.assert(pg_temp.reads(_pat, _doc) = 0,
    'once the hospital suspends its staff''s access to the patient, the clinician reads nothing');
  PERFORM pg_temp.as_user(_admin);
  PERFORM pg_temp.assert(pg_temp.reads(_pat, _doc) = 2,
    'while the admin still can');

  -- ==========================================================================
  -- 3. The patient's list says whose a hospital thread now is
  -- ==========================================================================
  PERFORM pg_temp.as_user(_pat);
  SELECT * INTO _row FROM public.my_message_counterparties() WHERE clinician_user_id = _leaver;
  PERFORM pg_temp.assert(_row.practice_name = 'Kept General' AND _row.clinician_status = 'left',
    'a departed clinician''s hospital thread says the clinician has left, and names the hospital');
  SELECT * INTO _row FROM public.my_message_counterparties() WHERE clinician_user_id = _doc;
  PERFORM pg_temp.assert(_row.clinician_status = 'active' AND _row.reason = 'sharing_stopped' AND _row.ended_by_patient,
    'a thread with a clinician still there says so');
  SELECT * INTO _row FROM public.my_message_counterparties() WHERE clinician_user_id = _dr_priv;
  PERFORM pg_temp.assert(_row.practice_id IS NULL AND _row.clinician_status IS NULL,
    'a private thread has no hospital standing');

  PERFORM pg_temp.as_user(NULL);
  UPDATE public.practice_members SET role = 'front_desk' WHERE practice_id = _prac AND user_id = _doc;
  PERFORM pg_temp.as_user(_pat);
  SELECT * INTO _row FROM public.my_message_counterparties() WHERE clinician_user_id = _doc;
  PERFORM pg_temp.assert(_row.clinician_status = 'non_clinical',
    'a clinician moved to a non-clinical role reads as no longer seeing patients, not as having left');

  RAISE NOTICE 'message_history_is_kept: all assertions passed';
END $$;

ROLLBACK;
