-- entitlements_for(user): a user reads their own plan, limits and usage; the
-- service role and platform admins may ask about anyone; nobody reads another
-- person's entitlements through it; the figures come from tier_limits.

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

DO $$
DECLARE
  _free  uuid := 'b3000000-0000-4000-8000-000000000001';
  _solo  uuid := 'b3000000-0000-4000-8000-000000000002';
  _pro   uuid := 'b3000000-0000-4000-8000-000000000003';
  _ent   uuid := 'b3000000-0000-4000-8000-000000000004';
  _exp   uuid := 'b3000000-0000-4000-8000-000000000005';
  _mem   uuid := 'b3000000-0000-4000-8000-000000000006';
  _adm   uuid := 'b3000000-0000-4000-8000-000000000007';
  _pat   uuid := 'b3000000-0000-4000-8000-000000000008';
  _stran uuid := 'b3000000-0000-4000-8000-000000000009';
  _prac  uuid := 'b3000000-0000-4000-8000-0000000000c1';
  e record;
  _st text;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_free, 'ent-free@test.local', now()), (_solo, 'ent-solo@test.local', now()),
    (_pro, 'ent-pro@test.local', now()), (_ent, 'ent-ent@test.local', now()),
    (_exp, 'ent-exp@test.local', now()), (_mem, 'ent-mem@test.local', now()),
    (_adm, 'ent-adm@test.local', now()), (_pat, 'ent-pat@test.local', now()),
    (_stran, 'ent-stranger@test.local', now());
  INSERT INTO public.user_roles (user_id, role) VALUES (_adm, 'admin');

  INSERT INTO public.clinician_profiles (user_id, first_name, subscription_tier, patient_limit) VALUES
    (_free, 'Free', 'community', 25), (_solo, 'Solo', 'solo', 150), (_pro, 'Pro', 'pro', 1000),
    (_ent, 'Ent', 'enterprise', 999999), (_mem, 'Mem', 'trial', 5);
  INSERT INTO public.clinician_profiles (user_id, first_name, trial_ends_at)
  VALUES (_exp, 'Expired', now() - interval '3 days');

  -- ======================================================================
  -- 1. The published numbers, per plan
  -- ======================================================================
  PERFORM pg_temp.as_user(_free);
  SELECT * INTO e FROM public.entitlements_for();
  PERFORM pg_temp.assert(e.tier = 'community' AND e.patient_limit = 25 AND e.storage_mb = 500 AND NOT e.scribe_included,
    'Community: 25 patients, 500 MB, no scribe');
  PERFORM pg_temp.as_user(_solo);
  SELECT * INTO e FROM public.entitlements_for(_solo);
  PERFORM pg_temp.assert(e.tier = 'solo' AND e.patient_limit = 150 AND e.storage_mb = 10240 AND NOT e.scribe_included,
    'Individual: 150 patients, 10 GB, no scribe');
  PERFORM pg_temp.as_user(_pro);
  SELECT * INTO e FROM public.entitlements_for();
  PERFORM pg_temp.assert(e.tier = 'pro' AND e.patient_limit = 1000 AND e.seat_limit = 3 AND e.storage_mb = 30720,
    'Practice: 1,000 patients, 3 clinician seats, 30 GB');
  PERFORM pg_temp.as_user(_ent);
  SELECT * INTO e FROM public.entitlements_for();
  PERFORM pg_temp.assert(e.tier = 'enterprise' AND e.patient_limit IS NULL AND e.seat_limit = 25 AND e.storage_mb = 1048576
                         AND NOT e.at_patient_limit AND NOT e.over_patient_limit,
    'Enterprise: grandfathered unlimited patients, 25 clinician seats, 1 TB storage');
  PERFORM pg_temp.as_user(_exp);
  SELECT * INTO e FROM public.entitlements_for();
  PERFORM pg_temp.assert(e.tier = 'expired' AND e.patient_limit = 0 AND e.at_patient_limit,
    'a trial that ended with no plan allows no new patients');

  -- ======================================================================
  -- 2. Usage is reported and over-cap is visible
  -- ======================================================================
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.provider_shares (user_id, provider_name, provider_email, invite_code, clinician_user_id)
  VALUES (_pat, 'Dr', 'ent-mem@test.local', 'ent-1', _mem), (_stran, 'Dr', 'ent-mem@test.local', 'ent-2', _mem);
  UPDATE public.tier_limits SET patient_limit = 1 WHERE tier = 'trial';
  PERFORM pg_temp.as_user(_mem);
  SELECT * INTO e FROM public.entitlements_for();
  PERFORM pg_temp.assert(e.patient_count = 2 AND e.patient_limit = 5 AND NOT e.over_patient_limit,
    'usage is counted, and the stored allowance (5) is never lowered by a table edit');
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.clinician_profiles SET patient_limit = 1 WHERE user_id = _mem;
  PERFORM pg_temp.as_user(_mem);
  SELECT * INTO e FROM public.entitlements_for();
  PERFORM pg_temp.assert(e.patient_limit = 1 AND e.over_patient_limit AND e.at_patient_limit,
    'an account over its cap is flagged over, not broken');
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.tier_limits SET patient_limit = 5 WHERE tier = 'trial';
  UPDATE public.clinician_profiles SET patient_limit = 5 WHERE user_id = _mem;

  -- ======================================================================
  -- 3. Table-driven
  -- ======================================================================
  UPDATE public.tier_limits SET patient_limit = 200, storage_mb = 20480 WHERE tier = 'solo';
  PERFORM pg_temp.as_user(_solo);
  SELECT * INTO e FROM public.entitlements_for();
  PERFORM pg_temp.assert(e.patient_limit = 200 AND e.storage_mb = 20480,
    'editing a tier_limits row changes what entitlements_for returns, with no code change');

  -- ======================================================================
  -- 4. A practice member rides the practice's plan
  -- ======================================================================
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.practices (id, name, created_by, tenant_type) VALUES (_prac, 'Ent Practice', _pro, 'practice');
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES (_prac, _pro, 'owner', 'active')
  ON CONFLICT (practice_id, user_id) DO UPDATE SET role = 'owner', status = 'active';
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES (_prac, _mem, 'provider', 'active');
  PERFORM pg_temp.as_user(_mem);
  SELECT * INTO e FROM public.entitlements_for();
  PERFORM pg_temp.assert(e.tier = 'pro' AND e.patient_limit = 1000 AND e.practice_id = _prac AND e.seat_limit = 5,
    'a member of a Practice-plan practice gets the practice''s plan (tier ' || e.tier || ', limit ' || coalesce(e.patient_limit::text, 'unlimited') || ')');
  PERFORM pg_temp.assert(e.seat_count = 2, 'and sees the seats in use (' || e.seat_count || ')');

  -- ======================================================================
  -- 5. Who may ask
  -- ======================================================================
  PERFORM pg_temp.as_user(_free);
  _st := pg_temp.state_of(format('SELECT * FROM public.entitlements_for(%L)', _pro));
  PERFORM pg_temp.assert(_st = '42501', 'a user cannot read another user''s entitlements (' || _st || ')');
  _st := pg_temp.state_of(format('SELECT * FROM public.entitlements_for(%L)', _free));
  PERFORM pg_temp.assert(_st = 'ok', 'but can name themselves explicitly');
  PERFORM pg_temp.as_service();
  _st := pg_temp.state_of(format('SELECT * FROM public.entitlements_for(%L)', _pro));
  PERFORM pg_temp.assert(_st = 'ok', 'the service role can read anyone''s (' || _st || ')');
  PERFORM pg_temp.as_user(_adm);
  _st := pg_temp.state_of(format('SELECT * FROM public.entitlements_for(%L)', _pro));
  PERFORM pg_temp.assert(_st = 'ok', 'a platform admin can read anyone''s (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(NOT has_function_privilege('anon', 'public.entitlements_for(uuid)', 'EXECUTE'),
    'anon cannot execute entitlements_for');
  PERFORM pg_temp.assert(has_function_privilege('authenticated', 'public.entitlements_for(uuid)', 'EXECUTE')
                         AND has_function_privilege('service_role', 'public.entitlements_for(uuid)', 'EXECUTE'),
    'signed-in users and the service role can execute it');
  PERFORM pg_temp.assert(NOT has_function_privilege('authenticated', 'public._clinician_limits(uuid)', 'EXECUTE'),
    'the internal limit helpers are not exposed');

  -- tier_limits is readable, not writable, by a client.
  PERFORM pg_temp.as_user(_free);
  PERFORM pg_temp.assert((SELECT count(*) FROM public.tier_limits) >= 5, 'a signed-in user can read the published limits');
  _st := pg_temp.state_of('UPDATE public.tier_limits SET patient_limit = 999999');
  PERFORM pg_temp.assert(_st = '42501', 'but cannot rewrite them (' || _st || ')');
END $$;

ROLLBACK;
