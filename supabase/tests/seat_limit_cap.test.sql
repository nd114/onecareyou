-- The seat cap (practices.member_limit) is enforced by the database, and only
-- for NEW seats: a new active member, a re-activated one, or an invitation that
-- would take a seat. Existing members, reads, updates and offboarding are
-- untouched, a member who leaves frees a seat, an over-cap tenant is
-- grandfathered, and the platform is trusted.

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

CREATE OR REPLACE FUNCTION pg_temp.invite(_prac uuid, _email text, _by uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT pg_temp.state_of(format(
    'INSERT INTO public.practice_invitations (practice_id, email, role, invited_by) VALUES (%L, %L, ''provider'', %L)',
    _prac, _email, _by))
$$;

DO $$
DECLARE
  _own  uuid := 'b2000000-0000-4000-8000-000000000001';
  _m1   uuid := 'b2000000-0000-4000-8000-000000000002';
  _m2   uuid := 'b2000000-0000-4000-8000-000000000003';
  _new  uuid := 'b2000000-0000-4000-8000-000000000004';
  _x1   uuid := 'b2000000-0000-4000-8000-000000000005';
  _x2   uuid := 'b2000000-0000-4000-8000-000000000006';
  _adm  uuid := 'b2000000-0000-4000-8000-000000000007';
  _prac uuid := 'b2000000-0000-4000-8000-0000000000c1';
  _prac2 uuid := 'b2000000-0000-4000-8000-0000000000c2';
  _inv  uuid;
  _n int; _st text; _lim int;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_own, 'slc-own@test.local', now()), (_m1, 'slc-m1@test.local', now()),
    (_m2, 'slc-m2@test.local', now()), (_new, 'slc-new@test.local', now()),
    (_x1, 'slc-x1@test.local', now()), (_x2, 'slc-x2@test.local', now()),
    (_adm, 'slc-adm@test.local', now());
  INSERT INTO public.user_roles (user_id, role) VALUES (_adm, 'admin');

  -- A tenant allowed three seats, all three taken.
  INSERT INTO public.practices (id, name, created_by, tenant_type, member_limit)
  VALUES (_prac, 'Seat General', _own, 'hospital', 3);
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (_prac, _own, 'owner', 'active')
  ON CONFLICT (practice_id, user_id) DO UPDATE SET role = 'owner', status = 'active';
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (_prac, _m1, 'provider', 'active'), (_prac, _m2, 'provider', 'active');
  SELECT count(*) INTO _n FROM public.practice_members WHERE practice_id = _prac AND status = 'active';
  PERFORM pg_temp.assert(_n = 3, 'fixture: three active members on a three-seat tenant');

  -- ======================================================================
  -- 1. A direct API call over the cap is refused, by name
  -- ======================================================================
  PERFORM pg_temp.as_user(_own);
  _st := pg_temp.invite(_prac, 'slc-new@test.local', _own);
  PERFORM pg_temp.assert(_st = 'OC002', 'an owner inviting a fourth person to a three-seat tenant is refused with seat_limit_reached (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.practice_invitations WHERE practice_id = _prac;
  PERFORM pg_temp.assert(_n = 0, 'and no invitation was created');

  -- ======================================================================
  -- 2. Reads and updates still work at the cap
  -- ======================================================================
  PERFORM pg_temp.as_user(_own);
  SELECT count(*) INTO _n FROM public.practice_members WHERE practice_id = _prac;
  PERFORM pg_temp.assert(_n = 3, 'members are still listed at the cap');
  UPDATE public.practice_members SET can_invite_patients = false WHERE practice_id = _prac AND user_id = _m1;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 1, 'member settings can still be edited at the cap');

  -- ======================================================================
  -- 3. Ending a membership frees a seat; a pending invitation holds one
  -- ======================================================================
  PERFORM public.end_practice_membership(_prac, _m2, 'seat test');
  _st := pg_temp.invite(_prac, 'slc-new@test.local', _own);
  PERFORM pg_temp.assert(_st = 'ok', 'a seat freed by ending a membership can be offered (' || _st || ')');
  _st := pg_temp.invite(_prac, 'slc-x1@test.local', _own);
  PERFORM pg_temp.assert(_st = 'OC002', 'a pending invitation holds its seat, so the next offer is refused (' || _st || ')');

  -- The invited person can accept into the seat that was held for them.
  PERFORM pg_temp.as_user(_new);
  SELECT i.id INTO _inv FROM public.practice_invitations i WHERE i.practice_id = _prac AND i.email = 'slc-new@test.local';
  _st := pg_temp.state_of(format('SELECT public.accept_practice_invitation(%L)', _inv));
  PERFORM pg_temp.assert(_st = 'ok', 'accepting the held invitation is not refused (' || _st || ')');

  -- ======================================================================
  -- 4. Re-adding someone who left is a new seat
  -- ======================================================================
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.practice_invitations (practice_id, email, role, invited_by)
  VALUES (_prac, 'slc-m2@test.local', 'provider', _own)
  RETURNING id INTO _inv;
  PERFORM pg_temp.as_user(_m2);
  _st := pg_temp.state_of(format('SELECT public.accept_practice_invitation(%L)', _inv));
  PERFORM pg_temp.assert(_st = 'OC002', 'a person who left cannot take a seat in a full tenant (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);
  SELECT status INTO _st FROM public.practice_members WHERE practice_id = _prac AND user_id = _m2;
  PERFORM pg_temp.assert(_st IS DISTINCT FROM 'active', 'and stays out');
  DELETE FROM public.practice_invitations WHERE id = _inv;

  -- ======================================================================
  -- 5. Grandfathering: a tenant over its cap keeps every member
  -- ======================================================================
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (_prac, _x1, 'provider', 'active'), (_prac, _x2, 'provider', 'active'), (_prac, _adm, 'admin', 'active');
  SELECT count(*) INTO _n FROM public.practice_members WHERE practice_id = _prac AND status = 'active';
  PERFORM pg_temp.assert(_n = 6, 'the platform can seat people beyond the cap (6 active on a 3-seat tenant)');
  PERFORM pg_temp.as_user(_own);
  SELECT count(*) INTO _n FROM public.practice_members WHERE practice_id = _prac AND status = 'active';
  PERFORM pg_temp.assert(_n = 6, 'every existing member is still listed');
  UPDATE public.practice_members SET can_invite_patients = true WHERE practice_id = _prac AND user_id IN (_x1, _x2);
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 2, 'and still editable');
  _st := pg_temp.invite(_prac, 'slc-x1@test.local', _own);
  PERFORM pg_temp.assert(_st = 'OC002', 'but no new invitation while over the cap (' || _st || ')');

  -- ======================================================================
  -- 6. The platform is trusted
  -- ======================================================================
  PERFORM pg_temp.as_service();
  _st := pg_temp.invite(_prac, 'slc-x2@test.local', _own);
  PERFORM pg_temp.assert(_st = 'ok', 'service_role is not refused (' || _st || ')');
  PERFORM pg_temp.as_user(_adm);
  _st := pg_temp.invite(_prac, 'slc-adm-invitee@test.local', _adm);
  PERFORM pg_temp.assert(_st = 'ok', 'a platform admin is not refused (' || _st || ')');

  -- ======================================================================
  -- 7. The cap is data, not code
  -- ======================================================================
  -- A practice-type tenant takes the larger of its stored figure and the plan
  -- of its owner; the table says Practice includes three clinician seats.
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.clinician_profiles (user_id, first_name, subscription_tier, patient_limit)
  VALUES (_own, 'Seat', 'pro', 1000);
  INSERT INTO public.practices (id, name, created_by, tenant_type, member_limit)
  VALUES (_prac2, 'Seat Practice', _own, 'practice', 1);
  INSERT INTO public.practice_members (practice_id, user_id, role, status)
  VALUES (_prac2, _own, 'owner', 'active')
  ON CONFLICT (practice_id, user_id) DO UPDATE SET role = 'owner', status = 'active';
  SELECT seat_limit INTO _lim FROM public._practice_limits(_prac2);
  PERFORM pg_temp.assert(_lim = 3, 'a practice-type tenant owned by a Practice plan has the published three clinician seats (' || _lim || ')');
  UPDATE public.tier_limits SET seat_limit = 2 WHERE tier = 'pro';
  UPDATE public.practices SET member_limit = 1 WHERE id = _prac2;
  SELECT seat_limit INTO _lim FROM public._practice_limits(_prac2);
  PERFORM pg_temp.assert(_lim = 2, 'changing tier_limits changes the seat cap with no code change (' || _lim || ')');
  UPDATE public.tier_limits SET seat_limit = NULL WHERE tier = 'pro';
  SELECT seat_limit INTO _lim FROM public._practice_limits(_prac2);
  PERFORM pg_temp.assert(_lim IS NULL, 'a NULL seat limit is unlimited');
  PERFORM pg_temp.as_user(_own);
  _st := pg_temp.invite(_prac2, 'slc-new@test.local', _own);
  PERFORM pg_temp.assert(_st = 'ok', 'and unlimited means no refusal (' || _st || ')');

  -- ======================================================================
  -- 8. The backfill leaves nobody over their own cap
  -- ======================================================================
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.practices SET member_limit = 3 WHERE id = _prac;
  UPDATE public.practices p
     SET member_limit = public._practice_seats_in_use(p.id)
   WHERE p.member_limit IS NOT NULL
     AND p.member_limit < 999999
     AND p.member_limit < public._practice_seats_in_use(p.id);
  SELECT member_limit INTO _lim FROM public.practices WHERE id = _prac;
  PERFORM pg_temp.assert(_lim = public._practice_seats_in_use(_prac),
    'the backfill raises an over-cap tenant to the seats it already has (' || _lim || ')');
END $$;

DO $$
BEGIN
  PERFORM pg_temp.assert(NOT has_function_privilege('authenticated', 'public._practice_seats_in_use(uuid)', 'EXECUTE'),
    'a client cannot count another tenant''s seats');
END $$;

ROLLBACK;
