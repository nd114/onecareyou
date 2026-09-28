-- The person who filed a patient record keeps reading it, and every edit names
-- its editor.
--
-- 20261009080000 took a claimed record away from its own author once the
-- patient revoked. For front desk that left nothing but the access log as
-- evidence of what they had filed. The author now always reads what they
-- filed, read-only once the patient has claimed it, and gains nothing else of
-- the patient's. Colleagues, owners and admins still read a claimed record only
-- on a live share, as may_read_practice_patient_record() decides.
--
-- A colleague may edit an unclaimed practice record (since 20261009080000), so
-- the row carries updated_by, stamped from auth.uid() by trigger and not
-- writable by the caller, and the audit log names the editor of every update.

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
  _owner   uuid := 'a0000000-0000-4000-8000-000000000af0';
  _dr      uuid := 'a0000000-0000-4000-8000-000000000af1';
  _nurse   uuid := 'a0000000-0000-4000-8000-000000000af2';
  _front   uuid := 'a0000000-0000-4000-8000-000000000af3';
  _front2  uuid := 'a0000000-0000-4000-8000-000000000af4';
  _solo    uuid := 'a0000000-0000-4000-8000-000000000af5';
  _patient uuid := 'a0000000-0000-4000-8000-000000000af6';
  _hosp    uuid := 'a0000000-0000-4000-8000-000000000ac1';
  _r_solo  uuid := 'a0000000-0000-4000-8000-000000000ae1';  -- solo clinician filed, claimed
  _r_front uuid := 'a0000000-0000-4000-8000-000000000ae2';  -- front desk filed, claimed
  _r_dr    uuid := 'a0000000-0000-4000-8000-000000000ae3';  -- doctor filed, claimed
  _r_open  uuid := 'a0000000-0000-4000-8000-000000000ae4';  -- doctor filed, unclaimed
  _r_walk  uuid := 'a0000000-0000-4000-8000-000000000ae5';  -- front desk filed, unclaimed
  _r_spoof uuid := 'a0000000-0000-4000-8000-000000000ae6';
  _n       integer;
  _txt     text;
  _who     uuid;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_owner,   'akf-owner@test.local',   now()),
    (_dr,      'akf-dr@test.local',      now()),
    (_nurse,   'akf-nurse@test.local',   now()),
    (_front,   'akf-front@test.local',   now()),
    (_front2,  'akf-front2@test.local',  now()),
    (_solo,    'akf-solo@test.local',    now()),
    (_patient, 'akf-patient@test.local', now());

  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  INSERT INTO public.practices (id, name, created_by) VALUES (_hosp, 'Keep Practice', _owner);
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (_hosp, _owner,  'owner',      'active'),
    (_hosp, _dr,     'provider',   'active'),
    (_hosp, _nurse,  'nurse',      'active'),
    (_hosp, _front,  'front_desk', 'active'),
    (_hosp, _front2, 'front_desk', 'active')
  ON CONFLICT (practice_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

  PERFORM pg_temp.as_user(_solo);
  INSERT INTO public.clinician_patient_records (id, clinician_user_id, patient_name, patient_email, notes)
  VALUES (_r_solo, _solo, 'Pat Keep', 'akf-patient@test.local', 'Solo note');

  PERFORM pg_temp.as_user(_front);
  INSERT INTO public.clinician_patient_records (id, clinician_user_id, practice_id, patient_name, patient_email, notes)
  VALUES (_r_front, _front, _hosp, 'Pat Keep', 'akf-patient@test.local', 'Desk intake'),
         (_r_walk,  _front, _hosp, 'Walk In',  'akf-walkin@test.local',  'Walk-in intake');

  PERFORM pg_temp.as_user(_dr);
  INSERT INTO public.clinician_patient_records (id, clinician_user_id, practice_id, patient_name, patient_email, notes)
  VALUES (_r_dr,   _dr, _hosp, 'Pat Keep',   'akf-patient@test.local', 'Doctor note'),
         (_r_open, _dr, _hosp, 'Not Joined', 'akf-nobody@test.local',  'Pending note');
  PERFORM pg_temp.as_user(NULL);

  -- The patient claims three records, shares with both solo and front desk
  -- authors and with the practice, and has a reading of their own.
  UPDATE public.clinician_patient_records
     SET linked_user_id = _patient, invitation_status = 'accepted'
   WHERE id IN (_r_solo, _r_front, _r_dr);

  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  INSERT INTO public.provider_shares (user_id, provider_name, clinician_user_id, invite_code, is_active) VALUES
    (_patient, 'Solo',  _solo,  'akf-solo-code-01', true),
    (_patient, 'Front', _front, 'akf-front-code-1', true);
  INSERT INTO public.practice_shares (practice_id, user_id) VALUES (_hosp, _patient);
  INSERT INTO public.vitals (user_id, type, value, unit) VALUES (_patient, 'heart_rate', '72', 'bpm');

  -- Colleagues read the claimed record while the share is live, so the
  -- negatives below are about revocation and not about never having had access.
  PERFORM pg_temp.as_user(_nurse);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _r_dr;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 1, 'a clinical colleague reads the claimed record while the practice share is live');

  PERFORM pg_temp.as_user(_owner);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _r_dr;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 1, 'so does the practice owner');

  -- ==========================================================================
  -- The patient revokes everything
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  UPDATE public.provider_shares SET is_active = false, revoked_at = now()
   WHERE user_id = _patient;
  UPDATE public.practice_shares SET is_active = false, revoked_at = now()
   WHERE practice_id = _hosp AND user_id = _patient;

  -- ==========================================================================
  -- 1. Authors keep reading what they filed
  -- ==========================================================================
  PERFORM pg_temp.as_user(_solo);
  SELECT notes INTO _txt FROM public.clinician_patient_records WHERE id = _r_solo;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_txt = 'Solo note', 'after revocation the solo author still reads the record they filed');

  PERFORM pg_temp.as_user(_front);
  SELECT notes INTO _txt FROM public.clinician_patient_records WHERE id = _r_front;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_txt = 'Desk intake', 'front desk still reads the claimed record it filed after revocation');

  PERFORM pg_temp.as_user(_dr);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _r_dr;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 1, 'a practice author still reads their record after the practice is revoked');

  -- ==========================================================================
  -- 2. ...read-only, and nothing else of the patient's
  -- ==========================================================================
  PERFORM pg_temp.as_user(_solo);
  UPDATE public.clinician_patient_records SET notes = 'rewritten' WHERE id = _r_solo;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.as_user(NULL);
  SELECT notes INTO _txt FROM public.clinician_patient_records WHERE id = _r_solo;
  PERFORM pg_temp.assert(_n = 0 AND _txt = 'Solo note', 'the solo author cannot edit the claimed record');

  PERFORM pg_temp.as_user(_front);
  UPDATE public.clinician_patient_records SET notes = 'rewritten', tags = '["x"]' WHERE id = _r_front;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.as_user(NULL);
  SELECT notes INTO _txt FROM public.clinician_patient_records WHERE id = _r_front;
  PERFORM pg_temp.assert(_n = 0 AND _txt = 'Desk intake', 'front desk cannot edit the claimed record it filed');

  PERFORM pg_temp.as_user(_dr);
  UPDATE public.clinician_patient_records SET notes = 'rewritten' WHERE id = _r_dr;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.as_user(NULL);
  SELECT notes INTO _txt FROM public.clinician_patient_records WHERE id = _r_dr;
  PERFORM pg_temp.assert(_n = 0 AND _txt = 'Doctor note', 'nor can a practice author');

  PERFORM pg_temp.as_user(_front);
  DELETE FROM public.clinician_patient_records WHERE id = _r_front;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _r_front;
  PERFORM pg_temp.assert(_n = 1, 'nor delete it');

  PERFORM pg_temp.as_user(_solo);
  SELECT count(*) INTO _n FROM public.vitals WHERE user_id = _patient;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 0, 'keeping the record opens none of the patient''s vitals');

  PERFORM pg_temp.as_user(_front);
  SELECT count(*) INTO _n FROM public.vitals WHERE user_id = _patient;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 0, 'nor to front desk');

  PERFORM pg_temp.as_user(_solo);
  PERFORM pg_temp.assert(NOT public.clinician_has_patient_access(_patient), 'the author has no share-based access to the patient');
  PERFORM pg_temp.as_user(NULL);

  -- ==========================================================================
  -- 3. Nobody else keeps it
  -- ==========================================================================
  PERFORM pg_temp.as_user(_front2);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id IN (_r_front, _r_walk, _r_dr);
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 0, 'a colleague on front desk reads none of the records others filed');

  PERFORM pg_temp.as_user(_nurse);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id IN (_r_dr, _r_front);
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 0, 'a clinical colleague no longer reads the claimed record after revocation');

  PERFORM pg_temp.as_user(_owner);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id IN (_r_dr, _r_front);
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 0, 'nor does the practice owner');

  PERFORM pg_temp.as_user(_solo);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id IN (_r_front, _r_dr);
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 0, 'an author reads only their own filings, not other records for the same patient');

  -- ==========================================================================
  -- 4. Every edit names its editor
  -- ==========================================================================
  PERFORM pg_temp.as_user(_nurse);
  UPDATE public.clinician_patient_records SET notes = 'Nurse triage added' WHERE id = _r_open;
  PERFORM pg_temp.as_user(NULL);
  SELECT updated_by, notes INTO _who, _txt FROM public.clinician_patient_records WHERE id = _r_open;
  PERFORM pg_temp.assert(_who = _nurse AND _txt = 'Nurse triage added', 'a colleague''s edit is stamped with the colleague');

  SELECT count(*) INTO _n FROM public.hipaa_audit_logs
   WHERE resource_type = 'clinician_patient_records' AND resource_id = _r_open::text
     AND user_id = _nurse AND action = 'managed_record_edited_updated' AND created_at IS NOT NULL;
  PERFORM pg_temp.assert(_n = 1, 'and the audit log names the colleague as the editor');

  PERFORM pg_temp.as_user(_dr);
  UPDATE public.clinician_patient_records SET notes = 'Reviewed', updated_by = _nurse WHERE id = _r_open;
  PERFORM pg_temp.as_user(NULL);
  SELECT updated_by INTO _who FROM public.clinician_patient_records WHERE id = _r_open;
  PERFORM pg_temp.assert(_who = _dr, 'the editor is stamped from the session, not taken from the caller');

  PERFORM pg_temp.as_user(_front);
  UPDATE public.clinician_patient_records SET notes = 'Rebooked' WHERE id = _r_walk;
  PERFORM pg_temp.as_user(NULL);
  SELECT updated_by INTO _who FROM public.clinician_patient_records WHERE id = _r_walk;
  PERFORM pg_temp.assert(_who = _front, 'front desk editing its own filing is stamped too');

  PERFORM pg_temp.as_user(_dr);
  INSERT INTO public.clinician_patient_records (id, clinician_user_id, practice_id, patient_name, updated_by)
  VALUES (_r_spoof, _dr, _hosp, 'Fresh', _nurse);
  PERFORM pg_temp.as_user(NULL);
  SELECT updated_by INTO _who FROM public.clinician_patient_records WHERE id = _r_spoof;
  PERFORM pg_temp.assert(_who IS NULL, 'a new record has no editor, whatever the caller sends');

  RAISE NOTICE 'authors_keep_what_they_filed: all assertions passed';
END $$;

ROLLBACK;
