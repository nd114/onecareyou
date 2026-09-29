-- Who reads a patient record after the patient has taken it over, and who
-- may change a record a colleague filed.
--
-- The author of a clinician_patient_records row read it on authorship alone.
-- Once the patient had claimed it and then revoked the author (or the
-- practice), the author, front desk included, went on reading the patient's
-- conditions, medications and notes. 20261009080000 made the author read a
-- claimed record only on a live relationship with the patient;
-- 20261010000000 reversed that for the author alone, by product decision: the
-- person who filed a record keeps reading it, read-only, after revocation.
-- Section 3 asserts the current rule. authors_keep_what_they_filed.test.sql
-- covers it in full.
--
-- Practice staff updated any unclaimed record the practice had filed on
-- may_manage_practice_patient_records(), which admits every member holding
-- can_invite_patients. Front desk could no longer read a colleague's record
-- but could still overwrite it blind. Now a colleague's record is changed only
-- by a clinical member who could read it, and no update moves a record to
-- another practice or re-attributes it to somebody else.

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
  _owner   uuid := 'a0000000-0000-4000-8000-0000000008f0';
  _dr      uuid := 'a0000000-0000-4000-8000-0000000008f1';
  _nurse   uuid := 'a0000000-0000-4000-8000-0000000008f2';
  _front   uuid := 'a0000000-0000-4000-8000-0000000008f3';
  _solo    uuid := 'a0000000-0000-4000-8000-0000000008f4';
  _patient uuid := 'a0000000-0000-4000-8000-0000000008f6';
  _hosp    uuid := 'a0000000-0000-4000-8000-0000000008c1';
  _elsewhere uuid := 'a0000000-0000-4000-8000-0000000008c2';
  _r_solo  uuid := 'a0000000-0000-4000-8000-0000000008e1';  -- solo clinician's record, claimed
  _r_front uuid := 'a0000000-0000-4000-8000-0000000008e2';  -- front desk filed, claimed
  _r_dr    uuid := 'a0000000-0000-4000-8000-0000000008e3';  -- doctor filed, claimed
  _r_open  uuid := 'a0000000-0000-4000-8000-0000000008e4';  -- doctor filed, unclaimed
  _r_walk  uuid := 'a0000000-0000-4000-8000-0000000008e5';  -- front desk filed, unclaimed
  _solo_share  uuid;
  _front_share uuid;
  _n       integer;
  _txt     text;
  _raised  boolean;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_owner,   'pra-owner@test.local',   now()),
    (_dr,      'pra-dr@test.local',      now()),
    (_nurse,   'pra-nurse@test.local',   now()),
    (_front,   'pra-front@test.local',   now()),
    (_solo,    'pra-solo@test.local',    now()),
    (_patient, 'pra-patient@test.local', now());

  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  INSERT INTO public.practices (id, name, created_by) VALUES
    (_hosp, 'Authors Practice', _owner),
    (_elsewhere, 'Another Practice', _owner);
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (_hosp, _owner, 'owner',      'active'),
    (_hosp, _dr,    'provider',   'active'),
    (_hosp, _nurse, 'nurse',      'active'),
    (_hosp, _front, 'front_desk', 'active'),
    (_elsewhere, _owner, 'owner', 'active'),
    (_elsewhere, _nurse, 'nurse', 'active'),
    (_elsewhere, _dr,    'provider', 'active')
  ON CONFLICT (practice_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

  -- Records filed through the ordinary INSERT policies.
  -- A solo clinician is a clinician account (20261010090000).
  INSERT INTO public.clinician_profiles (user_id) VALUES (_solo) ON CONFLICT (user_id) DO NOTHING;
  PERFORM pg_temp.as_user(_solo);
  INSERT INTO public.clinician_patient_records (id, clinician_user_id, patient_name, patient_email, notes)
  VALUES (_r_solo, _solo, 'Pat Example', 'pra-patient@test.local', 'Solo note');

  PERFORM pg_temp.as_user(_front);
  INSERT INTO public.clinician_patient_records (id, clinician_user_id, practice_id, patient_name, patient_email, notes)
  VALUES (_r_front, _front, _hosp, 'Pat Example', 'pra-patient@test.local', 'Desk intake'),
         (_r_walk,  _front, _hosp, 'Walk In',     'pra-walkin@test.local',  'Walk-in intake');

  PERFORM pg_temp.as_user(_dr);
  INSERT INTO public.clinician_patient_records (id, clinician_user_id, practice_id, patient_name, patient_email, notes)
  VALUES (_r_dr,   _dr, _hosp, 'Pat Example', 'pra-patient@test.local', 'Doctor note'),
         (_r_open, _dr, _hosp, 'Not Joined',  'pra-nobody@test.local',  'Pending note');
  PERFORM pg_temp.as_user(NULL);

  -- ==========================================================================
  -- 1. Before anyone claims a record, its author reads it
  -- ==========================================================================
  PERFORM pg_temp.as_user(_solo);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _r_solo;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 1, 'the author reads an unclaimed record');

  PERFORM pg_temp.as_user(_front);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id IN (_r_front, _r_walk);
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 2, 'front desk reads the unclaimed records it filed');

  -- ==========================================================================
  -- 2. The patient claims three of them and consents
  -- ==========================================================================
  -- As ClinicianDataConsentDialog does: link the record, then a provider share
  -- naming the record's author. The patient also shares with the practice.
  UPDATE public.clinician_patient_records
     SET linked_user_id = _patient, invitation_status = 'accepted'
   WHERE id IN (_r_solo, _r_front, _r_dr);

  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  INSERT INTO public.provider_shares (user_id, provider_name, clinician_user_id, invite_code, is_active)
  VALUES (_patient, 'Solo', _solo, 'pra-solo-code-01', true) RETURNING id INTO _solo_share;
  INSERT INTO public.provider_shares (user_id, provider_name, clinician_user_id, invite_code, is_active)
  VALUES (_patient, 'Front', _front, 'pra-front-code-1', true) RETURNING id INTO _front_share;
  INSERT INTO public.practice_shares (practice_id, user_id) VALUES (_hosp, _patient);

  PERFORM pg_temp.as_user(_solo);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _r_solo;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 1, 'with a live share the author reads the claimed record');

  PERFORM pg_temp.as_user(_front);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _r_front;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 1, 'front desk reads a claimed record it filed while the patient''s share with it is live');

  PERFORM pg_temp.as_user(_dr);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _r_dr;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 1, 'a practice author reads the claimed record on the practice share');

  -- ==========================================================================
  -- 3. The patient revokes; the authors keep what they filed, colleagues do not
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  UPDATE public.provider_shares SET is_active = false, revoked_at = now()
   WHERE id IN (_solo_share, _front_share);

  PERFORM pg_temp.as_user(_solo);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _r_solo;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 1, 'after revocation the solo author still reads the record they filed');

  PERFORM pg_temp.as_user(_front);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _r_front;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 1, 'so does the front desk author');

  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  UPDATE public.practice_shares SET is_active = false, revoked_at = now()
   WHERE practice_id = _hosp AND user_id = _patient;

  PERFORM pg_temp.as_user(_dr);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _r_dr;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 1, 'once the practice is revoked its author still reads the record they filed');

  PERFORM pg_temp.as_user(_nurse);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id IN (_r_dr, _r_front);
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 0, 'a colleague who did not file it stops reading the claimed record');

  PERFORM pg_temp.as_user(_patient);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id IN (_r_solo, _r_front, _r_dr);
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 3, 'the patient still reads every record linked to them');

  -- ==========================================================================
  -- 4. Front desk changes only the records it filed
  -- ==========================================================================
  -- Blind: with no WHERE clause the SELECT policies are not consulted, so a
  -- row front desk cannot read is still reached if the UPDATE policy admits it.
  PERFORM pg_temp.as_user(_front);
  UPDATE public.clinician_patient_records SET tags = '["overwritten"]';
  PERFORM pg_temp.as_user(NULL);
  SELECT tags::text INTO _txt FROM public.clinician_patient_records WHERE id = _r_open;
  PERFORM pg_temp.assert(_txt IS DISTINCT FROM '["overwritten"]', 'front desk cannot overwrite a colleague''s record blind');
  SELECT tags::text INTO _txt FROM public.clinician_patient_records WHERE id = _r_walk;
  PERFORM pg_temp.assert(_txt = '["overwritten"]', 'the same statement does reach the record front desk filed');

  PERFORM pg_temp.as_user(_front);
  UPDATE public.clinician_patient_records SET notes = 'Walk-in, rebooked' WHERE id = _r_walk;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.as_user(NULL);
  SELECT notes INTO _txt FROM public.clinician_patient_records WHERE id = _r_walk;
  PERFORM pg_temp.assert(_n = 1 AND _txt = 'Walk-in, rebooked', 'front desk edits a record it filed');

  -- ==========================================================================
  -- 5. A clinical colleague edits an unclaimed practice record
  -- ==========================================================================
  PERFORM pg_temp.as_user(_nurse);
  UPDATE public.clinician_patient_records SET notes = 'Nurse triage added' WHERE id = _r_open;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.as_user(NULL);
  SELECT notes INTO _txt FROM public.clinician_patient_records WHERE id = _r_open;
  PERFORM pg_temp.assert(_n = 1 AND _txt = 'Nurse triage added', 'a nurse edits a colleague''s unclaimed practice record');

  PERFORM pg_temp.as_user(_nurse);
  UPDATE public.clinician_patient_records SET notes = 'x' WHERE id = _r_dr;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 0, 'nobody at the practice edits a claimed record');

  -- ==========================================================================
  -- 6. No update moves a record to another practice or re-attributes it
  -- ==========================================================================
  _raised := false;
  BEGIN
    PERFORM pg_temp.as_user(_nurse);
    UPDATE public.clinician_patient_records SET practice_id = _elsewhere WHERE id = _r_open;
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _r_open AND practice_id = _hosp;
  PERFORM pg_temp.assert(_raised AND _n = 1, 'a colleague cannot move a record to another practice');

  _raised := false;
  BEGIN
    PERFORM pg_temp.as_user(_dr);
    UPDATE public.clinician_patient_records SET practice_id = _elsewhere WHERE id = _r_open;
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _r_open AND practice_id = _hosp;
  PERFORM pg_temp.assert(_raised AND _n = 1, 'nor can its author');

  _raised := false;
  BEGIN
    PERFORM pg_temp.as_user(_nurse);
    UPDATE public.clinician_patient_records SET clinician_user_id = _nurse WHERE id = _r_open;
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _r_open AND clinician_user_id = _dr;
  PERFORM pg_temp.assert(_raised AND _n = 1, 'a colleague cannot re-attribute a record to themselves');

  _raised := false;
  BEGIN
    PERFORM pg_temp.as_user(_nurse);
    UPDATE public.clinician_patient_records SET linked_user_id = _nurse WHERE id = _r_open;
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _r_open AND linked_user_id IS NULL;
  PERFORM pg_temp.assert(_raised AND _n = 1, 'a colleague cannot link a record to anybody');

  -- The practice update policy is for signed-in users only.
  SELECT count(*) INTO _n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'clinician_patient_records'
     AND policyname = 'Practice staff update records their practice created'
     AND roles = '{authenticated}' AND with_check IS NOT NULL;
  PERFORM pg_temp.assert(_n = 1, 'the practice update policy applies to authenticated and has a WITH CHECK');

  RAISE NOTICE 'practice_record_authors_and_editors: all assertions passed';
END $$;

ROLLBACK;
