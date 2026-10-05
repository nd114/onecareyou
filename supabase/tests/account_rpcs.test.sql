-- The Account page's server side: practice_account_overview, set_scribe_member_cap,
-- request_partnership, apply_addon_change, and the tables behind them
-- (practice_scribe_allocations, scribe_packs, partner_requests, addon_events).
--
-- Who may call what: owner and admin (full), billing (overview only, reduced),
-- nobody else. apply_addon_change is the billing service's alone. Scribe caps are
-- informational: nothing blocks a scribe session. One open partner request per
-- practice. Pinned columns (partner_status, referral_slug) refuse a client. No PHI
-- in any of it, and RLS keeps one tenant from reading another's rows.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/account_rpcs.test.sql

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

CREATE OR REPLACE FUNCTION pg_temp.msg_of(_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ': ' || SQLERRM;
END;
$$;

-- Run _sql as _uid (NULL = anon), then go back to the superuser.
CREATE OR REPLACE FUNCTION pg_temp.call_as(_uid uuid, _sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text;
BEGIN
  IF _uid IS NULL THEN PERFORM pg_temp.as_anon(); ELSE PERFORM pg_temp.as_user(_uid); END IF;
  _r := pg_temp.state_of(_sql);
  PERFORM pg_temp.as_user(NULL);
  RETURN _r;
END;
$$;

-- The overview as _uid, as jsonb (the caller must be allowed).
CREATE OR REPLACE FUNCTION pg_temp.overview_as(_uid uuid, _prac uuid) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE _j jsonb;
BEGIN
  PERFORM pg_temp.as_user(_uid);
  _j := public.practice_account_overview(_prac);
  PERFORM pg_temp.as_user(NULL);
  RETURN _j;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.keys_of(_j jsonb) RETURNS text
LANGUAGE sql AS $$
  SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(_j) AS k
$$;

CREATE OR REPLACE FUNCTION pg_temp.count_as(_uid uuid, _table text) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE _n integer;
BEGIN
  PERFORM pg_temp.as_user(_uid);
  EXECUTE format('SELECT count(*)::integer FROM public.%I', _table) INTO _n;
  PERFORM pg_temp.as_user(NULL);
  RETURN _n;
END;
$$;

DO $$
DECLARE
  _o   uuid := 'b6000000-0000-4000-8000-000000000001';  -- owner
  _a   uuid := 'b6000000-0000-4000-8000-000000000002';  -- admin
  _b   uuid := 'b6000000-0000-4000-8000-000000000003';  -- billing
  _v   uuid := 'b6000000-0000-4000-8000-000000000004';  -- provider
  _n   uuid := 'b6000000-0000-4000-8000-000000000005';  -- nurse
  _f   uuid := 'b6000000-0000-4000-8000-000000000006';  -- front desk
  _x   uuid := 'b6000000-0000-4000-8000-000000000007';  -- not a member of anything
  _qa  uuid := 'b6000000-0000-4000-8000-000000000008';  -- admin of the other tenant
  _pt  uuid := 'b6000000-0000-4000-8000-000000000009';  -- a patient
  _pa  uuid := 'b6000000-0000-4000-8000-00000000000a';  -- platform admin
  _ho  uuid := 'b6000000-0000-4000-8000-00000000000b';  -- hospital owner
  _p   uuid := 'b6000000-0000-4000-8000-0000000000c1';  -- the practice under test
  _q   uuid := 'b6000000-0000-4000-8000-0000000000c2';  -- another tenant
  _h   uuid := 'b6000000-0000-4000-8000-0000000000c3';  -- a hospital
  _st text; _m text; _j jsonb; _k text; _n_ int; _id uuid; _who uuid; _label text;
  _all uuid[];
  _roles text[] := ARRAY['owner','admin','billing','provider','nurse','front_desk','non-member','other-tenant admin','patient','anon'];
  _ids uuid[];
  _i int;
  _expect text;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at)
  SELECT u, 'arp-' || right(u::text, 4) || '@test.local', now()
    FROM unnest(ARRAY[_o, _a, _b, _v, _n, _f, _x, _qa, _pt, _pa, _ho]) AS u;
  INSERT INTO public.user_roles (user_id, role) VALUES (_pa, 'admin');
  INSERT INTO public.clinician_profiles (user_id, first_name, last_name, subscription_tier, patient_limit) VALUES
    (_o, 'Olive', 'Owner', 'pro', 1000), (_v, 'Vera', 'Provider', 'pro', 1000);

  INSERT INTO public.practices (id, name, created_by, tenant_type, subscription_tier, member_limit)
  VALUES (_p, 'Account Practice', _o, 'practice', 'pro', 5);
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (_p, _a, 'admin', 'active'), (_p, _b, 'billing', 'active'), (_p, _v, 'provider', 'active'),
    (_p, _n, 'nurse', 'active'), (_p, _f, 'front_desk', 'active');
  INSERT INTO public.practices (id, name, created_by, tenant_type, subscription_tier, member_limit)
  VALUES (_q, 'Other Practice', _qa, 'practice', 'pro', 5);
  INSERT INTO public.practices (id, name, created_by, tenant_type, subscription_tier, member_limit)
  VALUES (_h, 'Account Hospital', _ho, 'hospital', 'enterprise', 10);

  -- Callers in the order of _roles; anon is NULL.
  _ids := ARRAY[_o, _a, _b, _v, _n, _f, _x, _qa, _pt, NULL]::uuid[];

  -- ======================================================================
  -- 1. practice_account_overview: owner, admin and billing; nobody else
  -- ======================================================================
  FOR _i IN 1..array_length(_ids, 1) LOOP
    _expect := CASE WHEN _roles[_i] IN ('owner','admin','billing') THEN 'ok' ELSE '42501' END;
    _st := pg_temp.call_as(_ids[_i], format('SELECT public.practice_account_overview(%L)', _p));
    PERFORM pg_temp.assert(_st = _expect, 'overview as ' || _roles[_i] || ': ' || _expect || ' (' || _st || ')');
  END LOOP;
  _st := pg_temp.call_as(_o, 'SELECT public.practice_account_overview(gen_random_uuid())');
  PERFORM pg_temp.assert(_st = '42501', 'an unknown practice is refused the same way, so ids cannot be probed (' || _st || ')');
  _st := pg_temp.call_as(_o, 'SELECT public.practice_account_overview(NULL)');
  PERFORM pg_temp.assert(_st = '42501', 'a NULL practice is refused (' || _st || ')');

  -- Shape: the keys the Account page reads.
  _j := pg_temp.overview_as(_o, _p);
  PERFORM pg_temp.assert(pg_temp.keys_of(_j) = 'addons,members,partner,patients,practice,scribe,seats,storage,view',
    'top-level keys (' || pg_temp.keys_of(_j) || ')');
  PERFORM pg_temp.assert(_j->>'view' = 'full', 'an owner gets the full view');
  PERFORM pg_temp.assert(pg_temp.keys_of(_j->'practice') = 'clinical_seat_switch,id,name,tenant_type,tier',
    'practice keys (' || pg_temp.keys_of(_j->'practice') || ')');
  PERFORM pg_temp.assert(_j->'practice'->>'tenant_type' = 'practice' AND (_j->'practice'->>'clinical_seat_switch')::boolean = false,
    'a Practice tenant has no clinical-seat switch');
  PERFORM pg_temp.assert(pg_temp.keys_of(_j->'seats') = 'clinician,staff', 'seats keys');
  PERFORM pg_temp.assert(pg_temp.keys_of(_j->'seats'->'clinician') = 'addon_price_usd,included,limit,max,purchased,used',
    'clinician seat keys (' || pg_temp.keys_of(_j->'seats'->'clinician') || ')');
  PERFORM pg_temp.assert(pg_temp.keys_of(_j->'seats'->'staff') = 'limit,model,price_usd,purchased,used',
    'staff seat keys (' || pg_temp.keys_of(_j->'seats'->'staff') || ')');
  PERFORM pg_temp.assert(pg_temp.keys_of(_j->'patients') = 'limit,used', 'patients keys');
  PERFORM pg_temp.assert(pg_temp.keys_of(_j->'storage') = 'limit_gb,used_gb', 'storage keys');
  PERFORM pg_temp.assert(pg_temp.keys_of(_j->'scribe') =
      'allocated_minutes,allocation_exceeds_pool,included_minutes,pack_minutes_remaining,pack_minutes_total,per_member,period_end,period_start,pool_minutes,total_minutes,used_minutes',
    'scribe keys (' || pg_temp.keys_of(_j->'scribe') || ')');
  PERFORM pg_temp.assert(pg_temp.keys_of(_j->'partner') = 'referral_slug,revenue_share_pct,status', 'partner keys');
  PERFORM pg_temp.assert(pg_temp.keys_of(_j->'addons') = 'clinician_seats,extra_storage_gb,scribe_packs,staff_seats', 'addon keys');
  PERFORM pg_temp.assert(jsonb_typeof(_j->'members') = 'array' AND jsonb_array_length(_j->'members') = 6,
    'all six active members are listed (' || jsonb_array_length(_j->'members') || ')');
  PERFORM pg_temp.assert(pg_temp.keys_of(_j->'members'->0) = 'clinical_seat,is_clinical,name,role,scribe_cap_minutes,status,user_id',
    'member keys (' || pg_temp.keys_of(_j->'members'->0) || ')');
  PERFORM pg_temp.assert(_j->'members'->0->>'role' = 'owner' AND _j->'members'->0->>'name' = 'Olive Owner',
    'the owner is first, by name');
  PERFORM pg_temp.assert((_j->'seats'->'clinician'->>'included')::int = 3 AND (_j->'seats'->'clinician'->>'limit')::int = 5,
    'Pro: three included, this tenant stores five');
  PERFORM pg_temp.assert((_j->'scribe'->>'pool_minutes')::int = 900, 'Pro scribe pool is 900 minutes');
  PERFORM pg_temp.assert((_j->'partner'->>'status') = 'none', 'partner status starts at none');

  -- Billing sees the reduced set: totals, no people.
  _j := pg_temp.overview_as(_b, _p);
  PERFORM pg_temp.assert(_j->>'view' = 'billing', 'billing gets the billing view');
  PERFORM pg_temp.assert(jsonb_array_length(_j->'members') = 0 AND jsonb_array_length(_j->'scribe'->'per_member') = 0,
    'and no member list or per-person scribe use');
  PERFORM pg_temp.assert(pg_temp.keys_of(_j) = 'addons,members,partner,patients,practice,scribe,seats,storage,view',
    'with the same top-level shape');
  PERFORM pg_temp.assert((_j->'seats'->'clinician'->>'used')::int = 4, 'billing still sees the seat totals (owner, admin, provider, nurse: ' || (_j->'seats'->'clinician'->>'used') || ')');

  -- Hospital: the clinical-seat switch flag and tenant_type.
  _j := pg_temp.overview_as(_ho, _h);
  PERFORM pg_temp.assert(_j->'practice'->>'tenant_type' = 'hospital', 'a hospital says so');
  PERFORM pg_temp.assert((_j->'practice'->>'clinical_seat_switch')::boolean = true, 'and has the clinical-seat switch');
  PERFORM pg_temp.assert(_j->'seats'->'clinician'->>'max' IS NULL AND (_j->'seats'->'clinician'->>'purchased')::int = 0,
    'with no add-on seats to buy');
  PERFORM pg_temp.assert((_j->'seats'->'clinician'->>'limit')::int = 10, 'its stored limit stands');

  -- ======================================================================
  -- 2. set_scribe_member_cap: owner and admin; informational only
  -- ======================================================================
  FOR _i IN 1..array_length(_ids, 1) LOOP
    IF _roles[_i] IN ('owner','admin') THEN CONTINUE; END IF;
    _st := pg_temp.call_as(_ids[_i], format('SELECT public.set_scribe_member_cap(%L, %L, 60)', _p, _v));
    PERFORM pg_temp.assert(_st = '42501', 'set cap as ' || _roles[_i] || ' is refused (' || _st || ')');
  END LOOP;
  SELECT count(*) INTO _n_ FROM public.practice_scribe_allocations WHERE practice_id = _p;
  PERFORM pg_temp.assert(_n_ = 0, 'and nothing was written');

  _st := pg_temp.call_as(_o, format('SELECT public.set_scribe_member_cap(%L, %L, 60)', _p, _v));
  PERFORM pg_temp.assert(_st = 'ok', 'the owner sets a cap (' || _st || ')');
  _st := pg_temp.call_as(_a, format('SELECT public.set_scribe_member_cap(%L, %L, 90)', _p, _n));
  PERFORM pg_temp.assert(_st = 'ok', 'an admin sets a cap (' || _st || ')');
  _st := pg_temp.call_as(_o, format('SELECT public.set_scribe_member_cap(%L, %L, 10)', _p, _x));
  PERFORM pg_temp.assert(_st = '22023', 'a cap for someone outside the practice is refused (' || _st || ')');
  _st := pg_temp.call_as(_o, format('SELECT public.set_scribe_member_cap(%L, %L, -1)', _p, _v));
  PERFORM pg_temp.assert(_st = '22023', 'a negative cap is refused (' || _st || ')');
  _st := pg_temp.call_as(_o, format('SELECT public.set_scribe_member_cap(%L, %L, 1000001)', _p, _v));
  PERFORM pg_temp.assert(_st = '22023', 'and so is an absurd one (' || _st || ')');
  _st := pg_temp.call_as(_qa, format('SELECT public.set_scribe_member_cap(%L, %L, 5)', _q, _v));
  PERFORM pg_temp.assert(_st = '22023', 'another tenant''s admin cannot reach a person who is not in their practice (' || _st || ')');

  SELECT count(*) INTO _n_ FROM public.hipaa_audit_logs WHERE action = 'practice_scribe_cap_set' AND resource_id = _p::text;
  PERFORM pg_temp.assert(_n_ = 2, 'each change is audit-logged (' || _n_ || ')');
  SELECT string_agg(k, ',' ORDER BY k) INTO _k
    FROM (SELECT DISTINCT jsonb_object_keys(details) AS k FROM public.hipaa_audit_logs WHERE action = 'practice_scribe_cap_set') s;
  PERFORM pg_temp.assert(_k = 'cap_minutes,informational,member_user_id,practice_id,previous_cap_minutes',
    'and carries ids and minutes only, no PHI (' || _k || ')');

  _j := pg_temp.overview_as(_o, _p);
  PERFORM pg_temp.assert((_j->'scribe'->>'allocated_minutes')::int = 150, 'the overview adds the caps up (' || (_j->'scribe'->>'allocated_minutes') || ')');
  PERFORM pg_temp.assert((SELECT (m->>'scribe_cap_minutes')::int FROM jsonb_array_elements(_j->'members') m WHERE m->>'user_id' = _v::text) = 60,
    'a member row carries its cap');

  -- Informational: a cap and a pool change nothing about recording a session.
  PERFORM pg_temp.as_service();
  PERFORM public.record_scribe_usage(_v, _p, 'encounter', 86400, 'arp-req-1');
  PERFORM public.record_scribe_usage(_v, _p, 'encounter', 86400, 'arp-req-2');
  PERFORM public.record_scribe_usage(_v, _p, 'memo', 86400, 'arp-req-3');
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n_ FROM public.scribe_usage WHERE practice_id = _p;
  PERFORM pg_temp.assert(_n_ = 3, 'a provider who is over their cap and over the pool is still recorded (nothing blocks)');
  _j := pg_temp.overview_as(_o, _p);
  PERFORM pg_temp.assert((_j->'scribe'->>'used_minutes')::int = 4320, 'the overview counts the minutes (' || (_j->'scribe'->>'used_minutes') || ')');
  PERFORM pg_temp.assert((SELECT (m->>'used_minutes')::int FROM jsonb_array_elements(_j->'scribe'->'per_member') m WHERE m->>'user_id' = _v::text) = 4320
    AND (SELECT (m->>'cap_minutes')::int FROM jsonb_array_elements(_j->'scribe'->'per_member') m WHERE m->>'user_id' = _v::text) = 60,
    'per-member use sits beside the cap');
  PERFORM pg_temp.assert((_j->'scribe'->>'allocation_exceeds_pool')::boolean = false, 'caps within the pool: not flagged');
  _st := pg_temp.call_as(_o, format('SELECT public.set_scribe_member_cap(%L, %L, 2000)', _p, _v));
  _j := pg_temp.overview_as(_o, _p);
  PERFORM pg_temp.assert((_j->'scribe'->>'allocation_exceeds_pool')::boolean = true,
    'caps summing beyond the pool are flagged, not refused (' || (_j->'scribe'->>'allocated_minutes') || ' against ' || (_j->'scribe'->>'total_minutes') || ')');
  PERFORM pg_temp.as_service();
  _st := pg_temp.state_of(format('SELECT public.record_scribe_usage(%L, %L, ''dictation'', 600, ''arp-req-4'')', _v, _p));
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_st = 'ok', 'and recording still works');
  _st := pg_temp.call_as(_o, format('SELECT public.set_scribe_member_cap(%L, %L, NULL)', _p, _v));
  SELECT count(*) INTO _n_ FROM public.practice_scribe_allocations WHERE practice_id = _p AND user_id = _v;
  PERFORM pg_temp.assert(_st = 'ok' AND _n_ = 0, 'NULL clears a cap');

  -- ======================================================================
  -- 3. request_partnership: owner/admin; one open request
  -- ======================================================================
  FOR _i IN 1..array_length(_ids, 1) LOOP
    IF _roles[_i] IN ('owner','admin') THEN CONTINUE; END IF;
    _st := pg_temp.call_as(_ids[_i], format('SELECT public.request_partnership(%L, %L, %L)', _p, 'me@example.test', 'hello'));
    PERFORM pg_temp.assert(_st = '42501', 'partner request as ' || _roles[_i] || ' is refused (' || _st || ')');
  END LOOP;
  SELECT count(*) INTO _n_ FROM public.partner_requests WHERE practice_id = _p;
  PERFORM pg_temp.assert(_n_ = 0, 'and none was filed');
  _st := pg_temp.call_as(_o, format('SELECT public.request_partnership(%L, %L)', _p, 'x'));
  PERFORM pg_temp.assert(_st = '22023', 'a contact that short is refused (' || _st || ')');
  _st := pg_temp.call_as(_a, format('SELECT public.request_partnership(%L, %L, %L)', _p, 'admin@example.test', 'We refer patients'));
  PERFORM pg_temp.assert(_st = 'ok', 'an admin files a request (' || _st || ')');
  _st := pg_temp.call_as(_o, format('SELECT public.request_partnership(%L, %L)', _p, 'owner@example.test'));
  PERFORM pg_temp.assert(_st = '23505', 'a second while one is open is refused (' || _st || ')');
  SELECT count(*) INTO _n_ FROM public.partner_requests WHERE practice_id = _p AND status = 'open';
  PERFORM pg_temp.assert(_n_ = 1, 'exactly one is open');
  PERFORM pg_temp.assert((SELECT partner_status FROM public.practices WHERE id = _p) = 'requested', 'the practice shows requested');
  SELECT count(*) INTO _n_ FROM public.hipaa_audit_logs WHERE action = 'practice_partner_requested' AND resource_id = _p::text;
  PERFORM pg_temp.assert(_n_ = 1, 'the request is audit-logged');
  _j := pg_temp.overview_as(_b, _p);
  PERFORM pg_temp.assert(_j->'partner'->>'status' = 'requested', 'the overview shows requested');

  -- Two open requests for one practice cannot exist even by a direct write.
  _st := pg_temp.state_of(format('INSERT INTO public.partner_requests (practice_id, requested_by, contact) VALUES (%L, %L, %L)', _p, _o, 'dup@example.test'));
  PERFORM pg_temp.assert(_st = '23505', 'the single-open rule is a unique index, not only a check (' || _st || ')');

  -- A decision (platform side) moves it on; a decided request stays decided.
  UPDATE public.partner_requests SET status = 'declined', decided_at = now() WHERE practice_id = _p AND status = 'open';
  PERFORM pg_temp.assert((SELECT partner_status FROM public.practices WHERE id = _p) = 'none', 'a declined request returns the practice to none');
  _st := pg_temp.state_of(format('UPDATE public.partner_requests SET status = ''approved'' WHERE practice_id = %L', _p));
  PERFORM pg_temp.assert(_st = '22023', 'a decided request cannot be flipped (' || _st || ')');
  _st := pg_temp.call_as(_o, format('SELECT public.request_partnership(%L, %L)', _p, 'owner@example.test'));
  PERFORM pg_temp.assert(_st = 'ok', 'after a decline the owner may ask again (' || _st || ')');
  UPDATE public.partner_requests SET status = 'approved', decided_at = now() WHERE practice_id = _p AND status = 'open';
  PERFORM pg_temp.assert((SELECT partner_status FROM public.practices WHERE id = _p) = 'active', 'an approved request makes the practice an active partner');
  _st := pg_temp.call_as(_o, format('SELECT public.request_partnership(%L, %L)', _p, 'owner@example.test'));
  PERFORM pg_temp.assert(_st = '22023', 'an active partner cannot ask again (' || _st || ')');

  -- ======================================================================
  -- 4. Pinned columns: partner_status and referral_slug
  -- ======================================================================
  _m := pg_temp.call_as(_o, format('UPDATE public.practices SET referral_slug = ''grab-it'' WHERE id = %L', _p));
  PERFORM pg_temp.assert(_m = '42501', 'an owner cannot set the referral slug (' || _m || ')');
  _m := pg_temp.call_as(_o, format('UPDATE public.practices SET partner_status = ''requested'' WHERE id = %L', _p));
  PERFORM pg_temp.assert(_m = '42501', 'nor the partner status (' || _m || ')');
  _m := pg_temp.call_as(_o, format('UPDATE public.practices SET partner_status = ''none'' WHERE id = %L', _p));
  PERFORM pg_temp.assert(_m = '42501', 'nor back to "none" (' || _m || ')');
  _m := pg_temp.call_as(_a, format('UPDATE public.practices SET referral_slug = ''grab-it'' WHERE id = %L', _p));
  PERFORM pg_temp.assert(_m = '42501', 'nor an admin (' || _m || ')');
  _m := pg_temp.call_as(_o, format('INSERT INTO public.practices (name, created_by, partner_status) VALUES (%L, %L, ''active'')', 'Sneaky', _o));
  PERFORM pg_temp.assert(_m = '42501', 'nor on a new practice (' || _m || ')');
  _m := pg_temp.call_as(_o, format('INSERT INTO public.practices (name, created_by, referral_slug) VALUES (%L, %L, ''sneaky-one'')', 'Sneaky', _o));
  PERFORM pg_temp.assert(_m = '42501', 'nor a slug on a new practice (' || _m || ')');
  _m := pg_temp.call_as(_o, format('UPDATE public.practices SET name = %L WHERE id = %L', 'Account Practice Renamed', _p));
  PERFORM pg_temp.assert(_m = 'ok', 'ordinary settings stay editable (' || _m || ')');
  PERFORM pg_temp.as_service();
  UPDATE public.practices SET referral_slug = 'account-practice' WHERE id = _p;
  PERFORM pg_temp.as_user(NULL);
  _j := pg_temp.overview_as(_o, _p);
  PERFORM pg_temp.assert(_j->'partner'->>'referral_slug' = 'account-practice' AND _j->'partner'->>'status' = 'active',
    'the platform sets a slug and the active partner sees it');
  _j := pg_temp.overview_as(_b, _p);
  PERFORM pg_temp.assert(_j->'partner'->>'referral_slug' IS NULL, 'billing does not');
  PERFORM pg_temp.assert(_j->'partner'->>'revenue_share_pct' IS NULL, 'and no revenue percentage is shown to anyone by default');
  _st := pg_temp.state_of(format('UPDATE public.practices SET referral_slug = ''Bad Slug!'' WHERE id = %L', _p));
  PERFORM pg_temp.assert(_st = '23514', 'a malformed slug is refused by a check (' || _st || ')');
  _st := pg_temp.state_of(format('UPDATE public.practices SET referral_slug = ''account-practice'' WHERE id = %L', _q));
  PERFORM pg_temp.assert(_st = '23505', 'and a slug belongs to one practice (' || _st || ')');

  -- ======================================================================
  -- 5. apply_addon_change: the billing service only; idempotent
  -- ======================================================================
  FOR _i IN 1..array_length(_ids, 1) LOOP
    _st := pg_temp.call_as(_ids[_i], format('SELECT public.apply_addon_change(%L, ''clinician_seat'', 1, %L)', _p, 'evt_arp_auth_' || _i));
    PERFORM pg_temp.assert(_st = '42501', 'apply_addon_change as ' || _roles[_i] || ' is refused (' || _st || ')');
  END LOOP;
  _st := pg_temp.call_as(_pa, format('SELECT public.apply_addon_change(%L, ''clinician_seat'', 1, ''evt_arp_pa'')', _p));
  PERFORM pg_temp.assert(_st = '42501', 'even a platform admin''s session cannot (billing is a service call) (' || _st || ')');
  SELECT count(*) INTO _n_ FROM public.addon_events;
  PERFORM pg_temp.assert(_n_ = 0, 'nothing was recorded by any refused call');

  PERFORM pg_temp.as_service();
  _j := public.apply_addon_change(_p, 'clinician_seat', 1, 'evt_arp_1');
  PERFORM pg_temp.assert(_j->>'status' = 'applied', 'the service applies a seat (' || _j::text || ')');
  _j := public.apply_addon_change(_p, 'clinician_seat', 1, 'evt_arp_1');
  PERFORM pg_temp.assert(_j->>'status' = 'duplicate' AND _j->>'previous_status' = 'applied', 'the same Stripe event again is a duplicate (' || _j::text || ')');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert((SELECT clinician_seats_purchased FROM public.practices WHERE id = _p) = 1, 'and applied once');
  PERFORM pg_temp.assert((SELECT member_limit FROM public.practices WHERE id = _p) = 6, 'the stored limit moved with it (5 to 6)');
  -- Same event id for a different add-on is a different change.
  PERFORM pg_temp.as_service();
  _j := public.apply_addon_change(_p, 'staff_seat', 2, 'evt_arp_1');
  PERFORM pg_temp.assert(_j->>'status' = 'applied', 'one event may carry two different add-ons (' || _j::text || ')');
  _j := public.apply_addon_change(_p, 'staff_seat', -3, 'evt_arp_2');
  PERFORM pg_temp.assert(_j->>'status' = 'rejected_negative', 'staff seats cannot go below zero (' || _j::text || ')');
  _j := public.apply_addon_change(_p, 'staff_seat', 1, 'evt_arp_3');
  PERFORM pg_temp.assert(_j->>'status' = 'applied', 'three staff seats bought');
  PERFORM pg_temp.as_user(NULL);
  -- Two staff members now sit in those seats (nurse and front desk are staff? check by use).
  PERFORM pg_temp.as_service();
  _j := public.apply_addon_change(_p, 'staff_seat', -3, 'evt_arp_4');
  PERFORM pg_temp.assert(_j->>'status' = 'rejected_in_use',
    'dropping staff seats below those in use is rejected, never by removing people (' || _j::text || ')');
  _j := public.apply_addon_change(_p, 'staff_seat', 1, 'evt_arp_4');
  PERFORM pg_temp.assert(_j->>'status' = 'duplicate' AND _j->>'previous_status' = 'rejected_in_use',
    'a retry of a rejected event returns the same outcome (' || _j::text || ')');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert((SELECT count(*) FROM public.practice_members WHERE practice_id = _p AND status = 'active') = 6,
    'no member was removed by any of it');

  PERFORM pg_temp.as_service();
  _j := public.apply_addon_change(_p, 'scribe_pack', 1, 'evt_arp_5', 500);
  PERFORM pg_temp.assert(_j->>'status' = 'applied', 'a scribe pack is applied (' || _j::text || ')');
  _j := public.apply_addon_change(_p, 'scribe_pack', 1, 'evt_arp_6');
  PERFORM pg_temp.assert(_j->>'status' = 'invalid', 'a pack with no minutes is invalid (' || _j::text || ')');
  _j := public.apply_addon_change(_p, 'storage_pack', 1, 'evt_arp_7');
  PERFORM pg_temp.assert(_j->>'status' = 'unknown_addon', 'there is no server-side storage pack (' || _j::text || ')');
  _j := public.apply_addon_change(_p, 'clinician_seat', 0, 'evt_arp_8');
  PERFORM pg_temp.assert(_j->>'status' = 'invalid', 'a zero quantity is invalid (' || _j::text || ')');
  _j := public.apply_addon_change(gen_random_uuid(), 'clinician_seat', 1, 'evt_arp_9');
  PERFORM pg_temp.assert(_j->>'status' = 'unknown_practice', 'an unknown practice is recorded as such (' || _j::text || ')');
  _j := public.apply_addon_change(_h, 'staff_seat', 1, 'evt_arp_10');
  PERFORM pg_temp.assert(_j->>'status' = 'not_applicable', 'a hospital has no add-on seats (' || _j::text || ')');
  _st := pg_temp.state_of(format('SELECT public.apply_addon_change(%L, ''clinician_seat'', 1, '''')', _p));
  PERFORM pg_temp.assert(_st = '22023', 'an empty Stripe event id is refused (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n_ FROM public.scribe_packs WHERE practice_id = _p;
  PERFORM pg_temp.assert(_n_ = 1, 'one pack row, and only from the applied event');
  PERFORM pg_temp.assert((SELECT stripe_ref FROM public.scribe_packs WHERE practice_id = _p) = 'evt_arp_5', 'tied to its event');

  _j := pg_temp.overview_as(_o, _p);
  PERFORM pg_temp.assert((_j->'scribe'->>'pack_minutes_total')::int = 500 AND (_j->'scribe'->>'total_minutes')::int = 1400,
    'the overview shows the pack beside the pool (' || (_j->'scribe'->>'total_minutes') || ')');
  PERFORM pg_temp.assert((_j->'seats'->'staff'->>'purchased')::int = 3 AND (_j->'addons'->>'clinician_seats')::int = 1,
    'and the seat add-ons');
  PERFORM pg_temp.assert(jsonb_array_length(_j->'addons'->'scribe_packs') = 1, 'and lists the pack');
  PERFORM pg_temp.assert((_j->'addons'->>'extra_storage_gb')::numeric = 10, 'one clinician seat is 10 GB of storage');

  -- ======================================================================
  -- 6. RLS: each tenant reads its own rows and nothing of another's
  -- ======================================================================
  PERFORM pg_temp.as_service();
  PERFORM public.apply_addon_change(_q, 'scribe_pack', 1, 'evt_arp_q1', 100);
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.partner_requests (practice_id, requested_by, contact) VALUES (_q, _qa, 'q@example.test');
  INSERT INTO public.practice_scribe_allocations (practice_id, user_id, cap_minutes) VALUES (_q, _qa, 5);

  PERFORM pg_temp.assert(pg_temp.count_as(_o, 'scribe_packs') = 1, 'an owner reads their own packs (and not the other tenant''s)');
  PERFORM pg_temp.assert(pg_temp.count_as(_qa, 'scribe_packs') = 1, 'the other tenant''s admin reads theirs');
  PERFORM pg_temp.assert(pg_temp.count_as(_a, 'partner_requests') = 2, 'an admin reads their practice''s requests (' || pg_temp.count_as(_a, 'partner_requests') || ')');
  PERFORM pg_temp.assert(pg_temp.count_as(_qa, 'partner_requests') = 1, 'the other tenant sees only its own request');
  PERFORM pg_temp.assert(pg_temp.count_as(_v, 'scribe_packs') = 0 AND pg_temp.count_as(_v, 'partner_requests') = 0,
    'a provider reads neither packs nor requests');
  PERFORM pg_temp.assert(pg_temp.count_as(_b, 'partner_requests') = 0, 'nor does billing read partner requests');
  PERFORM pg_temp.assert(pg_temp.count_as(_x, 'scribe_packs') = 0 AND pg_temp.count_as(_pt, 'partner_requests') = 0
                         AND pg_temp.count_as(_x, 'practice_scribe_allocations') = 0,
    'a non-member and a patient read none of it');
  PERFORM pg_temp.assert(pg_temp.count_as(_qa, 'practice_scribe_allocations') = 1, 'the other tenant''s admin reads their allocations only');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.call_as(_o, format('SELECT public.set_scribe_member_cap(%L, %L, 40)', _p, _v));
  PERFORM pg_temp.assert(pg_temp.count_as(_v, 'practice_scribe_allocations') = 1, 'a member reads their own cap and no one else''s');
  PERFORM pg_temp.assert(pg_temp.count_as(_o, 'practice_scribe_allocations') = 2, 'an owner reads every cap in their practice (' || pg_temp.count_as(_o, 'practice_scribe_allocations') || ')');

  _st := pg_temp.call_as(_o, 'SELECT count(*) FROM public.addon_events');
  PERFORM pg_temp.assert(_st = '42501', 'no signed-in role can read the billing event log (' || _st || ')');
  _st := pg_temp.call_as(NULL, 'SELECT count(*) FROM public.scribe_packs');
  PERFORM pg_temp.assert(_st = '42501', 'anon reads no packs (' || _st || ')');
  _st := pg_temp.call_as(_o, format('INSERT INTO public.scribe_packs (practice_id, minutes) VALUES (%L, 100000)', _p));
  PERFORM pg_temp.assert(_st = '42501', 'a client cannot grant itself scribe minutes (' || _st || ')');
  _st := pg_temp.call_as(_o, format('UPDATE public.scribe_packs SET minutes = 100000 WHERE practice_id = %L', _p));
  PERFORM pg_temp.assert(_st = '42501', 'nor edit a pack (' || _st || ')');
  _st := pg_temp.call_as(_o, format('INSERT INTO public.practice_scribe_allocations (practice_id, user_id, cap_minutes) VALUES (%L, %L, 1)', _p, _f));
  PERFORM pg_temp.assert(_st = '42501', 'nor write an allocation except through set_scribe_member_cap (' || _st || ')');
  _st := pg_temp.call_as(_o, format('UPDATE public.partner_requests SET status = ''approved'' WHERE practice_id = %L', _p));
  PERFORM pg_temp.assert(_st = '42501', 'nor approve its own partner request (' || _st || ')');
  _st := pg_temp.call_as(_o, format('INSERT INTO public.partner_requests (practice_id, requested_by, contact) VALUES (%L, %L, ''x@example.test'')', _p, _o));
  PERFORM pg_temp.assert(_st = '42501', 'nor file one except through request_partnership (' || _st || ')');
END $$;

ROLLBACK;
