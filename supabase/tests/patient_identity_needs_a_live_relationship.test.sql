-- get_patient_identity returns a person's name, email and phone. It must only
-- do that for someone the caller has a live, consented relationship with.
--
-- It trusted clinician_patient_records.linked_user_id, which the caller could
-- write: the INSERT policy checked only clinician_user_id, so any signed-in
-- account could file a "record" pointing at any uuid and resolve it. The
-- addressee of a record could also set linked_user_id to anybody, and a
-- patient who *declined* a record still set it to themselves — so the
-- clinician they said no to got their contact details anyway. The clinician
-- share arm ignored expires_at.
--
-- Converted from docs/security/phi-audit-2026-09/phi-p1a/r1 and r8.

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

CREATE OR REPLACE FUNCTION pg_temp.resolves(_id uuid) RETURNS boolean
LANGUAGE sql AS $$
  SELECT EXISTS (SELECT 1 FROM public.get_patient_identity(ARRAY[_id])
                  WHERE name IS NOT NULL OR email IS NOT NULL OR phone_number IS NOT NULL)
$$;

DO $$
DECLARE
  _nobody  uuid := 'a1000000-0000-4000-8000-0000000000b1';
  _alt     uuid := 'a1000000-0000-4000-8000-0000000000b2';
  _vera    uuid := 'b2000000-0000-4000-8000-0000000000b3';
  _clin    uuid := '5c000000-0000-4000-8000-0000000000b4';
  _ella    uuid := '5d000000-0000-4000-8000-0000000000b5';
  _dora    uuid := '5e000000-0000-4000-8000-0000000000b6';
  _rec     uuid;
  _raised  boolean;
  _n       integer;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_nobody, 'pin-nobody@test.local', now()),
    (_alt,    'pin-alt@test.local',    now()),
    (_vera,   'pin-vera@test.local',   now()),
    (_clin,   'pin-clin@test.local',   now()),
    (_ella,   'pin-ella@test.local',   now()),
    (_dora,   'pin-dora@test.local',   now());
  INSERT INTO public.profiles (user_id, name, email, phone_number) VALUES
    (_nobody, 'No Relationship', 'pin-nobody@test.local', NULL),
    (_alt,    'Second Account',  'pin-alt@test.local',    NULL),
    (_vera,   'Vera Victim',     'pin-vera@test.local',   '+1 555 0100'),
    (_clin,   'Dr Clin',         'pin-clin@test.local',   NULL),
    (_ella,   'Ella Expired',    'pin-ella@test.local',   '+1 555 0199'),
    (_dora,   'Dora Declined',   'pin-dora@test.local',   '+1 555 0142')
  ON CONFLICT (user_id) DO UPDATE
    SET name = EXCLUDED.name, email = EXCLUDED.email, phone_number = EXCLUDED.phone_number;

  -- ==========================================================================
  -- 1. A record cannot be pointed at somebody by the person filing it
  -- ==========================================================================
  -- Only a clinician may file a record (20261010090000), and a clinician
  -- profile is self-made, so the stranger makes one: the link guards below
  -- must hold against them regardless.
  INSERT INTO public.clinician_profiles (user_id) VALUES (_nobody) ON CONFLICT (user_id) DO NOTHING;

  PERFORM pg_temp.as_user(_nobody);
  PERFORM pg_temp.assert(NOT pg_temp.resolves(_vera), 'a stranger resolves nobody');

  _raised := false;
  BEGIN
    INSERT INTO public.clinician_patient_records (clinician_user_id, patient_name, linked_user_id)
    VALUES (_nobody, 'x', _vera);
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'a new record cannot arrive already linked to someone');
  PERFORM pg_temp.assert(NOT pg_temp.resolves(_vera), 'and so the stranger still resolves nobody');

  -- Nor by editing an unclaimed one afterwards.
  INSERT INTO public.clinician_patient_records (clinician_user_id, patient_name, patient_email)
  VALUES (_nobody, 'x', 'pin-alt@test.local')
  RETURNING id INTO _rec;
  _raised := false;
  BEGIN
    UPDATE public.clinician_patient_records SET linked_user_id = _vera WHERE id = _rec;
    GET DIAGNOSTICS _n = ROW_COUNT;
    _raised := _n = 0;
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'the clinician cannot link their own record to someone');

  -- Nor by the addressee, who can claim it only for themselves.
  PERFORM pg_temp.as_user(_alt);
  _raised := false;
  BEGIN
    UPDATE public.clinician_patient_records SET linked_user_id = _vera WHERE id = _rec;
    GET DIAGNOSTICS _n = ROW_COUNT;
    _raised := _n = 0;
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'the addressee cannot link a record to a third person');

  PERFORM pg_temp.as_user(_nobody);
  PERFORM pg_temp.assert(NOT pg_temp.resolves(_vera), 'a forged link resolves nobody');

  -- ==========================================================================
  -- 2. A clinician share resolves while it is live, and not after
  -- ==========================================================================
  PERFORM pg_temp.as_user(NULL);
  -- Provider shares open only to clinician accounts (20261010050000).
  INSERT INTO public.clinician_profiles (user_id) VALUES (_clin) ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.provider_shares (user_id, clinician_user_id, provider_name, provider_email,
                                      invite_code, permissions, is_active, expires_at)
  VALUES (_ella, _clin, 'Dr Clin', 'pin-clin@test.local', 'PINEXP01', '{"profile": true}', true,
          now() - interval '30 days');

  PERFORM pg_temp.as_user(_clin);
  PERFORM pg_temp.assert(NOT pg_temp.resolves(_ella), 'an expired share resolves nobody');

  PERFORM pg_temp.as_user(NULL);
  UPDATE public.provider_shares SET expires_at = now() + interval '30 days' WHERE user_id = _ella;
  PERFORM pg_temp.as_user(_clin);
  PERFORM pg_temp.assert(pg_temp.resolves(_ella), 'a live share resolves the patient');

  -- ==========================================================================
  -- 3. Saying no to a clinician's record is not a relationship
  -- ==========================================================================
  INSERT INTO public.clinician_patient_records (clinician_user_id, patient_name, patient_email)
  VALUES (_clin, 'Dora', 'pin-dora@test.local')
  RETURNING id INTO _rec;

  PERFORM pg_temp.as_user(_dora);
  UPDATE public.clinician_patient_records
     SET invitation_status = 'declined', linked_user_id = _dora
   WHERE id = _rec;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 1, 'the addressee can still answer a record for themselves');

  PERFORM pg_temp.as_user(_clin);
  PERFORM pg_temp.assert(NOT pg_temp.resolves(_dora), 'a declined record gives the clinician nothing');

  RAISE NOTICE 'patient_identity_needs_a_live_relationship: all assertions passed';
END $$;

ROLLBACK;
