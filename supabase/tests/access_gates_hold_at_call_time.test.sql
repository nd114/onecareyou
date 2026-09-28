-- The access gates answer for one relationship at a time, and nobody but the
-- party who owns a relationship can reshape it.
--
-- Three holes, each found by running the gates and the rows they trust as a
-- signed-in caller:
--
--   1. A department is one hospital's, but nothing tied an assignment's
--      department to the assignment's practice. Any clinician at an
--      assignment-first hospital could found their own practice, give it a
--      department, join it, and file themselves as "assigned" to any patient
--      of the hospital through the department-lead policy. The gate then
--      admitted them to that patient's clinical record.
--   2. The clinician on a provider share could rewrite provider_email, and the
--      gate admits whoever holds that email. The clinician could hand the
--      patient's share to a colleague the patient never chose.
--   3. institution_has_clinical_permission asked two separate questions —
--      "does some share grant this category" and "does some share give this
--      person clinical access" — and could answer them from two different
--      practices. Front desk at a hospital the patient gave medications to,
--      plus clinician at a hospital the patient gave only vitals to, read
--      the medications.

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
  -- 1. Hospital B and the self-made department
  _admin_b  uuid := 'a1000000-0000-4000-8000-00000000af01';
  _mallory  uuid := 'a1000000-0000-4000-8000-00000000af02';
  _lead     uuid := 'a1000000-0000-4000-8000-00000000af03';
  _carer    uuid := 'a1000000-0000-4000-8000-00000000af04';
  _pat      uuid := 'a1000000-0000-4000-8000-00000000af05';
  _hosp_b   uuid := 'b1000000-0000-4000-8000-00000000af01';
  _own      uuid := 'b1000000-0000-4000-8000-00000000af02';
  _dept_b   uuid := 'd1000000-0000-4000-8000-00000000af01';
  _dept_own uuid := 'd1000000-0000-4000-8000-00000000af02';
  -- 2. The provider share
  _dr_x     uuid := 'a1000000-0000-4000-8000-00000000af06';
  _dr_z     uuid := 'a1000000-0000-4000-8000-00000000af07';
  _quinn    uuid := 'a1000000-0000-4000-8000-00000000af08';
  _share    uuid := 'c1000000-0000-4000-8000-00000000af01';
  _open     uuid := 'c1000000-0000-4000-8000-00000000af02';
  -- 3. Two hospitals, one person
  _wes      uuid := 'a1000000-0000-4000-8000-00000000af09';
  _rae      uuid := 'a1000000-0000-4000-8000-00000000af10';
  _a1       uuid := 'b1000000-0000-4000-8000-00000000af03';
  _a2       uuid := 'b1000000-0000-4000-8000-00000000af04';

  _assign   uuid;
  _n        integer;
  _txt      text;
  _ok       boolean;
  _raised   boolean;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_admin_b, 'agh-admin-b@test.local', now()),
    (_mallory, 'agh-mallory@test.local', now()),
    (_lead,    'agh-lead@test.local',    now()),
    (_carer,   'agh-carer@test.local',   now()),
    (_pat,     'agh-pat@test.local',     now()),
    (_dr_x,    'agh-dr-x@test.local',    now()),
    (_dr_z,    'agh-dr-z@test.local',    now()),
    (_quinn,   'agh-quinn@test.local',   now()),
    (_wes,     'agh-wes@test.local',     now()),
    (_rae,     'agh-rae@test.local',     now());

  -- ==========================================================================
  -- 1. A department belongs to its hospital
  -- ==========================================================================
  -- Hospital B routes access by assignment. Mallory is one of its clinicians,
  -- with nobody assigned to her. The lead runs Cardiology, where the carer
  -- works.
  INSERT INTO public.practices (id, name, created_by) VALUES (_hosp_b, 'Hospital B', _admin_b);
  INSERT INTO public.practice_members (practice_id, user_id, role, status, can_view_all_patients) VALUES
    (_hosp_b, _mallory, 'clinician', 'active', false),
    (_hosp_b, _lead,    'clinician', 'active', false),
    (_hosp_b, _carer,   'clinician', 'active', false);
  INSERT INTO public.practice_departments (id, practice_id, name, created_by)
  VALUES (_dept_b, _hosp_b, 'Cardiology', _admin_b);
  INSERT INTO public.practice_department_members (department_id, practice_id, user_id, is_lead) VALUES
    (_dept_b, _hosp_b, _lead,  true),
    (_dept_b, _hosp_b, _carer, false);
  INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions)
  VALUES (_hosp_b, _pat, true, true, '{}');
  INSERT INTO public.medications (user_id, name, dosage, frequency)
  VALUES (_pat, 'agh-sertraline', '50mg', 'daily');

  PERFORM pg_temp.as_user(_mallory);
  SELECT count(*) INTO _n FROM public.medications WHERE user_id = _pat;
  PERFORM pg_temp.assert(_n = 0, 'unassigned, Mallory does not read the patient');

  -- Her own practice, her own department, herself in it.
  INSERT INTO public.practices (id, name, created_by) VALUES (_own, 'Mallory Co', _mallory);
  INSERT INTO public.practice_departments (id, practice_id, name, created_by)
  VALUES (_dept_own, _own, 'Anything', _mallory);
  INSERT INTO public.practice_department_members (department_id, practice_id, user_id, is_lead)
  VALUES (_dept_own, _own, _mallory, false);

  -- The forgery: an assignment at Hospital B, carried by her own department.
  _raised := false;
  BEGIN
    INSERT INTO public.practice_patient_assignments
      (practice_id, patient_user_id, clinician_user_id, department_id, assigned_by)
    VALUES (_hosp_b, _pat, _mallory, _dept_own, _mallory);
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  SELECT count(*) INTO _n FROM public.medications WHERE user_id = _pat;
  PERFORM pg_temp.assert(_n = 0, 'another practice''s department cannot assign at Hospital B');
  SELECT public.institution_has_clinical_access(_pat) INTO _ok;
  PERFORM pg_temp.assert(NOT _ok, 'and the gate stays shut');

  -- Nor can the department's roster or routing name another hospital.
  _raised := false;
  BEGIN
    INSERT INTO public.practice_department_members (department_id, practice_id, user_id, is_lead)
    VALUES (_dept_own, _hosp_b, _carer, false);
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'a department member row names the department''s own practice');

  _raised := false;
  BEGIN
    INSERT INTO public.practice_patient_departments (practice_id, department_id, patient_user_id, assigned_by)
    VALUES (_hosp_b, _dept_own, _pat, _mallory);
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'a patient is routed only to a department of that practice');

  -- The definer function takes a department argument too.
  PERFORM pg_temp.as_user(_admin_b);
  _raised := false;
  BEGIN
    PERFORM public.assign_practice_patient(_hosp_b, _pat, _carer, _dept_own, NULL);
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'assign_practice_patient refuses another practice''s department');

  -- The real lead still assigns within their department, and ends it.
  PERFORM pg_temp.as_user(_lead);
  INSERT INTO public.practice_patient_assignments
    (practice_id, patient_user_id, clinician_user_id, department_id, assigned_by)
  VALUES (_hosp_b, _pat, _carer, _dept_b, _lead);
  PERFORM pg_temp.as_user(NULL);
  SELECT id INTO _assign FROM public.practice_patient_assignments
   WHERE practice_id = _hosp_b AND patient_user_id = _pat AND clinician_user_id = _carer;
  PERFORM pg_temp.assert(_assign IS NOT NULL, 'a department lead assigns a member of their department');

  PERFORM pg_temp.as_user(_carer);
  SELECT count(*) INTO _n FROM public.medications WHERE user_id = _pat;
  PERFORM pg_temp.assert(_n = 1, 'and the assigned clinician reads the record');

  -- An assignment is who looks after whom; the lead ends it, and does not
  -- move it onto somebody else.
  PERFORM pg_temp.as_user(_lead);
  _raised := false;
  BEGIN
    UPDATE public.practice_patient_assignments SET clinician_user_id = _mallory WHERE id = _assign;
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.practice_patient_assignments
   WHERE id = _assign AND clinician_user_id = _carer;
  PERFORM pg_temp.assert(_n = 1, 'an assignment cannot be moved onto another clinician');

  PERFORM pg_temp.as_user(_lead);
  UPDATE public.practice_patient_assignments SET effective_to = now() - interval '1 second' WHERE id = _assign;
  PERFORM pg_temp.as_user(_carer);
  SELECT count(*) INTO _n FROM public.medications WHERE user_id = _pat;
  PERFORM pg_temp.assert(_n = 0, 'the lead can end the assignment');

  -- ==========================================================================
  -- 2. The patient names who a provider share is with
  -- ==========================================================================
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.provider_shares
    (id, user_id, provider_name, provider_email, clinician_user_id, invite_code, permissions, is_active)
  VALUES
    (_share, _quinn, 'Dr X', 'agh-dr-x@test.local', _dr_x, 'agh-invite-1', '{"medications": true}', true),
    (_open,  _quinn, 'Dr Z', 'agh-dr-z@test.local', NULL,  'agh-invite-2', '{"vitals": true}',      true);
  INSERT INTO public.medications (user_id, name, dosage, frequency)
  VALUES (_quinn, 'agh-lithium', '400mg', 'nightly');

  PERFORM pg_temp.as_user(_dr_x);
  UPDATE public.provider_shares SET provider_email = 'agh-dr-z@test.local' WHERE id = _share;
  UPDATE public.provider_shares SET clinician_notes = 'agh-seen' WHERE id = _share;

  PERFORM pg_temp.as_user(_dr_z);
  SELECT count(*) INTO _n FROM public.medications WHERE user_id = _quinn;
  PERFORM pg_temp.assert(_n = 0, 'the clinician on a share cannot hand it to a colleague by email');
  SELECT public.clinician_has_patient_permission(_quinn, 'medications') INTO _ok;
  PERFORM pg_temp.assert(NOT _ok, 'and the colleague holds no medications permission');

  PERFORM pg_temp.as_user(NULL);
  SELECT provider_email INTO _txt FROM public.provider_shares WHERE id = _share;
  PERFORM pg_temp.assert(_txt = 'agh-dr-x@test.local', 'the share still names Dr X');
  SELECT count(*) INTO _n FROM public.provider_shares WHERE id = _share AND clinician_notes = 'agh-seen';
  PERFORM pg_temp.assert(_n = 1, 'the clinician still keeps their own notes on the share');

  -- Claiming a share addressed to you still works.
  PERFORM pg_temp.as_user(_dr_z);
  UPDATE public.provider_shares SET clinician_user_id = _dr_z WHERE id = _open AND clinician_user_id IS NULL;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.provider_shares WHERE id = _open AND clinician_user_id = _dr_z;
  PERFORM pg_temp.assert(_n = 1, 'a clinician claims a share sent to their email');

  -- The patient can re-address their own share.
  PERFORM pg_temp.as_user(_quinn);
  UPDATE public.provider_shares SET provider_email = 'agh-dr-x2@test.local', provider_name = 'Dr X (clinic)'
   WHERE id = _share;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.provider_shares
   WHERE id = _share AND provider_email = 'agh-dr-x2@test.local' AND provider_name = 'Dr X (clinic)';
  PERFORM pg_temp.assert(_n = 1, 'the patient can change who their share is addressed to');

  -- ==========================================================================
  -- 3. A permission and the clinical access it needs come from one practice
  -- ==========================================================================
  -- Rae gives A1 her medications and A2 only her vitals. Wes is front desk at
  -- A1 and a clinician at A2.
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.practices (id, name, created_by) VALUES
    (_a1, 'A1', _admin_b),
    (_a2, 'A2', _admin_b);
  INSERT INTO public.practice_members (practice_id, user_id, role, status, can_view_all_patients) VALUES
    (_a1, _wes, 'front_desk', 'active', true),
    (_a2, _wes, 'clinician',  'active', true);
  INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions) VALUES
    (_a1, _rae, true, false, '{"medications": true}'),
    (_a2, _rae, true, false, '{"vitals": true}');
  INSERT INTO public.medications (user_id, name, dosage, frequency)
  VALUES (_rae, 'agh-methadone', '60mg', 'daily');

  PERFORM pg_temp.as_user(_wes);
  SELECT count(*) INTO _n FROM public.medications WHERE user_id = _rae;
  PERFORM pg_temp.assert(_n = 0, 'front desk at one hospital plus clinician at another does not read medications');
  SELECT public.institution_has_clinical_permission(_rae, 'medications') INTO _ok;
  PERFORM pg_temp.assert(NOT _ok, 'institution_has_clinical_permission answers per practice');
  SELECT public.institution_has_clinical_permission(_rae, 'vitals') INTO _ok;
  PERFORM pg_temp.assert(_ok, 'Wes still has the vitals A2 was given');

  RAISE NOTICE 'access_gates_hold_at_call_time: all assertions passed';
END $$;

ROLLBACK;
