-- Staff who have left a practice, and staff who are not clinical, do not read
-- or write encounters, even when an old patient assignment is still open.
--
-- The encounters and encounter_addenda policies used is_assigned_to_patient(),
-- which asked whether an assignment row and a live practice share existed but
-- not whether the assignee was still an active, clinical member. Removing a
-- member from the team (usePractice.removeMember) sets status = 'revoked'
-- directly and never ended their assignments, so a removed doctor kept the
-- notes, and a front-desk colleague with an assignment could read and file them.
--
-- Converted from docs/security/phi-audit-2026-09/phi-p2/repro1 (T2) and
-- phi-p2/repro2 (A, F).

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

-- What the current caller can see of the patient's notes.
CREATE OR REPLACE FUNCTION pg_temp.visible(_patient uuid, OUT encounters integer, OUT addenda integer)
LANGUAGE plpgsql AS $$
BEGIN
  SELECT count(*) INTO encounters FROM public.encounters WHERE patient_user_id = _patient;
  SELECT count(*) INTO addenda FROM public.encounter_addenda;
END;
$$;

-- Whether the current caller may file an encounter for the patient. The probe
-- row is rolled back either way, so it never shows up in later counts.
CREATE OR REPLACE FUNCTION pg_temp.can_file(_patient uuid, _practice uuid) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.encounters (patient_user_id, clinician_user_id, practice_id, assessment)
  VALUES (_patient, auth.uid(), _practice, 'rsl probe');
  RAISE EXCEPTION 'rsl-filed';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM = 'rsl-filed';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.open_assignments(_clin uuid) RETURNS integer
LANGUAGE sql AS $$
  SELECT count(*)::integer FROM public.practice_patient_assignments
   WHERE clinician_user_id = _clin
     AND (effective_to IS NULL OR effective_to > now());
$$;

