-- Clinician whitelisting, bulk onboarding and offboarding.
--
-- The rule being protected: nobody joins a hospital by claiming to work there.
-- Recognition is either an approved email domain or an entry on the hospital's
-- own allowlist; everything else waits for a human.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/clinician_affiliation.test.sql

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

DO $$
DECLARE
  _chief  uuid := 'aa000000-0000-0000-0000-000000000001';
  _known  uuid := 'aa000000-0000-0000-0000-000000000002'; -- on the allowlist
  _domain uuid := 'aa000000-0000-0000-0000-000000000003'; -- matches the domain
  _rando  uuid := 'aa000000-0000-0000-0000-000000000004'; -- neither
  _hosp   uuid := 'aa111111-0000-0000-0000-000000000001';
  _status text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_chief,'chief@lmc.org'), (_known,'known@gmail.com'),
    (_domain,'doc@lmc.org'), (_rando,'someone@else.com');

  UPDATE public.profiles SET email = 'chief@lmc.org'    WHERE user_id = _chief;
  UPDATE public.profiles SET email = 'known@gmail.com'  WHERE user_id = _known;
  UPDATE public.profiles SET email = 'doc@lmc.org'      WHERE user_id = _domain;
  UPDATE public.profiles SET email = 'someone@else.com' WHERE user_id = _rando;

  INSERT INTO public.practices (id, name, tenant_type, slug, created_by, allowed_email_domains)
  VALUES (_hosp, 'Affiliation Test Hospital', 'hospital', 'afftest', _chief, ARRAY['lmc.org']);

  -- Bulk import from the hospital's staff CSV. The duplicate row is ignored.
  PERFORM set_config('request.jwt.claim.sub', _chief::text, true);
  PERFORM public.bulk_allowlist_clinicians(_hosp,
    '[{"email":"known@gmail.com","name":"Dr Known","role":"clinician"},
      {"email":"known@gmail.com"},
      {"email":"   "}]'::jsonb);

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.practice_clinician_allowlist WHERE practice_id = _hosp) = 1,
    'bulk import adds one row, skipping the duplicate and the blank');

  -- Recognised two ways.
  PERFORM set_config('request.jwt.claim.sub', _known::text, true);
  SELECT public.request_practice_affiliation('afftest') INTO _status;
  PERFORM pg_temp.assert(_status = 'active', 'an allowlisted clinician is affiliated immediately');

  PERFORM set_config('request.jwt.claim.sub', _domain::text, true);
  SELECT public.request_practice_affiliation('afftest') INTO _status;
  PERFORM pg_temp.assert(_status = 'active', 'an approved email domain is affiliated immediately');

  -- Not recognised: pending, and pending grants nothing.
  PERFORM set_config('request.jwt.claim.sub', _rando::text, true);
  SELECT public.request_practice_affiliation('afftest') INTO _status;
  PERFORM pg_temp.assert(_status = 'pending_approval',
    'an unrecognised request lands in pending approval');
  PERFORM pg_temp.assert(
    NOT public.has_practice_capability(_rando, 'view_phi', _hosp),
    'a pending member holds no capabilities');

  -- Asking twice does not create a second membership or escalate the first.
  SELECT public.request_practice_affiliation('afftest') INTO _status;
  PERFORM pg_temp.assert(_status = 'pending_approval',
    'requesting again leaves the request pending');
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.practice_members
      WHERE practice_id = _hosp AND user_id = _rando) = 1,
    'affiliation never creates a duplicate membership');

  PERFORM set_config('request.jwt.claim.sub', _chief::text, true);
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.practice_pending_affiliations(_hosp)) = 1,
    'the admin queue shows exactly the pending request');

  -- Offboarding: status change, not deletion.
  PERFORM public.set_practice_affiliation_status(_hosp, _domain, 'revoked');
  PERFORM pg_temp.assert(
    (SELECT status FROM public.practice_members
      WHERE practice_id = _hosp AND user_id = _domain) = 'revoked',
    'offboarding revokes the affiliation without deleting the person');
  PERFORM pg_temp.assert(
    NOT public.has_practice_capability(_domain, 'view_phi', _hosp),
    'an offboarded clinician loses hospital capabilities immediately');

  -- The tenant must never be left unmanageable.
  BEGIN
    PERFORM public.set_practice_affiliation_status(_hosp, _chief, 'revoked');
    RAISE EXCEPTION 'FAILED: the last owner was offboarded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAILED%' THEN RAISE; END IF;
    RAISE NOTICE '  ok — the last owner cannot be offboarded';
  END;

  RAISE NOTICE 'ALL CLINICIAN AFFILIATION TESTS PASSED';
END $$;

ROLLBACK;
