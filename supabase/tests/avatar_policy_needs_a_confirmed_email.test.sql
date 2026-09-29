-- A pending share's patient photo is readable only on a confirmed email.
--
-- The avatar policy matched provider_email against get_current_user_email(),
-- which answers for an address nobody has proved. The EXISTS runs under the
-- caller's RLS on provider_shares, whose SELECT policy already requires
-- confirmed_email(), so the hole was masked rather than closed.
-- See 20261009070000.

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

DO $$
DECLARE
  _patient  uuid := 'a1000000-0000-4000-8000-0000000000a1';
  _invitee  uuid := 'a1000000-0000-4000-8000-0000000000a2';
  _stranger uuid := 'a1000000-0000-4000-8000-0000000000a3';
  _path     text := 'a1000000-0000-4000-8000-0000000000a1/avatar.png';
  _n        integer;
BEGIN
  -- The invited address exists as an account that has never been confirmed.
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_patient,  'apc-patient@test.local',  now()),
    (_invitee,  'apc-dr@test.local',       NULL),
    (_stranger, 'apc-stranger@test.local', now());
  INSERT INTO public.profiles (user_id, name, email, avatar_shared_with_clinicians) VALUES
    (_patient,  'Avatar Patient', 'apc-patient@test.local',  true),
    (_invitee,  'Dr Invitee',     'apc-dr@test.local',       false),
    (_stranger, 'Stranger',       'apc-stranger@test.local', false)
  ON CONFLICT (user_id) DO UPDATE
    SET name = EXCLUDED.name, email = EXCLUDED.email,
        avatar_shared_with_clinicians = EXCLUDED.avatar_shared_with_clinicians;

  -- A pending share: invited by email, not yet claimed.
  -- Provider shares open only to clinician accounts (20261010050000).
  INSERT INTO public.clinician_profiles (user_id) VALUES (_invitee) ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES (_patient, NULL, 'Dr Invitee', 'apc-dr@test.local', 'apcinv01',
          '{"vitals":true,"meds":true,"adherence":false,"profile":true}'::jsonb, true);

  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('patient-avatars', _path, _patient);

  -- 0. The policy itself asks for a confirmed address. Today provider_shares'
  --    own SELECT policy hides an unconfirmed invitee's pending share from the
  --    EXISTS below, which masked the hole; the storage policy must not lean
  --    on that.
  SELECT count(*) INTO _n FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%get_current_user_email%';
  PERFORM pg_temp.assert(_n = 0,
    'no storage policy matches on get_current_user_email(), which ignores confirmation');

  -- 1. Unconfirmed holder of the invited address sees nothing.
  PERFORM pg_temp.as_user(_invitee);
  SELECT count(*) INTO _n FROM storage.objects
   WHERE bucket_id = 'patient-avatars' AND name = _path;
  PERFORM pg_temp.assert(_n = 0,
    'an unconfirmed account with the invited address cannot read the patient''s photo');

  -- 2. A confirmed stranger sees nothing either.
  PERFORM pg_temp.as_user(_stranger);
  SELECT count(*) INTO _n FROM storage.objects
   WHERE bucket_id = 'patient-avatars' AND name = _path;
  PERFORM pg_temp.assert(_n = 0, 'a confirmed stranger cannot read the patient''s photo');

  -- 3. Once the address is proved, the pending share does reach the photo.
  PERFORM pg_temp.as_user(NULL);
  UPDATE auth.users SET email_confirmed_at = now() WHERE id = _invitee;
  PERFORM pg_temp.as_user(_invitee);
  SELECT count(*) INTO _n FROM storage.objects
   WHERE bucket_id = 'patient-avatars' AND name = _path;
  PERFORM pg_temp.assert(_n = 1,
    'the confirmed invitee reads the photo through the pending share');

  -- 4. The patient's opt-out still wins.
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.profiles SET avatar_shared_with_clinicians = false WHERE user_id = _patient;
  PERFORM pg_temp.as_user(_invitee);
  SELECT count(*) INTO _n FROM storage.objects
   WHERE bucket_id = 'patient-avatars' AND name = _path;
  PERFORM pg_temp.assert(_n = 0, 'a patient who stops sharing their photo is not shown');

  PERFORM pg_temp.as_user(NULL);
END;
$$;

ROLLBACK;
