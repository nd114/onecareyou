-- Voice memos are the clinician's own working material.
--
-- Owner only (another clinician, the patient and anon see nothing); a patient
-- can be attached only while the clinician has CURRENT clinical access, by the
-- RPC and by a direct update alike; an empty transcript cannot read
-- "transcribed"; filing needs access too; retention is due 24 h after
-- confirmation, 30 days at most, and a clinician who keeps audio is skipped.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/voice_memos.test.sql

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(_condition boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _condition IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', _label; END IF;
  RAISE NOTICE '  ok - %', _label;
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
  _doc      uuid := 'e3000000-0000-4000-8000-0000000000a1';
  _other    uuid := 'e3000000-0000-4000-8000-0000000000a2';
  _patient  uuid := 'e3000000-0000-4000-8000-0000000000a3';
  _stranger uuid := 'e3000000-0000-4000-8000-0000000000a4';
  _memo  uuid := 'e4000000-0000-4000-8000-0000000000a1';
  _memo2 uuid := 'e4000000-0000-4000-8000-0000000000a2';
  _memo3 uuid := 'e4000000-0000-4000-8000-0000000000a3';
  _memo4 uuid := 'e4000000-0000-4000-8000-0000000000a4';
  _enc uuid;
  _n integer; _txt text; _r public.voice_memos;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_doc, 'vm-doc@test.local'), (_other, 'vm-other@test.local'),
    (_patient, 'vm-patient@test.local'), (_stranger, 'vm-stranger@test.local');
  INSERT INTO public.clinician_profiles (user_id) VALUES (_doc), (_other) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES (_patient, _doc, 'Dr Memo', 'vm-doc@test.local', 'vmdoc',
          '{"vitals":true,"meds":true,"adherence":true,"profile":true}'::jsonb, true);

  -- 1. A clinician starts a memo; the pipeline's columns start blank ----------
  PERFORM pg_temp.as_user(_doc);
  INSERT INTO public.voice_memos (id, clinician_user_id, audio_path, status, transcript, duration_ms)
  VALUES (_memo, _doc, _doc || '/memos/' || _memo || '.wav', 'transcribed', 'forged', 99999);
  PERFORM pg_temp.as_user(NULL);
  SELECT * INTO _r FROM public.voice_memos WHERE id = _memo;
  PERFORM pg_temp.assert(_r.status = 'uploaded' AND _r.transcript IS NULL AND _r.duration_ms = 0,
    'a client cannot start a memo as already transcribed, with words or a duration');

  -- 2. Someone else cannot write a memo in the clinician's name ---------------
  PERFORM pg_temp.as_user(_other);
  BEGIN
    INSERT INTO public.voice_memos (clinician_user_id, audio_path) VALUES (_doc, 'x/memos/y.wav');
    _txt := 'inserted';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN _txt := 'refused';
  END;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_txt = 'refused', 'a clinician cannot create a memo owned by someone else');

  -- 3. Owner only -------------------------------------------------------------
  PERFORM pg_temp.as_user(_doc);
  SELECT count(*) INTO _n FROM public.voice_memos;
  PERFORM pg_temp.assert(_n = 1, 'the owner sees their memo');
  PERFORM pg_temp.as_user(_other);
  SELECT count(*) INTO _n FROM public.voice_memos;
  PERFORM pg_temp.assert(_n = 0, 'another clinician sees nothing');
  UPDATE public.voice_memos SET transcript_confirmed_at = now();
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 0, 'another clinician updates nothing');
  DELETE FROM public.voice_memos;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 0, 'another clinician deletes nothing');
  PERFORM pg_temp.as_user(_patient);
  SELECT count(*) INTO _n FROM public.voice_memos;
  PERFORM pg_temp.assert(_n = 0, 'the patient sees nothing');
  PERFORM pg_temp.as_user(NULL);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    SELECT count(*) INTO _n FROM public.voice_memos;
    _txt := _n::text;
  EXCEPTION WHEN insufficient_privilege THEN _txt := 'refused';
  END;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_txt IN ('0', 'refused'), 'anon sees nothing');

  -- 4. The service role transcribes; a blank transcript cannot read transcribed
  UPDATE public.voice_memos SET status = 'transcribed', transcript = 'Review the lisinopril dose.', duration_ms = 61000
   WHERE id = _memo;
  SELECT * INTO _r FROM public.voice_memos WHERE id = _memo;
  PERFORM pg_temp.assert(_r.status = 'transcribed' AND _r.duration_ms = 61000, 'the pipeline records transcript and duration');
  BEGIN
    UPDATE public.voice_memos SET status = 'transcribed', transcript = '   ' WHERE id = _memo;
    _txt := 'accepted';
  EXCEPTION WHEN check_violation THEN _txt := 'refused';
  END;
  PERFORM pg_temp.assert(_txt = 'refused', 'a blank transcript cannot be marked transcribed');
  BEGIN
    UPDATE public.voice_memos SET status = 'transcribed', transcript = NULL WHERE id = _memo;
    _txt := 'accepted';
  EXCEPTION WHEN check_violation THEN _txt := 'refused';
  END;
  PERFORM pg_temp.assert(_txt = 'refused', 'a missing transcript cannot be marked transcribed');

  -- 5. A client cannot move the pipeline's columns ----------------------------
  PERFORM pg_temp.as_user(_doc);
  UPDATE public.voice_memos SET duration_ms = 1, status = 'filed', draft = '{"x":1}'::jsonb,
    audio_path = 'elsewhere.wav', audio_deleted_at = now() WHERE id = _memo;
  PERFORM pg_temp.as_user(NULL);
  SELECT * INTO _r FROM public.voice_memos WHERE id = _memo;
  PERFORM pg_temp.assert(_r.duration_ms = 61000 AND _r.status = 'transcribed' AND _r.draft IS NULL
    AND _r.audio_path NOT LIKE 'elsewhere%' AND _r.audio_deleted_at IS NULL,
    'a client cannot change duration, status, draft, path or the audio-deleted stamp');

  -- 6. Assignment goes through current access ---------------------------------
  PERFORM pg_temp.as_user(_other);
  BEGIN
    PERFORM public.assign_voice_memo(_memo, _patient, NULL); _txt := 'assigned';
  EXCEPTION WHEN OTHERS THEN _txt := 'refused';
  END;
  PERFORM pg_temp.assert(_txt = 'refused', 'another clinician cannot assign my memo');

  PERFORM pg_temp.as_user(_doc);
  BEGIN
    PERFORM public.assign_voice_memo(_memo, _stranger, NULL); _txt := 'assigned';
  EXCEPTION WHEN insufficient_privilege THEN _txt := 'refused';
  END;
  PERFORM pg_temp.assert(_txt = 'refused', 'the RPC refuses a patient the clinician has no access to');

  BEGIN
    UPDATE public.voice_memos SET patient_user_id = _stranger WHERE id = _memo; _txt := 'assigned';
  EXCEPTION WHEN insufficient_privilege THEN _txt := 'refused';
  END;
  PERFORM pg_temp.assert(_txt = 'refused', 'a direct update cannot attach a patient without access either');

  SELECT * INTO _r FROM public.assign_voice_memo(_memo, _patient, NULL);
  PERFORM pg_temp.assert(_r.patient_user_id = _patient AND _r.status = 'assigned' AND _r.assigned_at IS NOT NULL,
    'a patient with current access can be attached, and the status follows');

  PERFORM pg_temp.as_user(_patient);
  SELECT count(*) INTO _n FROM public.voice_memos;
  PERFORM pg_temp.assert(_n = 0, 'the patient still sees nothing once the memo is assigned to them');
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.patient_action_log WHERE patient_user_id = _patient;
  PERFORM pg_temp.assert(_n = 0, 'assignment leaves no patient-visible trace');

  PERFORM pg_temp.as_user(_doc);
  SELECT * INTO _r FROM public.assign_voice_memo(_memo, NULL, NULL);
  PERFORM pg_temp.assert(_r.patient_user_id IS NULL AND _r.status = 'transcribed' AND _r.assigned_at IS NULL,
    'a memo can be detached again');
  UPDATE public.voice_memos SET patient_user_id = _patient WHERE id = _memo;
  SELECT status INTO _txt FROM public.voice_memos WHERE id = _memo;
  PERFORM pg_temp.assert(_txt = 'assigned', 'a direct update with access also works, and moves the status');

  -- A draft encounter to file into, made while access is current.
  INSERT INTO public.encounters (patient_user_id, clinician_user_id, status, visit_type)
  VALUES (_patient, _doc, 'in_progress', 'follow_up') RETURNING id INTO _enc;

  -- 7. Access ends: the memo stays, but cannot be (re)assigned or filed -------
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.provider_shares SET is_active = false WHERE user_id = _patient AND clinician_user_id = _doc;

  PERFORM pg_temp.as_user(_doc);
  SELECT count(*) INTO _n FROM public.voice_memos WHERE id = _memo;
  PERFORM pg_temp.assert(_n = 1, 'the clinician keeps their own memo after access ends');
  BEGIN
    PERFORM public.assign_voice_memo(_memo, _patient, NULL); _txt := 'assigned';
  EXCEPTION WHEN insufficient_privilege THEN _txt := 'refused';
  END;
  PERFORM pg_temp.assert(_txt = 'refused', 'assignment after access ends is refused (RPC)');
  -- detach first, then try to re-attach directly
  PERFORM public.assign_voice_memo(_memo, NULL, NULL);
  BEGIN
    UPDATE public.voice_memos SET patient_user_id = _patient WHERE id = _memo; _txt := 'assigned';
  EXCEPTION WHEN insufficient_privilege THEN _txt := 'refused';
  END;
  PERFORM pg_temp.assert(_txt = 'refused', 'assignment after access ends is refused (direct update)');

  PERFORM pg_temp.as_user(NULL);
  -- memo2: assigned while access was current (set by the service role), now unfileable.
  INSERT INTO public.voice_memos (id, clinician_user_id, patient_user_id, audio_path, status, transcript)
  VALUES (_memo2, _doc, _patient, _doc || '/memos/' || _memo2 || '.wav', 'assigned', 'Chest clear.');
  PERFORM pg_temp.as_user(_doc);
  BEGIN
    PERFORM public.file_voice_memo(_memo2, _enc); _txt := 'filed';
  EXCEPTION WHEN insufficient_privilege THEN _txt := 'refused';
  END;
  PERFORM pg_temp.assert(_txt = 'refused', 'filing after access ends is refused');

  -- 8. With access back, filing works, is logged, and is final ----------------
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.provider_shares SET is_active = true WHERE user_id = _patient AND clinician_user_id = _doc;
  PERFORM pg_temp.as_user(_other);
  BEGIN
    PERFORM public.file_voice_memo(_memo2, _enc); _txt := 'filed';
  EXCEPTION WHEN OTHERS THEN _txt := 'refused';
  END;
  PERFORM pg_temp.assert(_txt = 'refused', 'another clinician cannot file my memo');
  PERFORM pg_temp.as_user(_doc);
  SELECT * INTO _r FROM public.file_voice_memo(_memo2, _enc);
  PERFORM pg_temp.assert(_r.status = 'filed' AND _r.encounter_id = _enc AND _r.transcript_confirmed_at IS NOT NULL,
    'a memo is filed into the clinician''s own encounter for that patient');
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.patient_action_log
   WHERE patient_user_id = _patient AND action = 'voice_memo_drafted';
  PERFORM pg_temp.assert(_n = 1, 'filing, and only filing, leaves a trace');
  PERFORM pg_temp.as_user(_doc);
  UPDATE public.voice_memos SET patient_user_id = NULL, status = 'discarded' WHERE id = _memo2;
  SELECT status INTO _txt FROM public.voice_memos WHERE id = _memo2;
  PERFORM pg_temp.assert(_txt = 'filed', 'a filed memo cannot be discarded or detached by a client');

  -- 9. Discarding drops the words ---------------------------------------------
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.voice_memos (id, clinician_user_id, audio_path, status, transcript)
  VALUES (_memo3, _doc, _doc || '/memos/' || _memo3 || '.wav', 'transcribed', 'Private jottings.');
  PERFORM pg_temp.as_user(_doc);
  UPDATE public.voice_memos SET status = 'discarded' WHERE id = _memo3;
  SELECT * INTO _r FROM public.voice_memos WHERE id = _memo3;
  PERFORM pg_temp.assert(_r.status = 'discarded' AND _r.transcript IS NULL AND _r.transcript_confirmed_at IS NOT NULL,
    'discarding clears the transcript and starts the audio clock');

  -- 10. Retention -------------------------------------------------------------
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.voice_memos (id, clinician_user_id, audio_path, status, transcript, created_at)
  VALUES (_memo4, _other, _other || '/memos/' || _memo4 || '.wav', 'transcribed', 'Old and unconfirmed.',
          now() - interval '31 days');
  UPDATE public.voice_memos SET transcript_confirmed_at = now() - interval '25 hours' WHERE id = _memo2;
  UPDATE public.voice_memos SET transcript_confirmed_at = now() - interval '25 hours' WHERE id = _memo3;
  UPDATE public.voice_memos SET transcript_confirmed_at = now() - interval '2 hours' WHERE id = _memo;
  SELECT count(*) INTO _n FROM public.voice_memo_audio_due(100) WHERE id IN (_memo, _memo2, _memo3, _memo4);
  PERFORM pg_temp.assert(_n = 3, 'due: confirmed over 24 h ago, discarded over 24 h ago, and over 30 days old');
  SELECT count(*) INTO _n FROM public.voice_memo_audio_due(100) WHERE id = _memo;
  PERFORM pg_temp.assert(_n = 0, 'a memo confirmed 2 hours ago keeps its audio for now');

  UPDATE public.clinician_profiles SET keep_memo_audio = true WHERE user_id = _doc;
  SELECT count(*) INTO _n FROM public.voice_memo_audio_due(100) WHERE id IN (_memo, _memo2, _memo3);
  PERFORM pg_temp.assert(_n = 0, 'a clinician who keeps memo audio is skipped');
  SELECT count(*) INTO _n FROM public.voice_memo_audio_due(100) WHERE id = _memo4;
  PERFORM pg_temp.assert(_n = 1, 'other clinicians are unaffected (default is not to keep)');

  PERFORM public.voice_memo_mark_audio_deleted(ARRAY[_memo4]);
  SELECT count(*) INTO _n FROM public.voice_memos WHERE id = _memo4 AND audio_deleted_at IS NOT NULL;
  PERFORM pg_temp.assert(_n = 1, 'the service role stamps audio_deleted_at');
  SELECT count(*) INTO _n FROM public.voice_memo_audio_due(100) WHERE id = _memo4;
  PERFORM pg_temp.assert(_n = 0, 'a memo whose audio is gone is not due again');

  PERFORM pg_temp.as_user(_doc);
  BEGIN
    PERFORM public.voice_memo_mark_audio_deleted(ARRAY[_memo]); _txt := 'ran';
  EXCEPTION WHEN insufficient_privilege THEN _txt := 'refused';
  END;
  PERFORM pg_temp.assert(_txt = 'refused', 'a clinician cannot call the retention functions');
  PERFORM pg_temp.as_user(NULL);

  RAISE NOTICE 'ALL VOICE MEMO TESTS PASSED';
END $$;

ROLLBACK;
