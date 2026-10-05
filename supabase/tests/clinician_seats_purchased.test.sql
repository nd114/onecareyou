-- The clinician cap is the plan's included seats plus purchased add-on seats.
--
-- A tenant whose stored limit is 1 (what a platform admin sets for a new
-- Practice tenant) gets the plan's three seats and no more: the fourth clinician
-- is refused with seat_limit_reached (OC002), and allowed once a seat is bought.
-- A tenant that already stores a larger figure (grandfathered: 5) keeps it, and a
-- purchase through apply_addon_change adds on top of it. A hospital keeps its
-- stored figure. clinician_seats_purchased is pinned. Purchased seats add 10 GB
-- each to entitlements_for.storage_mb. No existing member is ever removed.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/clinician_seats_purchased.test.sql

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

-- Clients cannot insert or activate membership rows, and the platform is trusted so it
-- never meets the cap. The cap shows on the route a real person takes: an invitation
-- (staged by the platform here) that the invitee accepts.
CREATE OR REPLACE FUNCTION pg_temp.join_as(_prac uuid, _uid uuid, _role text) RETURNS text
LANGUAGE plpgsql AS $f$
DECLARE _by uuid; _inv uuid; _r text; _email text;
BEGIN
  SELECT created_by INTO _by FROM public.practices WHERE id = _prac;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  DELETE FROM public.practice_invitations WHERE practice_id = _prac AND email = _email;
  INSERT INTO public.practice_invitations (practice_id, email, role, invited_by)
  VALUES (_prac, _email, _role::public.practice_role, _by) RETURNING id INTO _inv;
  PERFORM pg_temp.as_user(_uid);
  _r := pg_temp.msg_of(format('SELECT public.accept_practice_invitation(%L)', _inv));
  PERFORM pg_temp.as_user(NULL);
  IF _r <> 'ok' THEN
    DELETE FROM public.practice_invitations WHERE id = _inv;
    RETURN split_part(_r, ':', 1);
  END IF;
  RETURN 'ok';
END
$f$;