DO $$
DECLARE
  _owner    uuid := '5a000000-0000-4000-8000-000000000001';
  _author   uuid := '5a000000-0000-4000-8000-000000000002';  -- provider, sees every patient
  _revoked  uuid := '5a000000-0000-4000-8000-000000000003';
  _archived uuid := '5a000000-0000-4000-8000-000000000004';
  _front    uuid := '5a000000-0000-4000-8000-000000000005';  -- front desk with an assignment
  _assigned uuid := '5a000000-0000-4000-8000-000000000006';  -- clinician, assigned patients only
  _direct   uuid := '5a000000-0000-4000-8000-000000000007';  -- no practice, a provider share
  _leaver   uuid := '5a000000-0000-4000-8000-000000000008';
  _retiree  uuid := '5a000000-0000-4000-8000-000000000009';
  _moved    uuid := '5a000000-0000-4000-8000-00000000000a';
  _nurse    uuid := '5a000000-0000-4000-8000-00000000000b';
  _pat      uuid := '5a000000-0000-4000-8000-00000000000c';
  _prac     uuid := '5b000000-0000-4000-8000-000000000001';
  _v        record;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_owner,    'rsl-owner@test.local',    now()),
    (_author,   'rsl-author@test.local',   now()),
    (_revoked,  'rsl-revoked@test.local',  now()),
    (_archived, 'rsl-archived@test.local', now()),
    (_front,    'rsl-front@test.local',    now()),
    (_assigned, 'rsl-assigned@test.local', now()),
    (_direct,   'rsl-direct@test.local',   now()),
    (_leaver,   'rsl-leaver@test.local',   now()),
    (_retiree,  'rsl-retiree@test.local',  now()),
    (_moved,    'rsl-moved@test.local',    now()),
    (_nurse,    'rsl-nurse@test.local',    now()),
    (_pat,      'rsl-patient@test.local',  now());

  INSERT INTO public.practices (id, name, created_by) VALUES (_prac, 'RSL Clinic', _owner);
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (_prac, _owner,    'owner',      'active')
  ON CONFLICT (practice_id, user_id) DO UPDATE SET role = 'owner', status = 'active';
  -- The removed members were removed before this test began, by a path that
  -- left their assignments open: that is the state production is in.
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (_prac, _author,   'provider',   'active'),
    (_prac, _revoked,  'provider',   'revoked'),
    (_prac, _archived, 'provider',   'archived'),
    (_prac, _front,    'front_desk', 'active'),
    (_prac, _assigned, 'clinician',  'active'),
    (_prac, _leaver,   'provider',   'active'),
    (_prac, _retiree,  'provider',   'active'),
    (_prac, _moved,    'provider',   'active'),
    (_prac, _nurse,    'provider',   'active');
  UPDATE public.practice_members SET can_view_all_patients = true
   WHERE practice_id = _prac AND user_id = _author;
  UPDATE public.practice_members SET can_view_all_patients = false
   WHERE practice_id = _prac AND user_id NOT IN (_owner, _author);

  INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions)
  VALUES (_prac, _pat, true, true, '{}');
  INSERT INTO public.practice_patient_assignments (practice_id, patient_user_id, clinician_user_id, assigned_by)
  SELECT _prac, _pat, u, _owner
    FROM unnest(ARRAY[_revoked, _archived, _front, _assigned, _leaver, _retiree, _moved, _nurse]) AS u;

  INSERT INTO public.provider_shares (user_id, clinician_user_id, provider_name, provider_email,
                                      invite_code, permissions, is_active)
  VALUES (_pat, _direct, 'Dr Direct', 'rsl-direct@test.local', 'RSLDIR01', '{"profile": true}', true);

  -- The treating provider writes a note and an addendum.
  PERFORM pg_temp.as_user(_author);
  INSERT INTO public.encounters (patient_user_id, clinician_user_id, practice_id, assessment)
  VALUES (_pat, _author, _prac, 'rsl: depression');
  INSERT INTO public.encounter_addenda (encounter_id, author_user_id, body)
  SELECT id, _author, 'rsl: SI screen negative' FROM public.encounters
   WHERE patient_user_id = _pat AND assessment = 'rsl: depression';

  -- ==========================================================================
  -- 1. Removed members with a leftover assignment
  -- ==========================================================================
  PERFORM pg_temp.as_user(_revoked);
  _v := pg_temp.visible(_pat);
  PERFORM pg_temp.assert(_v.encounters = 0, 'a revoked member reads no encounters');
  PERFORM pg_temp.assert(_v.addenda = 0, 'a revoked member reads no addenda');
  PERFORM pg_temp.assert(NOT pg_temp.can_file(_pat, _prac), 'a revoked member cannot file an encounter');

  PERFORM pg_temp.as_user(_archived);
  _v := pg_temp.visible(_pat);
  PERFORM pg_temp.assert(_v.encounters = 0, 'an archived member reads no encounters');
  PERFORM pg_temp.assert(_v.addenda = 0, 'an archived member reads no addenda');
  PERFORM pg_temp.assert(NOT pg_temp.can_file(_pat, _prac), 'an archived member cannot file an encounter');

  -- ==========================================================================
  -- 2. Non-clinical staff with an assignment
  -- ==========================================================================
  PERFORM pg_temp.as_user(_front);
  _v := pg_temp.visible(_pat);
  PERFORM pg_temp.assert(_v.encounters = 0, 'front desk reads no encounters, assignment or not');
  PERFORM pg_temp.assert(_v.addenda = 0, 'front desk reads no addenda');
  PERFORM pg_temp.assert(NOT pg_temp.can_file(_pat, _prac), 'front desk cannot file an encounter');

  -- ==========================================================================
  -- 3. Clinicians who should keep the record still do
  -- ==========================================================================
  PERFORM pg_temp.as_user(_assigned);
  _v := pg_temp.visible(_pat);
  PERFORM pg_temp.assert(_v.encounters = 1, 'an assigned-only clinician reads the encounter');
  PERFORM pg_temp.assert(_v.addenda = 1, 'an assigned-only clinician reads the addendum');
  PERFORM pg_temp.assert(pg_temp.can_file(_pat, _prac), 'an assigned-only clinician can file an encounter');

  PERFORM pg_temp.as_user(_direct);
  _v := pg_temp.visible(_pat);
  PERFORM pg_temp.assert(_v.encounters = 1, 'a clinician with a provider share reads the encounter');
  PERFORM pg_temp.assert(_v.addenda = 1, 'a clinician with a provider share reads the addendum');

  PERFORM pg_temp.as_user(_author);
  _v := pg_temp.visible(_pat);
  PERFORM pg_temp.assert(_v.encounters = 1 AND _v.addenda = 1, 'the author still reads their note');

  -- ==========================================================================
  -- 4. Leaving the team, or the clinical side of it, ends assignments
  -- ==========================================================================
  -- A manager revokes and archives members the way the client does: a direct
  -- UPDATE of status, not set_practice_affiliation_status().
  PERFORM pg_temp.as_user(_owner);
  UPDATE public.practice_members SET status = 'revoked'
   WHERE practice_id = _prac AND user_id = _leaver;
  UPDATE public.practice_members SET status = 'archived'
   WHERE practice_id = _prac AND user_id = _retiree;
  UPDATE public.practice_members SET role = 'front_desk'
   WHERE practice_id = _prac AND user_id = _moved;
  -- A clinical-to-clinical move and an unrelated edit leave assignments alone.
  UPDATE public.practice_members SET role = 'nurse'
   WHERE practice_id = _prac AND user_id = _nurse;
  UPDATE public.practice_members SET can_invite_patients = false
   WHERE practice_id = _prac AND user_id = _assigned;

  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(pg_temp.open_assignments(_leaver) = 0,
    'revoking a member by direct UPDATE ends their assignments');
  PERFORM pg_temp.assert(pg_temp.open_assignments(_retiree) = 0,
    'archiving a member ends their assignments');
  PERFORM pg_temp.assert(pg_temp.open_assignments(_moved) = 0,
    'moving a member to a non-clinical role ends their assignments');
  PERFORM pg_temp.assert(pg_temp.open_assignments(_nurse) = 1,
    'a move between clinical roles keeps assignments');
  PERFORM pg_temp.assert(pg_temp.open_assignments(_assigned) = 1,
    'an unrelated edit keeps assignments');
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.practice_patient_assignments WHERE clinician_user_id = _leaver) = 1,
    'ended assignments are closed, not deleted');

  PERFORM pg_temp.as_user(_leaver);
  _v := pg_temp.visible(_pat);
  PERFORM pg_temp.assert(_v.encounters = 0 AND _v.addenda = 0, 'the member just revoked reads nothing');

  PERFORM pg_temp.as_user(_nurse);
  _v := pg_temp.visible(_pat);
  PERFORM pg_temp.assert(_v.encounters = 1, 'the member moved to nurse still reads the encounter');

  -- ==========================================================================
  -- 5. The helper itself no longer vouches for a removed or non-clinical member
  -- ==========================================================================
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(NOT public.is_assigned_to_patient(_revoked, _pat),
    'is_assigned_to_patient is false for a revoked member');
  PERFORM pg_temp.assert(NOT public.is_assigned_to_patient(_front, _pat),
    'is_assigned_to_patient is false for front desk');
  PERFORM pg_temp.assert(public.is_assigned_to_patient(_assigned, _pat),
    'is_assigned_to_patient is true for an active clinician');
END;
$$ LANGUAGE plpgsql;

ROLLBACK;
