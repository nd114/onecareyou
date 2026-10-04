-- Paid non-clinical staff seats.
--
-- A Practice or Clinic tenant ("staff_paid") includes no non-clinical staff: each
-- front_desk, billing, read_only or staff member needs a purchased seat
-- (practices.staff_seats_purchased), and a NEW one beyond what is bought is
-- refused with staff_seat_limit_reached (OC003). Clinicians are counted
-- separately against the clinician cap (OC002), a hospital has no staff cap, a
-- hospital owner/admin without a clinical seat holds neither kind of seat, and
-- Individual still has no room for staff. The paid-seat counter is pinned.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/staff_seat_cap.test.sql

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

CREATE OR REPLACE FUNCTION pg_temp.msg_of(_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ': ' || SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.invite(_prac uuid, _email text, _role text, _by uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT pg_temp.state_of(format(
    'INSERT INTO public.practice_invitations (practice_id, email, role, invited_by) VALUES (%L, %L, %L, %L)',
    _prac, _email, _role, _by))
$$;

DO $$
DECLARE
  _own   uuid := 'b4000000-0000-4000-8000-000000000001';
  _doc1  uuid := 'b4000000-0000-4000-8000-000000000002';
  _doc2  uuid := 'b4000000-0000-4000-8000-000000000003';
  _fd1   uuid := 'b4000000-0000-4000-8000-000000000004';
  _bill  uuid := 'b4000000-0000-4000-8000-000000000005';
  _ro    uuid := 'b4000000-0000-4000-8000-000000000006';
  _doc3  uuid := 'b4000000-0000-4000-8000-000000000007';
  _adm   uuid := 'b4000000-0000-4000-8000-000000000008';
  _hown  uuid := 'b4000000-0000-4000-8000-000000000009';
  _hadm  uuid := 'b4000000-0000-4000-8000-00000000000a';
  _hdoc  uuid := 'b4000000-0000-4000-8000-00000000000b';
  _sown  uuid := 'b4000000-0000-4000-8000-00000000000c';
  _cown  uuid := 'b4000000-0000-4000-8000-00000000000d';
  _oown  uuid := 'b4000000-0000-4000-8000-00000000000e';
  _ofd   uuid := 'b4000000-0000-4000-8000-00000000000f';
  _bfd1  uuid := 'b4000000-0000-4000-8000-000000000010';
  _bfd2  uuid := 'b4000000-0000-4000-8000-000000000011';
  _bdoc  uuid := 'b4000000-0000-4000-8000-000000000012';
  _prac  uuid := 'b4000000-0000-4000-8000-0000000000c1';
  _hosp  uuid := 'b4000000-0000-4000-8000-0000000000c2';
  _solo  uuid := 'b4000000-0000-4000-8000-0000000000c3';
  _other uuid := 'b4000000-0000-4000-8000-0000000000c4';
  _back  uuid := 'b4000000-0000-4000-8000-0000000000c5';
  _inv uuid; _inv2 uuid;
  _n int; _st text; _v int; _m text; _sn int; _cn int;
  e record;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at)
  SELECT u, 'ssc-' || right(u::text, 4) || '@test.local', now()
    FROM unnest(ARRAY[_own, _doc1, _doc2, _fd1, _bill, _ro, _doc3, _adm, _hown, _hadm, _hdoc,
                      _sown, _cown, _oown, _ofd, _bfd1, _bfd2, _bdoc]) AS u;
  INSERT INTO public.user_roles (user_id, role) VALUES (_adm, 'admin');
  INSERT INTO public.clinician_profiles (user_id, first_name, subscription_tier, patient_limit) VALUES
    (_own, 'Own', 'pro', 1000), (_sown, 'Solo', 'solo', 150), (_cown, 'Comm', 'community', 25);

  -- A Practice tenant: three clinician seats, no staff bought (new tenants start at 0).
  INSERT INTO public.practices (id, name, created_by, tenant_type, subscription_tier, member_limit)
  VALUES (_prac, 'Staff Practice', _own, 'practice', 'pro', 3);
  SELECT staff_seats_purchased INTO _v FROM public.practices WHERE id = _prac;
  PERFORM pg_temp.assert(_v = 0, 'a new tenant starts with no purchased staff seats');
  SELECT public._practice_staff_model(_prac) INTO _m;
  PERFORM pg_temp.assert(_m = 'staff_paid', 'a Practice-plan tenant seats staff by purchase (' || _m || ')');

  -- ======================================================================
  -- 1. Refused at the limit, by name; allowed under it
  -- ======================================================================
  PERFORM pg_temp.as_user(_own);
  _st := pg_temp.invite(_prac, 'ssc-fd1@test.local', 'front_desk', _own);
  PERFORM pg_temp.assert(_st = 'OC003', 'with no staff bought, inviting front desk is refused with staff_seat_limit_reached (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.practice_invitations WHERE practice_id = _prac;
  PERFORM pg_temp.assert(_n = 0, 'and no invitation was created');

  PERFORM pg_temp.as_service();
  UPDATE public.practices SET staff_seats_purchased = 2 WHERE id = _prac;
  PERFORM pg_temp.as_user(_own);
  _st := pg_temp.invite(_prac, 'ssc-' || right(_fd1::text, 4) || '@test.local', 'front_desk', _own);
  PERFORM pg_temp.assert(_st = 'ok', 'with two bought, the first staff invitation is allowed (' || _st || ')');
  _st := pg_temp.invite(_prac, 'ssc-' || right(_bill::text, 4) || '@test.local', 'billing', _own);
  PERFORM pg_temp.assert(_st = 'ok', 'the second is allowed (' || _st || ')');
  _st := pg_temp.invite(_prac, 'ssc-' || right(_ro::text, 4) || '@test.local', 'read_only', _own);
  PERFORM pg_temp.assert(_st = 'OC003', 'pending staff invitations hold their seats, so the third is refused (' || _st || ')');
  _st := pg_temp.invite(_prac, 'ssc-x@test.local', 'staff', _own);
  PERFORM pg_temp.assert(_st = 'OC003', 'the generic staff role is a staff seat too (' || _st || ')');

  -- The invitee accepts into the seat held for them.
  PERFORM pg_temp.as_user(NULL);
  SELECT i.id INTO _inv FROM public.practice_invitations i
   WHERE i.practice_id = _prac AND i.role = 'front_desk';
  PERFORM pg_temp.as_user(_fd1);
  _st := pg_temp.state_of(format('SELECT public.accept_practice_invitation(%L)', _inv));
  PERFORM pg_temp.assert(_st = 'ok', 'accepting the held staff invitation is not refused (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(public._practice_seats_of_kind(_prac, 'staff', true) = 2,
    'one active and one pending staff member use both bought seats');

  -- ======================================================================
  -- 2. A clinical member is not counted as staff (and staff are not clinicians)
  -- ======================================================================
  PERFORM pg_temp.as_user(_own);
  _st := pg_temp.invite(_prac, 'ssc-' || right(_doc1::text, 4) || '@test.local', 'provider', _own);
  PERFORM pg_temp.assert(_st = 'ok', 'a clinician can be invited while every staff seat is taken (' || _st || ')');
  _st := pg_temp.invite(_prac, 'ssc-' || right(_doc2::text, 4) || '@test.local', 'nurse', _own);
  PERFORM pg_temp.assert(_st = 'ok', 'a second clinician (owner, provider, nurse = three) is allowed (' || _st || ')');
  _st := pg_temp.invite(_prac, 'ssc-' || right(_doc3::text, 4) || '@test.local', 'clinician', _own);
  PERFORM pg_temp.assert(_st = 'OC002', 'a fourth clinician is refused by the CLINICIAN cap, not the staff one (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(public._practice_seats_of_kind(_prac, 'staff', true) = 2
                         AND public._practice_seats_of_kind(_prac, 'clinical', true) = 3,
    'staff 2 and clinical 3: neither kind spills into the other');

  -- ======================================================================
  -- 3. Role changes into a kind the member did not hold take a seat of that kind
  -- ======================================================================
  PERFORM pg_temp.as_user(_own);
  _st := pg_temp.state_of(format(
    'SELECT public.change_practice_member_access(%L, %L, ''provider'')', _prac, _fd1));
  PERFORM pg_temp.assert(_st = 'OC002', 'promoting front desk into a full clinician cap is refused (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);
  SELECT role::text INTO _m FROM public.practice_members WHERE practice_id = _prac AND user_id = _fd1;
  PERFORM pg_temp.assert(_m = 'front_desk', 'and the member keeps their role');

  -- A provider joins (trusted), then is moved to billing while staff are full.
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES (_prac, _doc1, 'provider', 'active');
  UPDATE public.practice_invitations SET status = 'accepted' WHERE practice_id = _prac AND role = 'provider';
  PERFORM pg_temp.as_user(_own);
  _st := pg_temp.state_of(format(
    'SELECT public.change_practice_member_access(%L, %L, ''billing'')', _prac, _doc1));
  PERFORM pg_temp.assert(_st = 'OC003', 'moving a clinician into staff when every staff seat is taken is refused (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);
  SELECT role::text INTO _m FROM public.practice_members WHERE practice_id = _prac AND user_id = _doc1;
  PERFORM pg_temp.assert(_m = 'provider', 'and they stay a provider');

  -- Same kind, not a new seat: provider to nurse at the full clinician cap.
  PERFORM pg_temp.as_user(_own);
  _st := pg_temp.state_of(format(
    'SELECT public.change_practice_member_access(%L, %L, ''nurse'')', _prac, _doc1));
  PERFORM pg_temp.assert(_st = 'ok', 'a change within the same kind takes no new seat (' || _st || ')');

  -- ======================================================================
  -- 4. Freed seats, re-adding, the trusted platform
  -- ======================================================================
  PERFORM public.end_practice_membership(_prac, _fd1, 'staff seat test');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(public._practice_seats_of_kind(_prac, 'staff', true) = 1,
    'ending a staff membership frees its seat');
  DELETE FROM public.practice_invitations WHERE id = _inv;
  INSERT INTO public.practice_invitations (practice_id, email, role, invited_by)
  VALUES (_prac, 'ssc-' || right(_fd1::text, 4) || '@test.local', 'front_desk', _own)
  RETURNING id INTO _inv2;
  PERFORM pg_temp.assert(true, 'the platform re-invites without being refused');
  -- Fill both bought seats with active staff so a returning member is a NEW seat.
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (_prac, _ro, 'read_only', 'active'), (_prac, _bill, 'billing', 'active');
  UPDATE public.practice_invitations SET status = 'accepted'
   WHERE practice_id = _prac AND role = 'billing';
  PERFORM pg_temp.as_user(_fd1);
  _st := pg_temp.state_of(format('SELECT public.accept_practice_invitation(%L)', _inv2));
  PERFORM pg_temp.assert(_st = 'OC003', 'a staff member who left cannot retake a seat in a full tenant (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);
  SELECT status INTO _m FROM public.practice_members WHERE practice_id = _prac AND user_id = _fd1;
  PERFORM pg_temp.assert(_m IS DISTINCT FROM 'active', 'and stays out');

  PERFORM pg_temp.as_service();
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES (_prac, _doc3, 'staff', 'active');
  PERFORM pg_temp.assert(true, 'service_role is not refused over the staff cap');
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES (_prac, _adm, 'admin', 'active');
  PERFORM pg_temp.as_user(_adm);
  _st := pg_temp.invite(_prac, 'ssc-adm-invitee@test.local', 'billing', _adm);
  PERFORM pg_temp.assert(_st = 'ok', 'a platform admin is not refused (' || _st || ')');
  PERFORM pg_temp.as_user(_own);
  _st := pg_temp.invite(_prac, 'ssc-again@test.local', 'billing', _own);
  PERFORM pg_temp.assert(_st = 'OC003', 'and an over-cap tenant is refused any further staff (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.practice_members WHERE practice_id = _prac AND status = 'active'
     AND role IN ('front_desk', 'billing', 'read_only', 'staff');
  PERFORM pg_temp.assert(_n >= 1, 'existing staff stay in place (grandfathered)');

  -- ======================================================================
  -- 5. Hospital: staff unlimited; an unseated owner/admin holds no seat at all
  -- ======================================================================
  INSERT INTO public.practices (id, name, created_by, tenant_type, member_limit)
  VALUES (_hosp, 'Staff General', _hown, 'hospital', 2);
  -- _hown is the creator, so is seated. An admin added with no seat is ops-only.
  INSERT INTO public.practice_members (practice_id, user_id, role, status, clinical_seat)
  VALUES (_hosp, _hadm, 'admin', 'active', false);
  INSERT INTO public.practice_members (practice_id, user_id, role, status)
  VALUES (_hosp, _hdoc, 'provider', 'active');
  PERFORM pg_temp.assert(public._practice_staff_model(_hosp) = 'unlimited', 'a hospital seats staff without limit');
  PERFORM pg_temp.assert(public._practice_seats_of_kind(_hosp, 'ops', false) = 1
                         AND public._practice_seats_of_kind(_hosp, 'staff', false) = 0
                         AND public._practice_seats_of_kind(_hosp, 'clinical', false) = 2,
    'the unseated admin is ops-only: not staff and not clinical');
  PERFORM pg_temp.as_user(_hown);
  _st := pg_temp.invite(_hosp, 'ssc-h1@test.local', 'front_desk', _hown);
  PERFORM pg_temp.assert(_st = 'ok', 'a hospital owner invites front desk with no staff seats bought (' || _st || ')');
  _st := pg_temp.invite(_hosp, 'ssc-h2@test.local', 'billing', _hown);
  PERFORM pg_temp.assert(_st = 'ok', 'and billing (' || _st || ')');
  _st := pg_temp.invite(_hosp, 'ssc-h3@test.local', 'read_only', _hown);
  PERFORM pg_temp.assert(_st = 'ok', 'and any number more (' || _st || ')');
  _st := pg_temp.invite(_hosp, 'ssc-h4@test.local', 'provider', _hown);
  PERFORM pg_temp.assert(_st = 'OC002', 'but the hospital clinician cap still holds (' || _st || ')');
  _st := pg_temp.invite(_hosp, 'ssc-h5@test.local', 'admin', _hown);
  PERFORM pg_temp.assert(_st = 'ok', 'an admin invited without a seat is ops-only and takes none (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(public._practice_seats_of_kind(_hosp, 'clinical', true) = 2,
    'the hospital clinician seats in use stay at the two seated clinicians');

  -- ======================================================================
  -- 6. Individual (and the shared tiers) still have no room for staff
  -- ======================================================================
  INSERT INTO public.practices (id, name, created_by, tenant_type, subscription_tier, member_limit)
  VALUES (_solo, 'Solo Practice', _sown, 'practice', 'solo', 1);
  PERFORM pg_temp.assert(public._practice_staff_model(_solo) = 'shared', 'Individual shares one cap between everyone');
  PERFORM pg_temp.as_user(_sown);
  _st := pg_temp.invite(_solo, 'ssc-solo-fd@test.local', 'front_desk', _sown);
  PERFORM pg_temp.assert(_st = 'OC002', 'Individual cannot add staff: the one seat is the clinician (' || _st || ')');
  _st := pg_temp.invite(_solo, 'ssc-solo-doc@test.local', 'provider', _sown);
  PERFORM pg_temp.assert(_st = 'OC002', 'nor a second clinician (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);

  -- ======================================================================
  -- 7. The backfill leaves existing members intact and starts from today's staff
  -- ======================================================================
  INSERT INTO public.practices (id, name, created_by, tenant_type, subscription_tier, member_limit)
  VALUES (_back, 'Backfill Practice', _bdoc, 'practice', 'pro', 1);
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (_back, _bfd1, 'front_desk', 'active'), (_back, _bfd2, 'billing', 'active');
  INSERT INTO public.practice_invitations (practice_id, email, role, invited_by)
  VALUES (_back, 'ssc-back-pending@test.local', 'read_only', _bdoc);
  SELECT staff_seats_purchased INTO _v FROM public.practices WHERE id = _back;
  PERFORM pg_temp.assert(_v = 0, 'fixture: a tenant with staff and nothing bought');
  -- The backfill statements of the migration, narrowed to this tenant.
  UPDATE public.practices p
     SET staff_seats_purchased = public._practice_seats_of_kind(p.id, 'staff', true)
   WHERE p.id = _back AND p.tenant_type = 'practice'
     AND p.staff_seats_purchased < public._practice_seats_of_kind(p.id, 'staff', true);
  UPDATE public.practices p
     SET member_limit = public._practice_seats_in_use(p.id)
   WHERE p.id = _back AND p.member_limit IS NOT NULL AND p.member_limit < 999999
     AND p.member_limit < public._practice_seats_in_use(p.id);
  SELECT staff_seats_purchased INTO _v FROM public.practices WHERE id = _back;
  PERFORM pg_temp.assert(_v = 3, 'purchased seats become the staff already there: 2 active + 1 pending (' || _v || ')');
  SELECT count(*) INTO _n FROM public.practice_members WHERE practice_id = _back AND status = 'active';
  PERFORM pg_temp.assert(_n = 3, 'every existing member is still active (3 with the owner)');
  SELECT member_limit INTO _v FROM public.practices WHERE id = _back;
  PERFORM pg_temp.assert(_v >= public._practice_seats_in_use(_back), 'the clinician limit is not below the clinicians already seated');
  PERFORM pg_temp.as_user(_bdoc);
  _st := pg_temp.invite(_back, 'ssc-back-new@test.local', 'front_desk', _bdoc);
  PERFORM pg_temp.assert(_st = 'OC003', 'after the backfill only NEW staff need a purchase (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);

  -- ======================================================================
  -- 8. staff_seats_purchased is pinned
  -- ======================================================================
  PERFORM pg_temp.as_user(_own);
  _st := pg_temp.state_of(format('UPDATE public.practices SET staff_seats_purchased = 99 WHERE id = %L', _prac));
  PERFORM pg_temp.assert(_st = '42501', 'an owner cannot raise their own staff seats by a direct UPDATE (' || _st || ')');
  _st := pg_temp.state_of(format('UPDATE public.practices SET staff_seats_purchased = 0 WHERE id = %L', _prac));
  PERFORM pg_temp.assert(_st = '42501', 'nor lower them (' || _st || ')');
  _st := pg_temp.state_of(format('UPDATE public.practices SET name = %L WHERE id = %L', 'Staff Practice Renamed', _prac));
  PERFORM pg_temp.assert(_st = 'ok', 'while ordinary settings remain editable (' || _st || ')');
  _m := pg_temp.msg_of(format(
    'INSERT INTO public.practices (name, created_by, staff_seats_purchased) VALUES (%L, %L, 50)', 'Grab', _own));
  PERFORM pg_temp.assert(_m LIKE '42501%set by billing%', 'nor start a new tenant with seats bought (' || _m || ')');
  PERFORM pg_temp.as_user(NULL);
  SELECT staff_seats_purchased INTO _v FROM public.practices WHERE id = _prac;
  PERFORM pg_temp.assert(_v = 2, 'the figure did not move (' || _v || ')');
  PERFORM pg_temp.as_service();
  UPDATE public.practices SET staff_seats_purchased = 3 WHERE id = _prac;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 1, 'service_role may set it');
  PERFORM pg_temp.as_user(_adm);
  UPDATE public.practices SET staff_seats_purchased = 2 WHERE id = _prac;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 1, 'and so may a platform admin');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(NOT has_function_privilege('authenticated', 'public._practice_seats_of_kind(uuid,text,boolean)', 'EXECUTE')
                         AND NOT has_function_privilege('anon', 'public._practice_staff_model(uuid)', 'EXECUTE'),
    'the counting helpers are not callable by clients');

  -- ======================================================================
  -- 9. entitlements_for reports the new figures
  -- ======================================================================
  PERFORM pg_temp.as_user(NULL);
  _sn := public._practice_seats_of_kind(_prac, 'staff', true);
  _cn := public._practice_seats_of_kind(_prac, 'clinical', true);
  PERFORM pg_temp.as_user(_own);
  SELECT * INTO e FROM public.entitlements_for();
  PERFORM pg_temp.assert(e.staff_seat_model = 'staff_paid' AND e.staff_seats_purchased = 2
                         AND e.clinician_seat_limit = 3 AND e.scribe_minutes_included = 900,
    'Practice: staff_paid, 2 bought, 3 clinician seats, 900 scribe minutes (' || e.staff_seat_model || '/' || e.staff_seats_purchased || '/' || coalesce(e.clinician_seat_limit::text, 'null') || '/' || coalesce(e.scribe_minutes_included::text, 'null') || ')');
  PERFORM pg_temp.assert(e.staff_in_use = _sn AND e.clinician_seat_count = _cn,
    'staff and clinician use are reported separately (' || e.staff_in_use || ' / ' || e.clinician_seat_count || ')');
  PERFORM pg_temp.assert(e.seat_count = e.clinician_seat_count, 'seat_count is clinicians only for a staff_paid tenant');
  PERFORM pg_temp.as_user(_sown);
  SELECT * INTO e FROM public.entitlements_for();
  PERFORM pg_temp.assert(e.tier = 'solo' AND NOT e.scribe_included AND e.scribe_minutes_included = 0,
    'Individual: no scribe, 0 minutes');
  PERFORM pg_temp.as_user(_cown);
  SELECT * INTO e FROM public.entitlements_for();
  PERFORM pg_temp.assert(e.tier = 'community' AND NOT e.scribe_included AND e.scribe_minutes_included = 0
                         AND e.staff_seats_purchased = 0 AND e.staff_in_use = 0 AND e.staff_seat_model = 'shared',
    'Community: no scribe, 0 minutes, no staff');
  PERFORM pg_temp.as_user(_hown);
  SELECT * INTO e FROM public.entitlements_for();
  PERFORM pg_temp.assert(e.staff_seat_model = 'unlimited' AND e.clinician_seat_limit = 2,
    'a hospital owner sees unlimited staff and its clinician cap');
  PERFORM pg_temp.assert(e.staff_in_use = 3, 'the pending hospital staff are counted as staff, the ops-only admin is not (' || e.staff_in_use || ')');

  -- Clinic and Enterprise rows carry the decided numbers.
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.tier_limits
   WHERE (tier = 'clinic' AND patient_limit = 3500 AND seat_limit = 10 AND seat_max = 30
          AND storage_mb = 102400 AND scribe_minutes_monthly = 3000 AND staff_seat_model = 'staff_paid')
      OR (tier = 'pro' AND patient_limit = 1000 AND seat_limit = 3 AND storage_mb = 30720
          AND scribe_minutes_monthly = 900 AND staff_seat_model = 'staff_paid')
      OR (tier = 'enterprise' AND patient_limit = 5000 AND seat_limit = 25 AND storage_mb = 1048576
          AND scribe_minutes_monthly = 15000 AND staff_seat_model = 'unlimited')
      OR (tier = 'solo' AND patient_limit = 150 AND seat_limit = 1 AND storage_mb = 10240
          AND NOT scribe_included AND staff_seat_model = 'shared')
      OR (tier = 'community' AND patient_limit = 25 AND storage_mb = 500 AND NOT scribe_included);
  PERFORM pg_temp.assert(_n = 5, 'the tier_limits seed holds the decided Community, Individual, Practice, Clinic and Enterprise figures (' || _n || ')');

  -- ======================================================================
  -- 10. RLS: staff cannot read another tenant's numbers
  -- ======================================================================
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.practices (id, name, created_by, tenant_type, subscription_tier, staff_seats_purchased)
  VALUES (_other, 'Other Tenant', _oown, 'practice', 'pro', 7);
  INSERT INTO public.practice_members (practice_id, user_id, role, status, can_view_all_patients)
  VALUES (_other, _ofd, 'front_desk', 'active', true);
  PERFORM pg_temp.as_user(_ofd);
  SELECT count(*) INTO _n FROM public.practices WHERE id = _prac;
  PERFORM pg_temp.assert(_n = 0, 'a front-desk member of one tenant cannot read another tenant''s practice row');
  SELECT count(*) INTO _n FROM public.practices WHERE id = _other;
  PERFORM pg_temp.assert(_n = 1, 'but reads their own tenant''s');
  _st := pg_temp.state_of(format('SELECT * FROM public.entitlements_for(%L)', _own));
  PERFORM pg_temp.assert(_st = '42501', 'nor another user''s entitlements (' || _st || ')');
  _st := pg_temp.state_of(format('SELECT public._practice_seats_of_kind(%L, ''staff'', true)', _prac));
  PERFORM pg_temp.assert(_st = '42501', 'nor call the counting helper directly (' || _st || ')');
  SELECT * INTO e FROM public.entitlements_for();
  PERFORM pg_temp.assert(e.practice_id = _other AND e.staff_seats_purchased = 7,
    'their own entitlements show only their own tenant (' || coalesce(e.practice_id::text, 'null') || ')');
  PERFORM pg_temp.state_of(format('UPDATE public.practices SET staff_seats_purchased = 50 WHERE id = %L', _other));
  PERFORM pg_temp.as_user(NULL);
  SELECT staff_seats_purchased INTO _v FROM public.practices WHERE id = _other;
  PERFORM pg_temp.assert(_v = 7, 'a staff member cannot change their tenant''s purchased seats (' || _v || ')');
END $$;

ROLLBACK;