DO $$
DECLARE
  _own   uuid := 'b5000000-0000-4000-8000-000000000001';
  _d1    uuid := 'b5000000-0000-4000-8000-000000000002';
  _d2    uuid := 'b5000000-0000-4000-8000-000000000003';
  _d3    uuid := 'b5000000-0000-4000-8000-000000000004';
  _d4    uuid := 'b5000000-0000-4000-8000-000000000005';
  _adm   uuid := 'b5000000-0000-4000-8000-000000000006';
  _gown  uuid := 'b5000000-0000-4000-8000-000000000007';
  _g1    uuid := 'b5000000-0000-4000-8000-000000000008';
  _g2    uuid := 'b5000000-0000-4000-8000-000000000009';
  _g3    uuid := 'b5000000-0000-4000-8000-00000000000a';
  _g4    uuid := 'b5000000-0000-4000-8000-00000000000b';
  _g5    uuid := 'b5000000-0000-4000-8000-00000000000c';
  _g6    uuid := 'b5000000-0000-4000-8000-00000000000d';
  _clown uuid := 'b5000000-0000-4000-8000-00000000000e';
  _prac  uuid := 'b5000000-0000-4000-8000-0000000000c1';
  _gprac uuid := 'b5000000-0000-4000-8000-0000000000c2';
  _cprac uuid := 'b5000000-0000-4000-8000-0000000000c3';
  _st text; _m text; _v int; _n int; _j jsonb;
  e record;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at)
  SELECT u, 'csp-' || right(u::text, 4) || '@test.local', now()
    FROM unnest(ARRAY[_own, _d1, _d2, _d3, _d4, _adm, _gown, _g1, _g2, _g3, _g4, _g5, _g6, _clown]) AS u;
  INSERT INTO public.user_roles (user_id, role) VALUES (_adm, 'admin');
  INSERT INTO public.clinician_profiles (user_id, first_name, subscription_tier, patient_limit) VALUES
    (_own, 'Own', 'pro', 1000), (_gown, 'Gown', 'pro', 1000), (_clown, 'Clown', 'clinic', 3500);

  -- ======================================================================
  -- 1. A new Practice tenant (stored 1): three seats from the plan, not five
  -- ======================================================================
  INSERT INTO public.practices (id, name, created_by, tenant_type, subscription_tier, member_limit)
  VALUES (_prac, 'New Practice', _own, 'practice', 'pro', 1);
  SELECT clinician_seats_purchased INTO _v FROM public.practices WHERE id = _prac;
  PERFORM pg_temp.assert(_v = 0, 'a new tenant has bought no clinician seats');
  -- (the owner takes seat 1 automatically when the practice is created)
  _st := pg_temp.join_as(_prac, _d1, 'provider'); PERFORM pg_temp.assert(_st = 'ok', 'a provider takes seat 2 (' || _st || ')');
  PERFORM pg_temp.assert(pg_temp.join_as(_prac, _d2, 'provider') = 'ok', 'a provider takes seat 3 (the plan includes three)');
  SELECT seat_limit INTO _v FROM public._practice_limits(_prac);
  PERFORM pg_temp.assert(_v = 3, 'the effective limit is the plan''s 3, not a stored default (' || _v || ')');
  _st := pg_temp.join_as(_prac, _d3, 'provider');
  PERFORM pg_temp.assert(_st = 'OC002', 'the fourth clinician is refused with seat_limit_reached (' || _st || ')');
  SELECT count(*) INTO _n FROM public.practice_members WHERE practice_id = _prac;
  PERFORM pg_temp.assert(_n = 3, 'and nobody was added or removed');

  PERFORM pg_temp.as_service();
  UPDATE public.practices SET clinician_seats_purchased = 1 WHERE id = _prac;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(pg_temp.join_as(_prac, _d3, 'provider') = 'ok', 'after one seat is bought, the fourth is allowed');
  _st := pg_temp.join_as(_prac, _d4, 'provider');
  PERFORM pg_temp.assert(_st = 'OC002', 'the fifth is refused again (' || _st || ')');

  -- Storage: Practice 30 GB + 10 GB per purchased seat, in entitlements_for.
  PERFORM pg_temp.as_user(_own);
  SELECT * INTO e FROM public.entitlements_for();
  PERFORM pg_temp.assert(e.seat_limit = 4 AND e.clinician_seat_limit = 4,
    'entitlements_for reports the limit as 4 (' || coalesce(e.seat_limit::text, 'null') || ')');
  PERFORM pg_temp.assert(e.storage_mb = 30720 + 10240,
    'storage_mb is 30 GB plus 10 GB for the purchased seat (' || coalesce(e.storage_mb::text, 'null') || ')');
  PERFORM pg_temp.as_user(_d1);
  SELECT * INTO e FROM public.entitlements_for();
  PERFORM pg_temp.assert(e.storage_mb >= 10240, 'a member of that practice gets the add-on storage too (' || coalesce(e.storage_mb::text, 'null') || ')');
  PERFORM pg_temp.as_user(NULL);

  -- ======================================================================
  -- 2. A grandfathered tenant (stored 5) keeps 5
  -- ======================================================================
  INSERT INTO public.practices (id, name, created_by, tenant_type, subscription_tier, member_limit)
  VALUES (_gprac, 'Old Practice', _gown, 'practice', 'pro', 5);
  PERFORM pg_temp.assert(pg_temp.join_as(_gprac, _g1, 'provider') = 'ok', 'two');
  PERFORM pg_temp.assert(pg_temp.join_as(_gprac, _g2, 'provider') = 'ok', 'three');
  PERFORM pg_temp.assert(pg_temp.join_as(_gprac, _g3, 'provider') = 'ok', 'four (above the plan''s three)');
  PERFORM pg_temp.assert(pg_temp.join_as(_gprac, _g4, 'provider') = 'ok', 'five');
  SELECT seat_limit INTO _v FROM public._practice_limits(_gprac);
  PERFORM pg_temp.assert(_v = 5, 'a practice that stores 5 keeps 5 (' || _v || ')');
  _st := pg_temp.join_as(_gprac, _g5, 'provider');
  PERFORM pg_temp.assert(_st = 'OC002', 'and the sixth is refused (' || _st || ')');
  -- A purchase through the billing path adds on top of what it had.
  PERFORM pg_temp.as_service();
  _j := public.apply_addon_change(_gprac, 'clinician_seat', 1, 'evt_csp_g1');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_j->>'status' = 'applied', 'buying a seat is applied (' || _j::text || ')');
  SELECT seat_limit INTO _v FROM public._practice_limits(_gprac);
  PERFORM pg_temp.assert(_v = 6, 'a grandfathered tenant gets the seat on top of its 5 (' || _v || ')');
  PERFORM pg_temp.assert(pg_temp.join_as(_gprac, _g5, 'provider') = 'ok', 'so the sixth is now allowed');

  -- ======================================================================
  -- 3. A hospital keeps its stored figure; purchases do not apply to it
  -- ======================================================================
  INSERT INTO public.practices (id, name, created_by, tenant_type, subscription_tier, member_limit)
  VALUES ('b5000000-0000-4000-8000-0000000000c4', 'Some Hospital', _own, 'hospital', 'enterprise', 4);
  SELECT seat_limit INTO _v FROM public._practice_limits('b5000000-0000-4000-8000-0000000000c4');
  PERFORM pg_temp.assert(_v = 4, 'a hospital uses its stored limit (' || _v || ')');
  PERFORM pg_temp.as_service();
  _j := public.apply_addon_change('b5000000-0000-4000-8000-0000000000c4', 'clinician_seat', 2, 'evt_csp_h1');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_j->>'status' = 'not_applicable', 'a hospital cannot buy add-on seats (' || (_j->>'status') || ')');

  -- ======================================================================
  -- 4. Clinic: capped at 30
  -- ======================================================================
  INSERT INTO public.practices (id, name, created_by, tenant_type, subscription_tier, member_limit)
  VALUES (_cprac, 'Clinic', _clown, 'practice', 'clinic', 1);
  SELECT seat_limit INTO _v FROM public._practice_limits(_cprac);
  PERFORM pg_temp.assert(_v = 10, 'Clinic includes 10 (' || _v || ')');
  PERFORM pg_temp.as_service();
  _j := public.apply_addon_change(_cprac, 'clinician_seat', 20, 'evt_csp_c1');
  PERFORM pg_temp.assert(_j->>'status' = 'applied', 'Clinic can buy up to 20 more (' || (_j->>'status') || ')');
  _j := public.apply_addon_change(_cprac, 'clinician_seat', 1, 'evt_csp_c2');
  PERFORM pg_temp.assert(_j->>'status' = 'rejected_seat_max', 'but not past 30 (' || (_j->>'status') || ')');
  PERFORM pg_temp.as_user(NULL);
  SELECT seat_limit INTO _v FROM public._practice_limits(_cprac);
  PERFORM pg_temp.assert(_v = 30, 'the limit is 30 (' || _v || ')');

  -- ======================================================================
  -- 5. Reductions never remove a member
  -- ======================================================================
  PERFORM pg_temp.as_service();
  _j := public.apply_addon_change(_prac, 'clinician_seat', -1, 'evt_csp_r1');
  PERFORM pg_temp.assert(_j->>'status' = 'rejected_in_use',
    'dropping the seat that the fourth clinician sits in is rejected (' || (_j->>'status') || ')');
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.practice_members WHERE practice_id = _prac AND status = 'active';
  PERFORM pg_temp.assert(_n = 4, 'all four clinicians are still there');
  SELECT clinician_seats_purchased INTO _v FROM public.practices WHERE id = _prac;
  PERFORM pg_temp.assert(_v = 1, 'and the purchased count did not move');
  PERFORM pg_temp.as_service();
  _j := public.apply_addon_change(_prac, 'clinician_seat', -2, 'evt_csp_r2');
  PERFORM pg_temp.assert(_j->>'status' = 'rejected_negative', 'it cannot go below zero purchased (' || (_j->>'status') || ')');
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.practice_members SET status = 'inactive' WHERE practice_id = _prac AND user_id = _d2;
  PERFORM pg_temp.as_service();
  _j := public.apply_addon_change(_prac, 'clinician_seat', -1, 'evt_csp_r3');
  PERFORM pg_temp.assert(_j->>'status' = 'applied', 'once a seat is free the reduction is applied (' || (_j->>'status') || ')');
  PERFORM pg_temp.as_user(NULL);
  SELECT seat_limit INTO _v FROM public._practice_limits(_prac);
  PERFORM pg_temp.assert(_v = 3, 'back to the plan''s three (' || _v || ')');

  -- ======================================================================
  -- 6. clinician_seats_purchased is pinned
  -- ======================================================================
  PERFORM pg_temp.as_user(_own);
  _st := pg_temp.state_of(format('UPDATE public.practices SET clinician_seats_purchased = 9 WHERE id = %L', _prac));
  PERFORM pg_temp.assert(_st = '42501', 'an owner cannot raise it with a direct UPDATE (' || _st || ')');
  _m := pg_temp.msg_of(format(
    'INSERT INTO public.practices (name, created_by, clinician_seats_purchased) VALUES (%L, %L, 5)', 'Grab', _own));
  PERFORM pg_temp.assert(_m LIKE '42501%set by billing%', 'nor start a tenant with seats bought (' || _m || ')');
  _st := pg_temp.state_of(format('UPDATE public.practices SET name = %L WHERE id = %L', 'New Practice Renamed', _prac));
  PERFORM pg_temp.assert(_st = 'ok', 'ordinary settings stay editable (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);
  SELECT clinician_seats_purchased INTO _v FROM public.practices WHERE id = _prac;
  PERFORM pg_temp.assert(_v = 0, 'the figure did not move (' || _v || ')');
  PERFORM pg_temp.as_service();
  UPDATE public.practices SET clinician_seats_purchased = 2 WHERE id = _prac;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 1, 'service_role may set it');
  PERFORM pg_temp.as_user(_adm);
_st := pg_temp.state_of(format('UPDATE public.practices SET clinician_seats_purchased = 1 WHERE id = %L', _prac));  PERFORM pg_temp.assert(_st = 'ok', 'a platform admin is not refused by the pin (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);
END $$;

ROLLBACK;
