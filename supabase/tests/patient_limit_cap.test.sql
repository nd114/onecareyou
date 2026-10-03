-- The published patient cap is enforced by the database, and only for NEW
-- connections. Reads, updates, revocations, the patient's own data and every
-- existing connection are untouched; a revoked share frees its slot; accounts
-- already over the cap are grandfathered; the platform (service role, admin)
-- is trusted; the numbers come from tier_limits so a change is a data edit.

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

-- The SQLSTATE a statement fails with, or 'ok' when it runs.
CREATE OR REPLACE FUNCTION pg_temp.state_of(_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.add_share(_patient uuid, _clin uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT pg_temp.state_of(format(
    'INSERT INTO public.provider_shares (user_id, provider_name, provider_email, invite_code, clinician_user_id)
     VALUES (%L, ''Dr Cap'', ''plc-doc@test.local'', %L, %L)',
    _patient, 'plc-' || gen_random_uuid()::text, _clin))
$$;

DO $$
DECLARE
  _doc   uuid := 'b1000000-0000-4000-8000-000000000001';
  _enter uuid := 'b1000000-0000-4000-8000-000000000002';
  _adm   uuid := 'b1000000-0000-4000-8000-000000000003';
  _p     uuid[] := ARRAY[
    'b1000000-0000-4000-8000-0000000000a1','b1000000-0000-4000-8000-0000000000a2',
    'b1000000-0000-4000-8000-0000000000a3','b1000000-0000-4000-8000-0000000000a4',
    'b1000000-0000-4000-8000-0000000000a5','b1000000-0000-4000-8000-0000000000a6',
    'b1000000-0000-4000-8000-0000000000a7','b1000000-0000-4000-8000-0000000000a8',
    'b1000000-0000-4000-8000-0000000000a9']::uuid[];
  _hosp  uuid := 'b1000000-0000-4000-8000-0000000000c1';
  _i int; _n int; _st text;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_doc, 'plc-doc@test.local', now()), (_enter, 'plc-enterprise@test.local', now()),
    (_adm, 'plc-adm@test.local', now());
  FOR _i IN 1..9 LOOP
    INSERT INTO auth.users (id, email, email_confirmed_at)
    VALUES (_p[_i], format('plc-pat%s@test.local', _i), now());
  END LOOP;
  -- A fresh trial: five patients.
  INSERT INTO public.clinician_profiles (user_id, first_name) VALUES (_doc, 'Cap');
  INSERT INTO public.clinician_profiles (user_id, first_name, subscription_tier, patient_limit)
  VALUES (_enter, 'Enterprise', 'enterprise', 999999);
  INSERT INTO public.user_roles (user_id, role) VALUES (_adm, 'admin');

  -- Five live connections, set up by the platform.
  PERFORM pg_temp.as_user(NULL);
  FOR _i IN 1..5 LOOP
    INSERT INTO public.provider_shares (user_id, provider_name, provider_email, invite_code, clinician_user_id)
    VALUES (_p[_i], 'Dr Cap', 'plc-doc@test.local', 'plc-seed-' || _i, _doc);
  END LOOP;

  -- ======================================================================
  -- 1. A direct API call over the cap is refused, by name
  -- ======================================================================
  PERFORM pg_temp.as_user(_p[6]);
  _st := pg_temp.add_share(_p[6], _doc);
  PERFORM pg_temp.assert(_st = 'OC001', 'a sixth patient on a five-patient trial is refused with patient_limit_reached (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.provider_shares WHERE clinician_user_id = _doc;
  PERFORM pg_temp.assert(_n = 5, 'and nothing was created');

  -- ======================================================================
  -- 2. Reads and updates still work at the cap
  -- ======================================================================
  PERFORM pg_temp.as_user(_doc);
  SELECT count(*) INTO _n FROM public.provider_shares;
  PERFORM pg_temp.assert(_n = 5, 'the clinician still reads all five connections at the cap');
  UPDATE public.provider_shares SET clinician_notes = 'seen' WHERE clinician_user_id = _doc;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 5, 'the clinician can still update their connections at the cap');

  -- ======================================================================
  -- 3. The patient's own data is unaffected
  -- ======================================================================
  PERFORM pg_temp.as_user(_p[1]);
  SELECT count(*) INTO _n FROM public.provider_shares WHERE user_id = _p[1];
  PERFORM pg_temp.assert(_n = 1, 'a connected patient still reads their own share');
  UPDATE public.provider_shares SET permissions = '{"meds": true, "vitals": false, "profile": false, "adherence": true}'
   WHERE user_id = _p[1];
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 1, 'a connected patient can still change what they share');

  -- ======================================================================
  -- 4. A second route to an already-connected patient takes no new slot
  -- ======================================================================
  PERFORM pg_temp.as_user(_p[2]);
  _st := pg_temp.add_share(_p[2], _doc);
  PERFORM pg_temp.assert(_st = 'ok', 'an already-counted patient can add another share at the cap (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public._personal_patient_keys(_doc);
  PERFORM pg_temp.assert(_n = 5, 'and is still counted once');

  -- ======================================================================
  -- 5. Revoking frees a slot at once
  -- ======================================================================
  PERFORM pg_temp.as_user(_p[1]);
  UPDATE public.provider_shares SET is_active = false, revoked_at = now() WHERE user_id = _p[1];
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 1, 'a patient can revoke at the cap');
  PERFORM pg_temp.as_user(_p[6]);
  _st := pg_temp.add_share(_p[6], _doc);
  PERFORM pg_temp.assert(_st = 'ok', 'the freed slot is available immediately (' || _st || ')');
  PERFORM pg_temp.as_user(_p[7]);
  _st := pg_temp.add_share(_p[7], _doc);
  PERFORM pg_temp.assert(_st = 'OC001', 'and only that one (' || _st || ')');

  -- Re-activating a revoked share is a new addition and respects the cap.
  PERFORM pg_temp.as_user(_p[1]);
  _st := pg_temp.state_of(format(
    'UPDATE public.provider_shares SET is_active = true, revoked_at = NULL WHERE user_id = %L', _p[1]));
  PERFORM pg_temp.assert(_st = 'OC001', 're-activating a revoked share at the cap is refused (' || _st || ')');

  -- ======================================================================
  -- 6. Managed records count too, and are refused over the cap
  -- ======================================================================
  PERFORM pg_temp.as_user(_doc);
  _st := pg_temp.state_of(format(
    'INSERT INTO public.clinician_patient_records (clinician_user_id, patient_name) VALUES (%L, ''Managed One'')', _doc));
  PERFORM pg_temp.assert(_st = 'OC001', 'a managed record over the cap is refused (' || _st || ')');
  SELECT count(*) INTO _n FROM public.clinician_patient_records;
  PERFORM pg_temp.assert(_n = 0, 'and none was created');

  -- ======================================================================
  -- 7. Grandfathering: over the cap, everything existing keeps working
  -- ======================================================================
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.provider_shares (user_id, provider_name, provider_email, invite_code, clinician_user_id)
  VALUES (_p[7], 'Dr Cap', 'plc-doc@test.local', 'plc-grand-7', _doc),
         (_p[8], 'Dr Cap', 'plc-doc@test.local', 'plc-grand-8', _doc);
  SELECT count(*) INTO _n FROM public._personal_patient_keys(_doc);
  PERFORM pg_temp.assert(_n = 7, 'the account is now over its cap of 5 (7 active patients)');
  PERFORM pg_temp.as_user(_doc);
  SELECT count(*) INTO _n FROM public.provider_shares WHERE is_active;
  PERFORM pg_temp.assert(_n >= 7, 'a grandfathered clinician still reads every connection');
  UPDATE public.provider_shares SET clinician_notes = 'still mine' WHERE clinician_user_id = _doc AND is_active;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n >= 7, 'and still updates them');
  PERFORM pg_temp.as_user(_p[9]);
  _st := pg_temp.add_share(_p[9], _doc);
  PERFORM pg_temp.assert(_st = 'OC001', 'but no new patient is added while over the cap (' || _st || ')');
  -- Drop below the cap and room opens up again.
  FOREACH _i IN ARRAY ARRAY[8, 7, 6] LOOP
    PERFORM pg_temp.as_user(_p[_i]);
    UPDATE public.provider_shares SET is_active = false, revoked_at = now() WHERE user_id = _p[_i];
  END LOOP;
  PERFORM pg_temp.as_user(_p[9]);
  _st := pg_temp.add_share(_p[9], _doc);
  PERFORM pg_temp.assert(_st = 'ok', 'once active patients fall below the cap a new one is accepted again (' || _st || ')');

  -- ======================================================================
  -- 8. The platform is trusted
  -- ======================================================================
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.provider_shares SET is_active = true, revoked_at = NULL WHERE user_id IN (_p[6], _p[7], _p[8]);
  SELECT count(*) INTO _n FROM public._personal_patient_keys(_doc);
  PERFORM pg_temp.assert(_n >= 7, 'the platform can re-activate beyond the cap (' || _n || ' active)');
  PERFORM pg_temp.as_service();
  _st := pg_temp.state_of(format(
    'INSERT INTO public.clinician_patient_records (clinician_user_id, patient_name) VALUES (%L, ''Imported'')', _doc));
  PERFORM pg_temp.assert(_st = 'ok', 'service_role (the import function) is not refused (' || _st || ')');
  -- A platform admin is trusted as well (here acting on their own share).
  PERFORM pg_temp.as_user(_adm);
  _st := pg_temp.add_share(_adm, _doc);
  PERFORM pg_temp.assert(_st = 'ok', 'a platform admin is not refused (' || _st || ')');

  -- ======================================================================
  -- 9. Unlimited means no cap
  -- ======================================================================
  PERFORM pg_temp.as_user(_p[3]);
  _st := pg_temp.add_share(_p[3], _enter);
  PERFORM pg_temp.assert(_st = 'ok', 'an enterprise clinician has no cap (' || _st || ')');

  -- ======================================================================
  -- 10. The numbers are data: change a row, not code
  -- ======================================================================
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.tier_limits SET patient_limit = 500 WHERE tier = 'trial';
  UPDATE public.provider_shares SET is_active = false, revoked_at = now() WHERE user_id = _p[9] AND clinician_user_id = _doc;
  PERFORM pg_temp.as_user(_p[9]);
  _st := pg_temp.state_of(format(
    'UPDATE public.provider_shares SET is_active = true, revoked_at = NULL WHERE user_id = %L AND clinician_user_id = %L', _p[9], _doc));
  PERFORM pg_temp.assert(_st = 'ok', 'raising tier_limits raises the cap without a code change (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.tier_limits SET patient_limit = 0 WHERE tier = 'trial';
  PERFORM pg_temp.as_user(_p[4]);
  _st := pg_temp.add_share(_p[4], _doc);
  PERFORM pg_temp.assert(_st = 'ok', 'a patient who is already counted is not refused even at a zero cap (' || _st || ')');
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.tier_limits SET patient_limit = 5 WHERE tier = 'trial';

  -- ======================================================================
  -- 11. A practice or hospital cap, deduplicated by patient
  -- ======================================================================
  INSERT INTO public.practices (id, name, created_by, tenant_type, patient_limit, member_limit)
  VALUES (_hosp, 'Cap General', _doc, 'hospital', 2, 10);
  INSERT INTO public.practice_shares (practice_id, user_id) VALUES (_hosp, _p[1]), (_hosp, _p[2]);

  PERFORM pg_temp.as_user(_p[5]);
  _st := pg_temp.state_of(format(
    'INSERT INTO public.practice_shares (practice_id, user_id) VALUES (%L, %L)', _hosp, _p[5]));
  PERFORM pg_temp.assert(_st = 'OC001', 'a third patient on a two-patient hospital is refused (' || _st || ')');
  PERFORM pg_temp.as_user(_p[1]);
  SELECT count(*) INTO _n FROM public.practice_shares WHERE user_id = _p[1];
  PERFORM pg_temp.assert(_n = 1, 'a connected patient still reads their own practice share');
  UPDATE public.practice_shares SET is_active = false, revoked_at = now() WHERE user_id = _p[1];
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 1, 'and can still revoke it');
  PERFORM pg_temp.as_user(_p[5]);
  _st := pg_temp.state_of(format(
    'INSERT INTO public.practice_shares (practice_id, user_id) VALUES (%L, %L)', _hosp, _p[5]));
  PERFORM pg_temp.assert(_st = 'ok', 'revoking freed the hospital slot (' || _st || ')');
  PERFORM pg_temp.as_user(_p[1]);
  _st := pg_temp.state_of(format(
    'UPDATE public.practice_shares SET is_active = true, revoked_at = NULL WHERE user_id = %L', _p[1]));
  PERFORM pg_temp.assert(_st = 'OC001', 'a patient cannot reconnect to a full hospital (' || _st || ')');
  PERFORM pg_temp.as_service();
  _st := pg_temp.state_of(format(
    'UPDATE public.practice_shares SET is_active = true, revoked_at = NULL WHERE user_id = %L', _p[1]));
  PERFORM pg_temp.assert(_st = 'ok', 'service_role can (' || _st || ')');
END $$;

-- The helpers behind the caps are not callable by clients.
DO $$
BEGIN
  PERFORM pg_temp.assert(NOT has_function_privilege('authenticated', 'public._personal_patient_count(uuid)', 'EXECUTE'),
    'a client cannot count another clinician''s patients');
  PERFORM pg_temp.assert(NOT has_function_privilege('anon', 'public._practice_limits(uuid)', 'EXECUTE'),
    'anon cannot read practice limits');
  PERFORM pg_temp.assert(NOT has_function_privilege('authenticated', 'public._check_personal_patient_cap(uuid,text)', 'EXECUTE'),
    'a client cannot call the cap check directly');
END $$;

ROLLBACK;
