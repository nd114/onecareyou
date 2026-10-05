-- Small-gaps pass over the hospital-seat / account work.
--
--   1. A new practice starts with one clinician seat (member_limit default 1,
--      and a client-made practice is pinned to 1), without making a Practice or
--      Clinic tenant smaller than its plan; an existing tenant keeps its value.
--   2. The scribe pool grows by 300 minutes per purchased add-on clinician seat
--      (Practice and Clinic only) in the overview and in entitlements_for.
--   3. set_member_clinical_seat works end to end for an authenticated owner with
--      the guard trigger firing, and a direct client write of the flag is
--      refused with the intended message (not "permission denied for function").
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/small_gaps.test.sql

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

-- SQLSTATE and message of a statement run as the current role.
CREATE OR REPLACE FUNCTION pg_temp.outcome_of(_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ': ' || SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.overview_as(_uid uuid, _prac uuid) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE _j jsonb;
BEGIN
  PERFORM pg_temp.as_user(_uid);
  SELECT public.practice_account_overview(_prac) INTO _j;
  PERFORM pg_temp.as_user(NULL);
  RETURN _j;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.ent_included(_uid uuid) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE _n integer;
BEGIN
  PERFORM pg_temp.as_user(_uid);
  SELECT e.scribe_minutes_included INTO _n FROM public.entitlements_for(_uid) e;
  PERFORM pg_temp.as_user(NULL);
  RETURN _n;
END;
$$;

DO $$
DECLARE
  _po  uuid := 'b8000000-0000-4000-8000-000000000001';  -- Practice owner (pro)
  _co  uuid := 'b8000000-0000-4000-8000-000000000002';  -- Clinic owner
  _ho  uuid := 'b8000000-0000-4000-8000-000000000003';  -- hospital owner
  _ha  uuid := 'b8000000-0000-4000-8000-000000000004';  -- hospital admin, ops only
  _mo  uuid := 'b8000000-0000-4000-8000-000000000005';  -- owner of a community-tier practice
  _no  uuid := 'b8000000-0000-4000-8000-000000000006';  -- a signed-in person with no practice yet
  _go  uuid := 'b8000000-0000-4000-8000-000000000007';  -- owner of the grandfathered practice
  _pp  uuid := 'b8000000-0000-4000-8000-0000000000c1';  -- Practice (pro), default member_limit
  _pc  uuid := 'b8000000-0000-4000-8000-0000000000c2';  -- Clinic
  _ph  uuid := 'b8000000-0000-4000-8000-0000000000c3';  -- Hospital
  _pm  uuid := 'b8000000-0000-4000-8000-0000000000c4';  -- community-tier practice
  _pg  uuid := 'b8000000-0000-4000-8000-0000000000c5';  -- grandfathered practice
  _pn  uuid := 'b8000000-0000-4000-8000-0000000000c6';  -- practice made by a client
  _j jsonb; _lim integer; _st text; _seat boolean; _def text;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at)
  SELECT u, 'sg-' || right(u::text, 4) || '@test.local', now()
    FROM unnest(ARRAY[_po, _co, _ho, _ha, _mo, _no, _go]) AS u;
  INSERT INTO public.clinician_profiles (user_id, first_name, last_name, subscription_tier, patient_limit) VALUES
    (_po, 'Pia', 'Practice', 'pro', 1000), (_co, 'Cleo', 'Clinic', 'clinic', 3500);

  -- ======================================================================
  -- 1. One clinician seat for a new practice
  -- ======================================================================
  SELECT column_default INTO _def FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'practices' AND column_name = 'member_limit';
  PERFORM pg_temp.assert(_def = '1', 'practices.member_limit now defaults to 1 (' || _def || ')');

  -- A practice created without naming a limit gets 1 from the column default.
  INSERT INTO public.practices (id, name, created_by, tenant_type, subscription_tier)
  VALUES (_pp, 'Default Practice', _po, 'practice', 'pro');
  SELECT member_limit INTO _lim FROM public.practices WHERE id = _pp;
  PERFORM pg_temp.assert(_lim = 1, 'a practice created without a limit stores 1 (' || _lim || ')');

  -- The plan still lifts it: Practice includes three clinicians, add-ons go on top.
  SELECT seat_limit INTO _lim FROM public._practice_limits(_pp);
  PERFORM pg_temp.assert(_lim = 3, 'a new Practice-plan tenant still has its three included seats (' || _lim || ')');
  UPDATE public.practices SET clinician_seats_purchased = 2 WHERE id = _pp;
  SELECT seat_limit INTO _lim FROM public._practice_limits(_pp);
  PERFORM pg_temp.assert(_lim = 5, 'and two purchased seats make five (' || _lim || ')');

  -- A tenant that stored something larger keeps it (the stored value is a floor).
  INSERT INTO public.practices (id, name, created_by, tenant_type, subscription_tier, member_limit)
  VALUES (_pg, 'Grandfathered Practice', _go, 'practice', 'pro', 12);
  SELECT seat_limit INTO _lim FROM public._practice_limits(_pg);
  PERFORM pg_temp.assert(_lim = 12, 'an existing tenant keeps its stored limit of 12 (' || _lim || ')');

  -- A practice made by a client is pinned to 1, whatever the client asked for.
  PERFORM pg_temp.as_user(_no);
  _st := pg_temp.outcome_of(format(
    'INSERT INTO public.practices (id, name, created_by, tenant_type, member_limit, subscription_tier) VALUES (%L, ''Client Made'', %L, ''practice'', 50, ''enterprise'')',
    _pn, _no));
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_st = 'ok', 'a signed-in person can still create their practice at one seat (' || _st || ')');
  SELECT member_limit INTO _lim FROM public.practices WHERE id = _pn;
  PERFORM pg_temp.assert(_lim = 1, 'and the limit they asked for (50) was replaced by 1 (' || _lim || ')');
  PERFORM pg_temp.assert((SELECT subscription_tier FROM public.practices WHERE id = _pn) = 'trial',
    'as the tier they asked for was replaced by trial');
  PERFORM pg_temp.assert(EXISTS (SELECT 1 FROM public.practice_members
                                  WHERE practice_id = _pn AND user_id = _no AND role = 'owner' AND status = 'active'),
    'and they are the active owner');

  -- Hospitals and the other fixtures state their limit explicitly.
  INSERT INTO public.practices (id, name, created_by, tenant_type, subscription_tier, member_limit)
  VALUES (_pc, 'Small Clinic', _co, 'practice', 'clinic', 1);
  INSERT INTO public.practices (id, name, created_by, tenant_type, subscription_tier, member_limit)
  VALUES (_ph, 'Gaps Hospital', _ho, 'hospital', 'enterprise', 10);
  INSERT INTO public.practices (id, name, created_by, tenant_type, subscription_tier, member_limit)
  VALUES (_pm, 'Community Practice', _mo, 'practice', 'community', 1);

  SELECT seat_limit INTO _lim FROM public._practice_limits(_pc);
  PERFORM pg_temp.assert(_lim = 10, 'a new Clinic-plan tenant has its ten included seats (' || _lim || ')');

  -- ======================================================================
  -- 2. The scribe pool grows with purchased clinicians
  -- ======================================================================
  PERFORM pg_temp.assert(
    (SELECT scribe_minutes_per_extra_clinician FROM public.tier_limits WHERE tier = 'pro') = 300
    AND (SELECT scribe_minutes_per_extra_clinician FROM public.tier_limits WHERE tier = 'clinic') = 300,
    'Practice and Clinic add 300 minutes per purchased clinician seat');
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.tier_limits
      WHERE tier NOT IN ('pro', 'clinic') AND scribe_minutes_per_extra_clinician <> 0) = 0,
    'every other plan adds nothing');

  _j := pg_temp.overview_as(_po, _pp);
  PERFORM pg_temp.assert((_j->'scribe'->>'pool_minutes')::int = 900 + 2 * 300,
    'Practice with two purchased seats: pool 900 + 600 (' || (_j->'scribe'->>'pool_minutes') || ')');
  PERFORM pg_temp.assert((_j->'scribe'->>'included_minutes')::int = 1500 AND (_j->'scribe'->>'total_minutes')::int = 1500,
    'included and total follow the pool');
  PERFORM pg_temp.assert(pg_temp.ent_included(_po) = 1500,
    'entitlements_for reports the same pooled figure (' || coalesce(pg_temp.ent_included(_po)::text, 'null') || ')');

  _j := pg_temp.overview_as(_go, _pg);
  PERFORM pg_temp.assert((_j->'scribe'->>'pool_minutes')::int = 900, 'no purchased seats: the plain 900');

  UPDATE public.practices SET clinician_seats_purchased = 3 WHERE id = _pc;
  _j := pg_temp.overview_as(_co, _pc);
  PERFORM pg_temp.assert((_j->'scribe'->>'pool_minutes')::int = 3000 + 3 * 300,
    'Clinic with three purchased seats: pool 3000 + 900 (' || (_j->'scribe'->>'pool_minutes') || ')');

  -- Purchased seats are meaningless on a hospital; even forced, nothing is added.
  UPDATE public.practices SET clinician_seats_purchased = 4 WHERE id = _ph;
  _j := pg_temp.overview_as(_ho, _ph);
  PERFORM pg_temp.assert((_j->'scribe'->>'pool_minutes')::int = 15000, 'a hospital pool stays 15000');

  -- A plan with a rate of zero adds nothing.
  UPDATE public.practices SET clinician_seats_purchased = 2 WHERE id = _pm;
  _j := pg_temp.overview_as(_mo, _pm);
  PERFORM pg_temp.assert((_j->'scribe'->>'pool_minutes')::int = 0, 'a Community tenant stays at 0');

  -- The pool is informational: raising it changed no limit.
  SELECT seat_limit INTO _lim FROM public._practice_limits(_pp);
  PERFORM pg_temp.assert(_lim = 5, 'the seat limit is untouched by the pool figure');

  -- ======================================================================
  -- 3. The clinical seat, end to end, with the guard trigger firing
  -- ======================================================================
  INSERT INTO public.practice_members (practice_id, user_id, role, status)
  VALUES (_ph, _ha, 'admin', 'active');
  SELECT clinical_seat INTO _seat FROM public.practice_members WHERE practice_id = _ph AND user_id = _ha;
  PERFORM pg_temp.assert(_seat IS FALSE, 'fixture: the hospital admin starts ops-only');

  -- The guard is a row trigger on practice_members that fires on UPDATE.
  PERFORM pg_temp.assert(EXISTS (
      SELECT 1 FROM pg_trigger t
       WHERE t.tgrelid = 'public.practice_members'::regclass
         AND t.tgname = 'trg_guard_practice_member_standing' AND NOT t.tgisinternal),
    'the standing guard trigger is installed on practice_members');

  PERFORM pg_temp.as_user(_ho);
  _st := pg_temp.outcome_of(format('SELECT public.set_member_clinical_seat(%L, %L, true)', _ph, _ha));
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_st = 'ok', 'an authenticated owner gives the admin a seat (' || _st || ')');
  SELECT clinical_seat INTO _seat FROM public.practice_members WHERE practice_id = _ph AND user_id = _ha;
  PERFORM pg_temp.assert(_seat IS TRUE, 'and the flag is set');

  PERFORM pg_temp.as_user(_ho);
  _st := pg_temp.outcome_of(format('SELECT public.set_member_clinical_seat(%L, %L, false)', _ph, _ha));
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_st = 'ok', 'the same owner takes it away again (' || _st || ')');
  SELECT clinical_seat INTO _seat FROM public.practice_members WHERE practice_id = _ph AND user_id = _ha;
  PERFORM pg_temp.assert(_seat IS FALSE, 'and the flag is cleared');

  -- A direct client write is refused by the guard's own rule.
  PERFORM pg_temp.as_user(_ho);
  _st := pg_temp.outcome_of(format(
    'UPDATE public.practice_members SET clinical_seat = true WHERE practice_id = %L AND user_id = %L', _ph, _ha));
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_st LIKE '42501:%', 'a direct write of the flag is refused (' || _st || ')');
  PERFORM pg_temp.assert(_st LIKE '%only through set_member_clinical_seat%',
    'with the guard''s message, not a permission error on a helper (' || _st || ')');
  PERFORM pg_temp.assert(_st NOT LIKE '%permission denied for function%', 'no helper-function permission error');
  SELECT clinical_seat INTO _seat FROM public.practice_members WHERE practice_id = _ph AND user_id = _ha;
  PERFORM pg_temp.assert(_seat IS FALSE, 'and nothing changed');

  -- Other member settings a manager may edit still work with the guard in place.
  PERFORM pg_temp.as_user(_ho);
  _st := pg_temp.outcome_of(format(
    'UPDATE public.practice_members SET can_invite_members = true WHERE practice_id = %L AND user_id = %L', _ph, _ha));
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_st = 'ok', 'an unrelated member setting is not caught by the guard (' || _st || ')');
END $$;

ROLLBACK;
