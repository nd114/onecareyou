-- A hospital owner or admin is clinical only when they hold a clinical seat.
--
-- Until now every owner and admin was clinical by role, so a hospital's IT
-- administrator, who only manages accounts, could read the chart of every
-- shared patient. In a HOSPITAL tenant (practices.tenant_type = 'hospital') an
-- owner or admin now reads and writes clinical records only while
-- practice_members.clinical_seat is true. Every other role is unchanged, and
-- every non-hospital tenant behaves exactly as before whatever the flag says.
--
-- Both halves are asserted: the ops-only admin is kept out of the chart, and
-- the seated one, and the owner who held access before the column existed,
-- keep working. The flag is pinned: a client cannot write it, only
-- set_member_clinical_seat can, and turning a seat off bites at once.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/hospital_clinical_seat.test.sql

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

CREATE OR REPLACE FUNCTION pg_temp.as_anon() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  EXECUTE 'SET LOCAL ROLE anon';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_service() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  EXECUTE 'SET LOCAL ROLE service_role';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.state_of(_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END;
$$;

-- Rows the given user can read, counted under their own role.
CREATE OR REPLACE FUNCTION pg_temp.seen(_uid uuid, _sql text) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE _n integer;
BEGIN
  PERFORM pg_temp.as_user(_uid);
  EXECUTE 'SELECT count(*) FROM (' || _sql || ') s' INTO _n;
  PERFORM pg_temp.as_user(NULL);
  RETURN _n;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.set_seat(_uid uuid, _prac uuid, _target uuid, _on boolean) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _st text;
BEGIN
  PERFORM pg_temp.as_user(_uid);
  _st := pg_temp.state_of(format('SELECT public.set_member_clinical_seat(%L, %L, %L)', _prac, _target, _on));
  PERFORM pg_temp.as_user(NULL);
  RETURN _st;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.enc_insert(_by uuid, _patient uuid, _prac uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _st text;
BEGIN
  PERFORM pg_temp.as_user(_by);
  _st := pg_temp.state_of(format(
    'INSERT INTO public.encounters (patient_user_id, clinician_user_id, practice_id, visit_type) VALUES (%L, %L, %L, ''annual'')',
    _patient, _by, _prac));
  PERFORM pg_temp.as_user(NULL);
  RETURN _st;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.plan_insert(_by uuid, _patient uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _st text;
BEGIN
  PERFORM pg_temp.as_user(_by);
  _st := pg_temp.state_of(format(
    'INSERT INTO public.fhir_care_plans (patient_user_id, title, status, created_by) VALUES (%L, ''Plan'', ''active'', %L)',
    _patient, _by));
  PERFORM pg_temp.as_user(NULL);
  RETURN _st;
END;
$$;

DO $$
DECLARE
  _pat   uuid := 'c5000000-0000-4000-8000-00000000000a';
  _doc   uuid := 'c5000000-0000-4000-8000-00000000000b';
  _own   uuid := 'c5000000-0000-4000-8000-00000000000c';  -- hospital owner, seated
  _adm   uuid := 'c5000000-0000-4000-8000-00000000000d';  -- hospital admin, ops only
  _old   uuid := 'c5000000-0000-4000-8000-00000000000e';  -- admin who held access before the column
  _nurse uuid := 'c5000000-0000-4000-8000-00000000000f';
  _own2  uuid := 'c5000000-0000-4000-8000-000000000010';  -- non-hospital owner
  _adm2  uuid := 'c5000000-0000-4000-8000-000000000011';  -- non-hospital admin
  _doc2  uuid := 'c5000000-0000-4000-8000-000000000012';
  _pat2  uuid := 'c5000000-0000-4000-8000-000000000013';
  _xadm  uuid := 'c5000000-0000-4000-8000-000000000014';  -- admin of another hospital
  _h     uuid := 'c5000000-0000-4000-8000-0000000000c1';
  _n     uuid := 'c5000000-0000-4000-8000-0000000000c2';
  _x     uuid := 'c5000000-0000-4000-8000-0000000000c3';
  _n_rows integer; _st text; _seat boolean; _lim integer;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_pat, 'hcs-pat@test.local', now()),   (_doc, 'hcs-doc@test.local', now()),
    (_own, 'hcs-own@test.local', now()),   (_adm, 'hcs-adm@test.local', now()),
    (_old, 'hcs-old@test.local', now()),   (_nurse, 'hcs-nurse@test.local', now()),
    (_own2, 'hcs-own2@test.local', now()), (_adm2, 'hcs-adm2@test.local', now()),
    (_doc2, 'hcs-doc2@test.local', now()), (_pat2, 'hcs-pat2@test.local', now()),
    (_xadm, 'hcs-xadm@test.local', now());

  -- ======================================================================
  -- Fixture. A hospital with five seats, and a non-hospital practice.
  -- ======================================================================
  INSERT INTO public.practices (id, name, created_by, tenant_type, member_limit)
  VALUES (_h, 'Seat General Hospital', _own, 'hospital', 5);
  INSERT INTO public.practices (id, name, created_by, tenant_type, member_limit)
  VALUES (_n, 'Seat Family Practice', _own2, 'practice', 5);
  INSERT INTO public.practices (id, name, created_by, tenant_type, member_limit)
  VALUES (_x, 'Elsewhere Hospital', _xadm, 'hospital', 5);

  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (_h, _own, 'owner', 'active')
  ON CONFLICT (practice_id, user_id) DO UPDATE SET role = 'owner', status = 'active';
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (_h, _adm, 'admin', 'active'),
    (_h, _old, 'admin', 'active'),
    (_h, _doc, 'provider', 'active'),
    (_h, _nurse, 'nurse', 'active');
  -- The admin who held access the day the column arrived is backfilled true.
  UPDATE public.practice_members SET clinical_seat = true
   WHERE practice_id = _h AND user_id = _old;

  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (_n, _own2, 'owner', 'active')
  ON CONFLICT (practice_id, user_id) DO UPDATE SET role = 'owner', status = 'active';
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (_n, _adm2, 'admin', 'active'),
    (_n, _doc2, 'provider', 'active');

  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (_x, _xadm, 'owner', 'active')
  ON CONFLICT (practice_id, user_id) DO UPDATE SET role = 'owner', status = 'active';

  INSERT INTO public.practice_shares (practice_id, user_id, is_active)
  VALUES (_h, _pat, true), (_n, _pat2, true);
  INSERT INTO public.practice_patient_assignments
    (practice_id, patient_user_id, clinician_user_id, assigned_by)
  VALUES (_h, _pat, _doc, _doc), (_n, _pat2, _doc2, _doc2);

  INSERT INTO public.encounters
    (patient_user_id, clinician_user_id, practice_id, visit_type, status, signed_at, assessment)
  VALUES (_pat, _doc, _h, 'annual', 'signed', now(), 'Hypertension, started amlodipine'),
         (_pat2, _doc2, _n, 'annual', 'signed', now(), 'Asthma');
  INSERT INTO public.internal_notes (patient_user_id, author_user_id, body, visibility)
  VALUES (_pat, _doc, 'Lives alone, daughter checks in', 'team'),
         (_pat2, _doc2, 'Prefers mornings', 'team');
  INSERT INTO public.fhir_care_plans (patient_user_id, title, status, created_by)
  VALUES (_pat, 'Blood pressure plan', 'active', _doc),
         (_pat2, 'Asthma plan', 'active', _doc2);
  INSERT INTO public.vitals (user_id, type, value, unit, recorded_at)
  VALUES (_pat, 'blood_pressure', 150, 'mmHg', now()),
         (_pat2, 'blood_pressure', 118, 'mmHg', now());

  SELECT clinical_seat INTO _seat FROM public.practice_members WHERE practice_id = _h AND user_id = _own;
  PERFORM pg_temp.assert(_seat IS TRUE, 'fixture: the owner who created the hospital holds a clinical seat');
  SELECT clinical_seat INTO _seat FROM public.practice_members WHERE practice_id = _h AND user_id = _adm;
  PERFORM pg_temp.assert(_seat IS FALSE, 'fixture: an admin added afterwards starts without one');

  -- ======================================================================
  -- 1. A hospital admin with no seat cannot read the chart
  -- ======================================================================
  PERFORM pg_temp.assert(pg_temp.seen(_adm, format('SELECT 1 FROM public.encounters WHERE patient_user_id = %L', _pat)) = 0,
    'an unseated hospital admin reads no encounters');
  PERFORM pg_temp.assert(pg_temp.seen(_adm, format('SELECT 1 FROM public.internal_notes WHERE patient_user_id = %L', _pat)) = 0,
    'nor the team notes');
  PERFORM pg_temp.assert(pg_temp.seen(_adm, format('SELECT 1 FROM public.fhir_care_plans WHERE patient_user_id = %L', _pat)) = 0,
    'nor the care plans');
  PERFORM pg_temp.assert(pg_temp.seen(_adm, format('SELECT 1 FROM public.vitals WHERE user_id = %L', _pat)) = 0,
    'nor the readings');

  _st := pg_temp.enc_insert(_adm, _pat, _h);
  PERFORM pg_temp.assert(_st = '42501', 'nor write an encounter (' || _st || ')');
  _st := pg_temp.plan_insert(_adm, _pat);
  PERFORM pg_temp.assert(_st = '42501', 'nor a care plan (' || _st || ')');

  PERFORM pg_temp.assert(public.has_practice_capability(_adm, 'view_phi', _h) IS NOT TRUE,
    'the capability check agrees: no view_phi without a seat');
  PERFORM pg_temp.assert(public.has_practice_capability(_adm, 'edit_clinical', _h) IS NOT TRUE,
    'and no edit_clinical');
  -- The same person is still an administrator: roster management works.
  PERFORM pg_temp.as_user(_adm);
  PERFORM pg_temp.assert(public.can_manage_practice(_h), 'but they still manage the practice, which is their job');
  PERFORM pg_temp.as_user(NULL);

  -- ======================================================================
  -- 2. The same admin reads and writes once given a seat
  -- ======================================================================
  PERFORM pg_temp.assert(pg_temp.set_seat(_own, _h, _adm, true) = 'ok', 'an owner gives the admin a clinical seat');
  PERFORM pg_temp.assert(pg_temp.seen(_adm, format('SELECT 1 FROM public.encounters WHERE patient_user_id = %L', _pat)) = 1,
    'a seated admin reads encounters');
  PERFORM pg_temp.assert(pg_temp.seen(_adm, format('SELECT 1 FROM public.internal_notes WHERE patient_user_id = %L', _pat)) = 1,
    'the team notes');
  PERFORM pg_temp.assert(pg_temp.seen(_adm, format('SELECT 1 FROM public.fhir_care_plans WHERE patient_user_id = %L', _pat)) = 1,
    'the care plans');
  PERFORM pg_temp.assert(pg_temp.seen(_adm, format('SELECT 1 FROM public.vitals WHERE user_id = %L', _pat)) = 1,
    'and the readings');
  PERFORM pg_temp.assert(public.has_practice_capability(_adm, 'view_phi', _h) IS TRUE,
    'the capability check agrees: view_phi with a seat');
  _st := pg_temp.enc_insert(_adm, _pat, _h);
  PERFORM pg_temp.assert(_st = 'ok', 'a seated admin writes an encounter (' || _st || ')');
  _st := pg_temp.plan_insert(_adm, _pat);
  PERFORM pg_temp.assert(_st = 'ok', 'and a care plan (' || _st || ')');

  -- ======================================================================
  -- 3. Turning the seat off removes access immediately
  -- ======================================================================
  PERFORM pg_temp.assert(pg_temp.set_seat(_own, _h, _adm, false) = 'ok', 'an owner takes the seat away');
  PERFORM pg_temp.assert(pg_temp.seen(_adm, format('SELECT 1 FROM public.encounters WHERE patient_user_id = %L', _pat)) = 0,
    'the admin reads no encounters straight away, with no refresh');
  PERFORM pg_temp.assert(pg_temp.seen(_adm, format('SELECT 1 FROM public.vitals WHERE user_id = %L', _pat)) = 0,
    'nor the readings');
  PERFORM pg_temp.assert(public.has_practice_capability(_adm, 'view_phi', _h) IS NOT TRUE,
    'and the capability goes with it');
  _st := pg_temp.plan_insert(_adm, _pat);
  PERFORM pg_temp.assert(_st = '42501', 'nor write (' || _st || ')');

  -- The grant and the withdrawal are on the audit trail.
  SELECT count(*) INTO _n_rows FROM public.practice_membership_events
   WHERE practice_id = _h AND user_id = _adm AND event_type = 'clinical_seat_changed';
  PERFORM pg_temp.assert(_n_rows = 2, 'both changes are in the membership ledger (' || _n_rows || ')');

  -- ======================================================================
  -- 4. Backfilled owners and admins keep access; other roles are unchanged
  -- ======================================================================
  PERFORM pg_temp.assert(pg_temp.seen(_old, format('SELECT 1 FROM public.encounters WHERE assessment IS NOT NULL AND patient_user_id = %L', _pat)) = 1,
    'an admin who held access before the column keeps it');
  PERFORM pg_temp.assert(pg_temp.seen(_own, format('SELECT 1 FROM public.encounters WHERE assessment IS NOT NULL AND patient_user_id = %L', _pat)) = 1,
    'so does the seated owner');
  PERFORM pg_temp.assert(pg_temp.seen(_doc, format('SELECT 1 FROM public.encounters WHERE assessment IS NOT NULL AND patient_user_id = %L', _pat)) = 1,
    'the provider reads as before');
  PERFORM pg_temp.assert(pg_temp.seen(_nurse, format('SELECT 1 FROM public.vitals WHERE user_id = %L', _pat)) = 1,
    'the nurse reads as before');

  -- ======================================================================
  -- 5. Non-hospital owners and admins are untouched, whatever the flag says
  -- ======================================================================
  SELECT clinical_seat INTO _seat FROM public.practice_members WHERE practice_id = _n AND user_id = _adm2;
  PERFORM pg_temp.assert(_seat IS FALSE, 'fixture: the non-hospital admin has the flag false');
  PERFORM pg_temp.assert(pg_temp.seen(_adm2, format('SELECT 1 FROM public.encounters WHERE assessment IS NOT NULL AND patient_user_id = %L', _pat2)) = 1,
    'a non-hospital admin with the flag false still reads encounters');
  PERFORM pg_temp.assert(pg_temp.seen(_adm2, format('SELECT 1 FROM public.internal_notes WHERE patient_user_id = %L', _pat2)) = 1,
    'the team notes');
  PERFORM pg_temp.assert(pg_temp.seen(_adm2, format('SELECT 1 FROM public.fhir_care_plans WHERE patient_user_id = %L', _pat2)) = 1,
    'the care plans');
  PERFORM pg_temp.assert(pg_temp.seen(_own2, format('SELECT 1 FROM public.vitals WHERE user_id = %L', _pat2)) = 1,
    'and a non-hospital owner reads the readings');
  PERFORM pg_temp.assert(public.has_practice_capability(_adm2, 'view_phi', _n) IS TRUE,
    'the capability check gives view_phi to a non-hospital admin');
  _st := pg_temp.plan_insert(_adm2, _pat2);
  PERFORM pg_temp.assert(_st = 'ok', 'and the admin writes a care plan (' || _st || ')');

  -- Flipping the flag on a non-hospital row does not change what they can do.
  UPDATE public.practice_members SET clinical_seat = true WHERE practice_id = _n AND user_id = _adm2;
  PERFORM pg_temp.assert(pg_temp.seen(_adm2, format('SELECT 1 FROM public.encounters WHERE assessment IS NOT NULL AND patient_user_id = %L', _pat2)) = 1,
    'flag true: still reads');
  UPDATE public.practice_members SET clinical_seat = false WHERE practice_id = _n AND user_id = _adm2;
  PERFORM pg_temp.assert(pg_temp.seen(_adm2, format('SELECT 1 FROM public.encounters WHERE assessment IS NOT NULL AND patient_user_id = %L', _pat2)) = 1,
    'flag false: still reads');

  -- ======================================================================
  -- 6. Only the RPC changes the flag
  -- ======================================================================
  PERFORM pg_temp.as_user(_own);
  _st := pg_temp.state_of(format(
    'UPDATE public.practice_members SET clinical_seat = true WHERE practice_id = %L AND user_id = %L', _h, _adm));
  PERFORM pg_temp.assert(_st = '42501', 'a direct UPDATE of the flag is refused, even for an owner (' || _st || ')');
  PERFORM pg_temp.as_user(_adm);
  _st := pg_temp.state_of(format(
    'UPDATE public.practice_members SET clinical_seat = true WHERE practice_id = %L AND user_id = %L', _h, _adm));
  PERFORM pg_temp.assert(_st <> 'ok', 'and an admin cannot seat themselves directly (' || _st || ')');
  PERFORM pg_temp.as_user(_doc);
  _st := pg_temp.state_of(format(
    'UPDATE public.practice_members SET clinical_seat = true WHERE practice_id = %L AND user_id = %L', _h, _doc));
  PERFORM pg_temp.assert(_st <> 'ok' OR NOT EXISTS (
      SELECT 1 FROM public.practice_members WHERE practice_id = _h AND user_id = _doc AND clinical_seat),
    'a provider cannot write the flag either (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);
  SELECT clinical_seat INTO _seat FROM public.practice_members WHERE practice_id = _h AND user_id = _adm;
  PERFORM pg_temp.assert(_seat IS FALSE, 'the flag is unchanged after those attempts');
  SELECT clinical_seat INTO _seat FROM public.practice_members WHERE practice_id = _h AND user_id = _doc;
  PERFORM pg_temp.assert(_seat IS FALSE, 'including the provider row');

  -- Who may call the RPC.
  PERFORM pg_temp.assert(pg_temp.set_seat(_doc, _h, _adm, true) = '42501', 'a provider cannot give a seat');
  PERFORM pg_temp.assert(pg_temp.set_seat(_nurse, _h, _adm, true) = '42501', 'nor can a nurse');
  PERFORM pg_temp.assert(pg_temp.set_seat(_xadm, _h, _adm, true) = '42501', 'an admin of another hospital is refused');
  PERFORM pg_temp.assert(pg_temp.set_seat(_pat, _h, _adm, true) = '42501', 'a patient is refused');
  SELECT clinical_seat INTO _seat FROM public.practice_members WHERE practice_id = _h AND user_id = _adm;
  PERFORM pg_temp.assert(_seat IS FALSE, 'none of those refusals changed the flag');

  PERFORM pg_temp.as_anon();
  _st := pg_temp.state_of(format('SELECT public.set_member_clinical_seat(%L, %L, true)', _h, _adm));
  PERFORM pg_temp.assert(_st <> 'ok', 'anon cannot call it (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(NOT has_function_privilege('anon', 'public.set_member_clinical_seat(uuid, uuid, boolean)', 'EXECUTE'),
    'anon has no EXECUTE on it');
  PERFORM pg_temp.assert(has_function_privilege('authenticated', 'public.set_member_clinical_seat(uuid, uuid, boolean)', 'EXECUTE'),
    'authenticated does');

  -- The seat does not apply outside a hospital, nor to a role that is clinical already.
  PERFORM pg_temp.assert(pg_temp.set_seat(_own2, _n, _adm2, true) = 'OC004',
    'a non-hospital admin has no seat to take (clinical_seat_not_applicable)');
  PERFORM pg_temp.assert(pg_temp.set_seat(_own2, _n, _own2, false) = 'OC004', 'nor a non-hospital owner');
  PERFORM pg_temp.assert(pg_temp.set_seat(_own, _h, _doc, true) = 'OC004', 'a hospital provider is clinical by role: not applicable');
  PERFORM pg_temp.assert(pg_temp.set_seat(_own, _h, _nurse, false) = 'OC004', 'nor a nurse');
  PERFORM pg_temp.assert(pg_temp.set_seat(_own, _h, _pat, true) = 'P0002', 'nor a person who is not a member');

  -- An admin manages the practice, so may seat themselves.
  PERFORM pg_temp.assert(pg_temp.set_seat(_adm, _h, _adm, true) = 'ok', 'an admin can take a seat for themselves');
  PERFORM pg_temp.assert(pg_temp.set_seat(_adm, _h, _adm, false) = 'ok', 'and give it up');

  -- ======================================================================
  -- 7. The seat cap
  --
  -- Clinician seats are the active clinical members (a seated owner or admin
  -- counts, an ops-only one does not) plus pending clinician invitations,
  -- measured against the tenant's seat limit. Taking a seat when the practice
  -- is at its limit is refused; giving one up is always allowed.
  -- ======================================================================
  SELECT count(*) INTO _n_rows FROM public.practice_members
   WHERE practice_id = _h AND status = 'active'
     AND public.practice_member_is_clinical(practice_id, role, clinical_seat);
  PERFORM pg_temp.assert(_n_rows = 4, 'fixture: owner, backfilled admin, provider and nurse hold clinical seats (' || _n_rows || ')');
  -- The tenant's limit is lowered to what is in use.
  PERFORM pg_temp.as_service();
  UPDATE public.practices SET member_limit = 4 WHERE id = _h;
  PERFORM pg_temp.as_user(NULL);
  SELECT pl.seat_limit INTO _lim FROM public._practice_limits(_h) pl;
  PERFORM pg_temp.assert(_lim = 4, 'fixture: the hospital seat limit is four (' || _lim || ')');

  PERFORM pg_temp.assert(pg_temp.set_seat(_own, _h, _adm, true) = 'OC002',
    'taking the fifth clinical seat on a four-seat hospital is refused with seat_limit_reached');
  SELECT clinical_seat INTO _seat FROM public.practice_members WHERE practice_id = _h AND user_id = _adm;
  PERFORM pg_temp.assert(_seat IS FALSE, 'and the admin stays without it');
  PERFORM pg_temp.assert(pg_temp.seen(_adm, format('SELECT 1 FROM public.encounters WHERE assessment IS NOT NULL AND patient_user_id = %L', _pat)) = 0,
    'so they still read nothing');

  -- Giving one up always works, and frees the seat for someone else.
  PERFORM pg_temp.assert(pg_temp.set_seat(_old, _h, _old, false) = 'ok', 'the backfilled admin can give up their seat at the cap');
  PERFORM pg_temp.assert(pg_temp.set_seat(_own, _h, _adm, true) = 'ok', 'which frees it for the other admin');
  PERFORM pg_temp.assert(pg_temp.seen(_adm, format('SELECT 1 FROM public.encounters WHERE assessment IS NOT NULL AND patient_user_id = %L', _pat)) = 1,
    'who now reads');
  PERFORM pg_temp.assert(pg_temp.seen(_old, format('SELECT 1 FROM public.encounters WHERE assessment IS NOT NULL AND patient_user_id = %L', _pat)) = 0,
    'and the one who gave up reads nothing');
  PERFORM pg_temp.assert(pg_temp.set_seat(_own, _h, _adm, true) = 'ok', 'asking for a seat already held is a no-op, even at the cap');

  -- ======================================================================
  -- 8. The patient's side is unaffected
  -- ======================================================================
  PERFORM pg_temp.assert(pg_temp.seen(_pat, format('SELECT 1 FROM public.vitals WHERE user_id = %L', _pat)) = 1,
    'the patient reads their own readings, whoever holds a seat');
  PERFORM pg_temp.assert(pg_temp.seen(_pat, format('SELECT 1 FROM public.fhir_care_plans WHERE patient_user_id = %L', _pat)) >= 1,
    'and their active care plans');
  PERFORM pg_temp.assert(pg_temp.seen(_pat2, format('SELECT 1 FROM public.vitals WHERE user_id = %L', _pat)) = 0,
    'another patient reads none of it');
  PERFORM pg_temp.assert(pg_temp.seen(_xadm, format('SELECT 1 FROM public.encounters WHERE assessment IS NOT NULL AND patient_user_id = %L', _pat)) = 0,
    'the admin of another hospital reads nothing of this patient');

  -- Ending the share cuts off even a seated admin: the patient holds the power.
  PERFORM pg_temp.as_service();
  UPDATE public.practice_shares SET is_active = false WHERE practice_id = _h AND user_id = _pat;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(pg_temp.seen(_adm, format('SELECT 1 FROM public.vitals WHERE user_id = %L', _pat)) = 0,
    'a seat is not a way round the patient: with the share ended a seated admin reads no readings');
END;
$$;

ROLLBACK;
