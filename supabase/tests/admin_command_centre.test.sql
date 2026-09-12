-- Founder command centre, phases 2 and 3.
--
-- The console is the one surface that reads across every tenant at once, so
-- the thing worth testing is not that the numbers render — it is that nobody
-- without the platform-admin role can ask for them, and that what comes back
-- is counts and states rather than anybody's record.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/admin_command_centre.test.sql

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(_condition boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _condition IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED: %', _label;
  END IF;
  RAISE NOTICE '  ok — %', _label;
END;
$$;

-- Calls the named zero-argument-ish RPC and reports whether it refused.
CREATE OR REPLACE FUNCTION pg_temp.refused(_sql text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  RETURN true;
END;
$$;

DO $$
DECLARE
  _admin    uuid := 'd0000000-0000-0000-0000-000000000001';
  _outsider uuid := 'd0000000-0000-0000-0000-000000000002';
  _patient  uuid := 'd0000000-0000-0000-0000-000000000003';
  _doctor   uuid := 'd0000000-0000-0000-0000-000000000004';
  _hosp     uuid := 'd1111111-0000-0000-0000-000000000001';
  _share    uuid;
  _pshare   uuid;
  _profile_id uuid;
  _revoked_by uuid;
  _share2   uuid;
  _share3   uuid;
  _moved    uuid;
  _ends     timestamptz;
  _ends2    timestamptz;
  _count    bigint;
  _int      integer;
  _json     jsonb;
  _txt      text;
  _bool     boolean;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_admin,    'cc-admin@test.local'),
    (_outsider, 'cc-outsider@test.local'),
    (_patient,  'cc-patient@test.local'),
    (_doctor,   'cc-doctor@test.local');

  INSERT INTO public.user_roles (user_id, role) VALUES (_admin, 'admin');

  INSERT INTO public.practices (id, name, tenant_type, created_by, storage_limit_gb,
                                subscription_tier, revenue_share_pct)
  VALUES (_hosp, 'Command Centre Test Hospital', 'hospital', _admin, 100, 'trial', 12);

  INSERT INTO public.clinician_profiles (user_id, practice_name, specialty, subscription_tier)
  VALUES (_doctor, 'Test Clinic', 'Cardiology', 'solo');

  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES (_patient, _doctor, 'Dr Command', 'cc-doctor@test.local', 'cctest1',
          '{"vitals":true,"meds":true,"adherence":false}'::jsonb, true)
  RETURNING id INTO _share;

  INSERT INTO public.practice_shares (practice_id, user_id, permissions, is_active, share_all)
  VALUES (_hosp, _patient, '{"vitals":true}'::jsonb, true, false)
  RETURNING id INTO _pshare;

  -- ==========================================================================
  -- 1. Nothing in the command centre answers somebody without the role
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _outsider::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  PERFORM pg_temp.assert(pg_temp.refused('SELECT public.admin_revenue_overview()'),
    'a non-admin cannot read the revenue overview');
  PERFORM pg_temp.assert(pg_temp.refused('SELECT * FROM public.admin_revenue_tenants()'),
    'a non-admin cannot list tenant billing');
  PERFORM pg_temp.assert(pg_temp.refused(
    format('SELECT public.admin_extend_trial(%L, 7)', _hosp)),
    'a non-admin cannot extend a trial');
  PERFORM pg_temp.assert(pg_temp.refused(
    'SELECT * FROM public.admin_accounts_directory(''all'', NULL, 5, 0)'),
    'a non-admin cannot page the accounts directory');
  PERFORM pg_temp.assert(pg_temp.refused(
    format('SELECT public.admin_account_detail(''tenant'', %L)', _hosp)),
    'a non-admin cannot open an account');
  PERFORM pg_temp.assert(pg_temp.refused('SELECT public.admin_reliability_overview()'),
    'a non-admin cannot read reliability');
  PERFORM pg_temp.assert(pg_temp.refused('SELECT * FROM public.admin_sync_failures(5)'),
    'a non-admin cannot list sync failures');
  PERFORM pg_temp.assert(pg_temp.refused(
    format('SELECT public.admin_requeue_ehr_exports(%L)', _hosp)),
    'a non-admin cannot requeue exports');
  PERFORM pg_temp.assert(pg_temp.refused('SELECT public.admin_trust_overview()'),
    'a non-admin cannot read the trust overview');
  PERFORM pg_temp.assert(pg_temp.refused(
    'SELECT * FROM public.admin_access_reviews(NULL, 5, 0)'),
    'a non-admin cannot run an access review');
  PERFORM pg_temp.assert(pg_temp.refused(
    format('SELECT public.admin_revoke_patient_share(''clinician'', %L, ''test'')', _share)),
    'a non-admin cannot revoke somebody else''s share');
  PERFORM pg_temp.assert(pg_temp.refused(
    'SELECT * FROM public.admin_audit_export(NULL, NULL, NULL, 10)'),
    'a non-admin cannot export the audit log');

  -- The refusal is real, not merely an empty result: the share still stands.
  EXECUTE 'SET LOCAL ROLE postgres';
  SELECT is_active INTO _bool FROM public.provider_shares WHERE id = _share;
  PERFORM pg_temp.assert(_bool, 'the refused revoke left the share active');

  -- ==========================================================================
  -- 2. The admin sees the tenant, and sees it once
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _admin::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO _count FROM public.admin_revenue_tenants() WHERE id = _hosp;
  PERFORM pg_temp.assert(_count = 1, 'the tenant appears once in the billing list');

  SELECT revenue_share_pct INTO _int FROM public.admin_revenue_tenants() WHERE id = _hosp;
  PERFORM pg_temp.assert(_int = 12, 'the revenue share carries through');

  SELECT connected_patients INTO _count FROM public.admin_revenue_tenants() WHERE id = _hosp;
  PERFORM pg_temp.assert(_count = 1, 'the institution share counts as a connection');

  -- ==========================================================================
  -- 3. Extending a trial measures from today, not from a lapsed date
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE postgres';
  UPDATE public.practices SET subscription_ends_at = now() - interval '30 days' WHERE id = _hosp;
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT public.admin_extend_trial(_hosp, 14) INTO _ends;
  PERFORM pg_temp.assert(_ends > now() + interval '13 days',
    'extending a lapsed trial by 14 days lands 14 days from now, not in the past');

  -- A live trial extends from where it already ends.
  SELECT public.admin_extend_trial(_hosp, 7) INTO _ends2;
  PERFORM pg_temp.assert(_ends2 > _ends, 'a second extension adds to the first');

  PERFORM pg_temp.assert(pg_temp.refused(format('SELECT public.admin_extend_trial(%L, 0)', _hosp)),
    'extending by zero days is refused');
  PERFORM pg_temp.assert(pg_temp.refused(format('SELECT public.admin_extend_trial(%L, 4000)', _hosp)),
    'extending by four thousand days is refused');

  EXECUTE 'SET LOCAL ROLE postgres';
  SELECT count(*) INTO _count FROM public.platform_admin_actions
   WHERE action = 'extend_trial' AND target_id = _hosp;
  PERFORM pg_temp.assert(_count = 2, 'both extensions left an admin-action entry');
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- ==========================================================================
  -- 4. The directory lists a clinician as a clinician, and only once
  -- ==========================================================================
  SELECT count(*) INTO _count
    FROM public.admin_accounts_directory('all', 'cc-doctor@test.local', 50, 0);
  PERFORM pg_temp.assert(_count = 1,
    'a clinician with a patient profile row is listed once, not twice');

  SELECT kind INTO _txt
    FROM public.admin_accounts_directory('all', 'cc-doctor@test.local', 50, 0) LIMIT 1;
  PERFORM pg_temp.assert(_txt = 'clinician', 'and is listed as a clinician');

  SELECT count(*) INTO _count
    FROM public.admin_accounts_directory('patient', 'cc-doctor@test.local', 50, 0);
  PERFORM pg_temp.assert(_count = 0, 'filtering to patients excludes the clinician');

  SELECT count(*) INTO _count
    FROM public.admin_accounts_directory('tenant', 'Command Centre', 50, 0);
  PERFORM pg_temp.assert(_count = 1, 'searching tenants by name finds the hospital');

  -- total_count describes the whole result, not the page. Both fixtures share
  -- the test.local domain, so this also exercises 'all' spanning two kinds.
  SELECT total_count INTO _count
    FROM public.admin_accounts_directory('all', 'test.local', 1, 0) LIMIT 1;
  PERFORM pg_temp.assert(_count > 1, 'total_count counts past the end of the page');

  PERFORM pg_temp.assert(pg_temp.refused(
    'SELECT * FROM public.admin_accounts_directory(''hacker'', NULL, 5, 0)'),
    'an unknown account kind is refused rather than silently widened');

  -- ==========================================================================
  -- 5. Opening an account shows counts, never content
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE postgres';
  INSERT INTO public.medications (user_id, name, dosage, frequency)
  VALUES (_patient, 'Amlodipine', '5 mg', 'daily');
  -- Read the profile id here: as `authenticated` the admin's own row policy on
  -- profiles would hide it, which would make this a test of RLS, not of the RPC.
  SELECT id INTO _profile_id FROM public.profiles WHERE user_id = _patient;
  EXECUTE 'SET LOCAL ROLE authenticated';

  PERFORM pg_temp.assert(_profile_id IS NOT NULL, 'the patient has a profile row to open');
  SELECT public.admin_account_detail('patient', _profile_id) INTO _json;

  PERFORM pg_temp.assert((_json->'record_counts'->>'medications')::int = 1,
    'the drawer counts the medication');
  PERFORM pg_temp.assert(_json::text NOT ILIKE '%Amlodipine%',
    'the drawer never names the medication');

  -- ==========================================================================
  -- 6. An access review shows the grant, not what the grant opens — and only
  --    once you already know one of the two parties (section 11 covers that
  --    gate directly; every lookup here searches for a party by design).
  -- ==========================================================================
  SELECT count(*) INTO _count
    FROM public.admin_access_reviews('cc-doctor@test.local', 50, 0)
   WHERE share_id = _share;
  PERFORM pg_temp.assert(_count = 1, 'searching the clinician finds the share in the access review');

  SELECT permission_count INTO _int
    FROM public.admin_access_reviews('cc-doctor@test.local', 50, 0)
   WHERE share_id = _share;
  PERFORM pg_temp.assert(_int = 2,
    'the review counts the two granted categories and not the third');

  SELECT count(*) INTO _count
    FROM public.admin_access_reviews('Command Centre', 50, 0)
   WHERE share_id = _pshare AND share_type = 'institution';
  PERFORM pg_temp.assert(_count = 1, 'searching the institution finds its share too');

  -- ==========================================================================
  -- 7. Revoking from the console narrows access, and says who and why
  -- ==========================================================================
  PERFORM pg_temp.assert(pg_temp.refused(
    format('SELECT public.admin_revoke_patient_share(''clinician'', %L, ''   '')', _share)),
    'revoking without a reason is refused');

  PERFORM public.admin_revoke_patient_share('clinician', _share, 'Clinician account compromised');

  EXECUTE 'SET LOCAL ROLE postgres';
  SELECT is_active, revoke_reason, revoked_by INTO _bool, _txt, _revoked_by
    FROM public.provider_shares WHERE id = _share;
  PERFORM pg_temp.assert(NOT _bool, 'the share is closed');
  PERFORM pg_temp.assert(_txt = 'Clinician account compromised', 'the reason is recorded on the share');
  PERFORM pg_temp.assert(_revoked_by = _admin, 'the admin who closed it is named on the share');

  SELECT count(*) INTO _count FROM public.platform_admin_actions
   WHERE action = 'revoke_patient_share' AND target_id = _share;
  PERFORM pg_temp.assert(_count = 1, 'and the revocation is in the admin action log');
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO _count
    FROM public.admin_access_reviews('cc-doctor@test.local', 50, 0)
   WHERE share_id = _share;
  PERFORM pg_temp.assert(_count = 0, 'a closed share drops out of the access review');

  PERFORM pg_temp.assert(pg_temp.refused(
    format('SELECT public.admin_revoke_patient_share(''clinician'', %L, ''again'')', _share)),
    'revoking an already closed share is refused rather than logged twice');

  -- ==========================================================================
  -- 8. The audit export carries the action, never the details column
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE postgres';
  INSERT INTO public.hipaa_audit_logs (user_id, action, resource_type, patient_user_id, details)
  VALUES (_doctor, 'view_record', 'medications', _patient,
          '{"note":"SECRETCLINICALDETAIL"}'::jsonb);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO _count FROM public.admin_audit_export(NULL, NULL, 'view_record', 100);
  PERFORM pg_temp.assert(_count >= 1, 'the export finds the entry by action');

  SELECT string_agg(x::text, ' ') INTO _txt
    FROM public.admin_audit_export(NULL, NULL, NULL, 100) x;
  PERFORM pg_temp.assert(_txt NOT ILIKE '%SECRETCLINICALDETAIL%',
    'the export never carries the details column out with it');

  SELECT count(*) INTO _count
    FROM public.admin_audit_export(now() + interval '1 day', now() + interval '2 days', NULL, 100);
  PERFORM pg_temp.assert(_count = 0, 'a window in the future returns nothing');

  -- ==========================================================================
  -- 9. The overviews answer for an admin
  -- ==========================================================================
  SELECT public.admin_revenue_overview() INTO _json;
  PERFORM pg_temp.assert(_json ? 'tenants_by_tier' AND _json ? 'invoices' AND _json ? 'storage',
    'the revenue overview answers with its sections');

  SELECT public.admin_reliability_overview() INTO _json;
  PERFORM pg_temp.assert(_json ? 'record_exchange' AND _json ? 'export_queue' AND _json ? 'sign_in',
    'the reliability overview answers with its sections');

  SELECT public.admin_trust_overview() INTO _json;
  PERFORM pg_temp.assert((_json->'shares'->>'institution_active')::int >= 1,
    'the trust overview counts the live institution share');

  -- ==========================================================================
  -- 10. The consent guard lets an admin close a share and nothing else
  --
  -- admin_revoke_patient_share needed the guard widened. These assert the
  -- widening stayed narrow: closing is the only thing it bought.
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE postgres';
  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES (_patient, _doctor, 'Dr Guard', 'cc-doctor@test.local', 'ccguard',
          '{"vitals":true}'::jsonb, true)
  RETURNING id INTO _share2;
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- Widening the grant on a live share: reverted.
  UPDATE public.provider_shares
     SET permissions = '{"vitals":true,"meds":true,"adherence":true,"profile":true}'::jsonb
   WHERE id = _share2;

  EXECUTE 'SET LOCAL ROLE postgres';
  SELECT permissions INTO _json FROM public.provider_shares WHERE id = _share2;
  PERFORM pg_temp.assert((SELECT count(*) FROM jsonb_each(_json)) = 1,
    'an admin cannot widen the permissions on a live share');
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- Moving the share to a different patient: reverted.
  UPDATE public.provider_shares SET user_id = _outsider WHERE id = _share2;
  EXECUTE 'SET LOCAL ROLE postgres';
  SELECT user_id INTO _moved FROM public.provider_shares WHERE id = _share2;
  PERFORM pg_temp.assert(_moved = _patient, 'an admin cannot move a share to another patient');
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- Closing it: allowed, that being the whole point.
  PERFORM public.admin_revoke_patient_share('clinician', _share2, 'Second revoke');
  EXECUTE 'SET LOCAL ROLE postgres';
  SELECT is_active INTO _bool FROM public.provider_shares WHERE id = _share2;
  PERFORM pg_temp.assert(NOT _bool, 'an admin can close a share');
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- Reopening it afterwards: reverted. Reconnecting stays the patient's call.
  UPDATE public.provider_shares SET is_active = true WHERE id = _share2;
  EXECUTE 'SET LOCAL ROLE postgres';
  SELECT is_active INTO _bool FROM public.provider_shares WHERE id = _share2;
  PERFORM pg_temp.assert(NOT _bool, 'an admin cannot reopen a share they closed');
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- And the patient can still close their own, which is what the guard is for.
  EXECUTE 'SET LOCAL ROLE postgres';
  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES (_patient, _doctor, 'Dr Patient', 'cc-doctor@test.local', 'ccpat',
          '{"vitals":true}'::jsonb, true)
  RETURNING id INTO _share3;
  EXECUTE 'SET LOCAL ROLE authenticated';

  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  UPDATE public.provider_shares SET is_active = false, revoked_at = now() WHERE id = _share3;

  EXECUTE 'SET LOCAL ROLE postgres';
  SELECT is_active INTO _bool FROM public.provider_shares WHERE id = _share3;
  PERFORM pg_temp.assert(NOT _bool, 'the patient can still close their own share');

  -- ==========================================================================
  -- 11. Individuals require a search; organisations do not
  --
  -- sharing-access-consent-model.md is built on the patient holding the
  -- power over who sees their relationships. A platform admin browsing every
  -- clinician-patient pairing on the platform, or every patient's account,
  -- with no search and no reason, is the thing that principle rules out.
  -- Tenants are OneCare's business customers, not patients, and stay
  -- browsable — matching the pre-existing Tenants and Revenue panels.
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _admin::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO _count FROM public.admin_accounts_directory('all', NULL, 50, 0);
  PERFORM pg_temp.assert(_count = 0,
    'an empty search returns nothing for "all", though matching accounts exist');

  SELECT count(*) INTO _count FROM public.admin_accounts_directory('patient', '', 50, 0);
  PERFORM pg_temp.assert(_count = 0, 'an empty-string search on patients returns nothing');

  SELECT count(*) INTO _count FROM public.admin_accounts_directory('clinician', 'c', 50, 0);
  PERFORM pg_temp.assert(_count = 0, 'a one-character search on clinicians returns nothing');

  SELECT count(*) INTO _count
    FROM public.admin_accounts_directory('clinician', 'cc-doctor@test.local', 50, 0);
  PERFORM pg_temp.assert(_count = 1, 'a real search on clinicians finds the clinician');

  -- Tenants are the one kind that stays browsable without a search.
  SELECT count(*) INTO _count FROM public.admin_accounts_directory('tenant', NULL, 50, 0);
  PERFORM pg_temp.assert(_count >= 1,
    'tenants remain browsable with no search — they are business customers, not patients');

  SELECT count(*) INTO _count FROM public.admin_access_reviews(NULL, 50, 0);
  PERFORM pg_temp.assert(_count = 0,
    'an empty search returns no relationships, though active shares exist');

  SELECT count(*) INTO _count FROM public.admin_access_reviews('d', 50, 0);
  PERFORM pg_temp.assert(_count = 0, 'a one-character search returns no relationships');

  RAISE NOTICE 'admin_command_centre: all assertions passed';
END $$;

ROLLBACK;
