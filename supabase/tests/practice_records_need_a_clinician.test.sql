-- A practice-created patient record is clinical content — conditions,
-- medications, notes — and only the practice's clinicians read it. Once the
-- record is linked to a OneCare patient, it is read on the patient's live
-- share, like everything else of theirs the practice holds.
--
-- Before this, the practice read policy admitted anyone with
-- can_invite_patients, which defaults to true for every member. Billing and
-- front desk read every record the practice had created, and kept reading it
-- after the patient revoked the practice's access.
--
-- Converted from docs/security/phi-audit-2026-09/phi-p2/repro2 (A and F).

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
  _owner   uuid := 'a0000000-0000-4000-8000-0000000000f0';
  _dr      uuid := 'a0000000-0000-4000-8000-0000000000f1';
  _nurse   uuid := 'a0000000-0000-4000-8000-0000000000f2';
  _front   uuid := 'a0000000-0000-4000-8000-0000000000f3';
  _biller  uuid := 'a0000000-0000-4000-8000-0000000000f4';
  _gone    uuid := 'a0000000-0000-4000-8000-0000000000f5';
  _patient uuid := 'a0000000-0000-4000-8000-0000000000f6';
  _other   uuid := 'a0000000-0000-4000-8000-0000000000f7';
  _hosp    uuid := 'a0000000-0000-4000-8000-0000000000c9';
  _linked  uuid := 'a0000000-0000-4000-8000-0000000000e1';
  _pending uuid := 'a0000000-0000-4000-8000-0000000000e2';
  _own     uuid := 'a0000000-0000-4000-8000-0000000000e3';
  _n       integer;
  _txt     text;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_owner,   'prc-owner@test.local',   now()),
    (_dr,      'prc-dr@test.local',      now()),
    (_nurse,   'prc-nurse@test.local',   now()),
    (_front,   'prc-front@test.local',   now()),
    (_biller,  'prc-biller@test.local',  now()),
    (_gone,    'prc-gone@test.local',    now()),
    (_patient, 'prc-patient@test.local', now()),
    (_other,   'prc-other@test.local',   now());

  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  INSERT INTO public.practices (id, name, created_by) VALUES (_hosp, 'Record Test Practice', _owner);
  -- Made under the owner's own session, so the practice starts with one clinician
  -- seat. The platform (no signed-in user) gives it the five this test seats.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  UPDATE public.practices SET member_limit = 5 WHERE id IN (_hosp);
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (_hosp, _owner,  'owner',      'active'),
    (_hosp, _dr,     'provider',   'active'),
    (_hosp, _nurse,  'nurse',      'active'),
    (_hosp, _front,  'front_desk', 'active'),
    (_hosp, _biller, 'billing',    'active'),
    (_hosp, _gone,   'provider',   'revoked')
  ON CONFLICT (practice_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

  -- The front desk member still has the invite right. That is what let them read.
  SELECT count(*) INTO _n FROM public.practice_members
   WHERE practice_id = _hosp AND user_id IN (_front, _biller) AND can_invite_patients;
  PERFORM pg_temp.assert(_n = 2, 'front desk and billing hold can_invite_patients (the default)');

  -- The patient shares with the practice.
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  INSERT INTO public.practice_shares (practice_id, user_id) VALUES (_hosp, _patient);

  -- The doctor files two records for the practice: one the patient will claim,
  -- one still waiting on an invitation.
  PERFORM pg_temp.as_user(_dr);
  INSERT INTO public.clinician_patient_records
    (id, clinician_user_id, practice_id, patient_name, patient_email,
     health_conditions, medications, notes)
  VALUES
    (_linked,  _dr, _hosp, 'Pat Example', 'prc-patient@test.local',
     '["major depressive disorder"]', '[{"name":"Sertraline"}]', 'Staging note'),
    (_pending, _dr, _hosp, 'Not Yet Joined', 'prc-nobody@test.local',
     '["asthma"]', '[]', 'Pending note');
  PERFORM pg_temp.as_user(NULL);

  -- The patient claims the first.
  UPDATE public.clinician_patient_records
     SET linked_user_id = _patient, invitation_status = 'accepted'
   WHERE id = _linked;

  -- ==========================================================================
  -- 1. Front desk and billing read no clinical record the practice created
  -- ==========================================================================
  PERFORM pg_temp.as_user(_front);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id IN (_linked, _pending);
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 0, 'front desk reads neither the claimed nor the pending record');

  PERFORM pg_temp.as_user(_biller);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id IN (_linked, _pending);
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 0, 'billing reads neither the claimed nor the pending record');

  PERFORM pg_temp.as_user(_gone);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id IN (_linked, _pending);
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 0, 'a revoked member reads nothing');

  PERFORM pg_temp.as_user(_other);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id IN (_linked, _pending);
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 0, 'somebody outside the practice reads nothing');

  -- ==========================================================================
  -- 2. The practice's clinicians still read them
  -- ==========================================================================
  PERFORM pg_temp.as_user(_nurse);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id IN (_linked, _pending);
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 2, 'a nurse at the practice reads both records while the share is live');

  PERFORM pg_temp.as_user(_owner);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id IN (_linked, _pending);
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 2, 'the practice owner reads both records while the share is live');

  -- ==========================================================================
  -- 3. Front desk can still register and invite a patient
  -- ==========================================================================
  PERFORM pg_temp.as_user(_front);
  INSERT INTO public.clinician_patient_records
    (id, clinician_user_id, practice_id, patient_name, patient_email)
  VALUES (_own, _front, _hosp, 'Walk In', 'prc-walkin@test.local');
  SELECT patient_name INTO _txt FROM public.clinician_patient_records WHERE id = _own;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_txt = 'Walk In', 'front desk registers a patient and sees the row it filed');

  -- ==========================================================================
  -- 4. The patient revokes; the practice stops reading the claimed record
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  UPDATE public.practice_shares SET is_active = false, revoked_at = now()
   WHERE practice_id = _hosp AND user_id = _patient;

  PERFORM pg_temp.as_user(_nurse);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _linked;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 0, 'after revocation a colleague no longer reads the claimed record');

  PERFORM pg_temp.as_user(_owner);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _linked;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 0, 'nor does the owner');

  PERFORM pg_temp.as_user(_front);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _linked;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 0, 'nor front desk');

  -- A record nobody has claimed has no share to revoke; clinicians keep it.
  PERFORM pg_temp.as_user(_nurse);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _pending;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 1, 'the pending record stays with the practice''s clinicians');

  -- The patient still reads their own.
  PERFORM pg_temp.as_user(_patient);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _linked;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 1, 'the patient still reads the record linked to them');

  RAISE NOTICE 'practice_records_need_a_clinician: all assertions passed';
END $$;

ROLLBACK;
