-- Five smaller access findings, each checked as a signed-in caller.
--
--   1. The clinical gates and three practice RPCs were executable by anon.
--   2. has_practice_capability() answered for any user id, so anyone could
--      learn another person's practice role.
--   3. A practice admin could offer the owner role in an invitation.
--   4. Anyone could grant caregiver access to somebody else's family member.
--   5. Front desk could write internal notes, care plans and care goals
--      through the non-clinical patient gate.
--
-- Each has a positive alongside it so the fix does not take away what the
-- right person is meant to do.

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

-- True when the statement is refused (any error), false when it runs.
CREATE OR REPLACE FUNCTION pg_temp.refused(_sql text) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  RETURN true;
END;
$$;

DO $$
DECLARE
  _own   uuid := 'a1000000-0000-4000-8000-0000000005f1';
  _adm   uuid := 'a1000000-0000-4000-8000-0000000005f2';
  _doc   uuid := 'a1000000-0000-4000-8000-0000000005f3';
  _desk  uuid := 'a1000000-0000-4000-8000-0000000005f4';
  _pat   uuid := 'a1000000-0000-4000-8000-0000000005f5';
  _str   uuid := 'a1000000-0000-4000-8000-0000000005f6';
  _cg    uuid := 'a1000000-0000-4000-8000-0000000005f7';
  _prac  uuid := 'b1000000-0000-4000-8000-0000000005f1';
  _fm_pat uuid := 'c1000000-0000-4000-8000-0000000005f1';
  _fm_str uuid := 'c1000000-0000-4000-8000-0000000005f2';
  _plan  uuid;
  _inv   uuid;
  _grant uuid;
  _n     integer;
  _fn    text;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_own,  'saf-own@test.local',  now()),
    (_adm,  'saf-adm@test.local',  now()),
    (_doc,  'saf-doc@test.local',  now()),
    (_desk, 'saf-desk@test.local', now()),
    (_pat,  'saf-pat@test.local',  now()),
    (_str,  'saf-str@test.local',  now()),
    (_cg,   'saf-cg@test.local',   now());

  INSERT INTO public.practices (id, name, created_by) VALUES (_prac, 'SAF Clinic', _own);
  INSERT INTO public.practice_members (practice_id, user_id, role, status, can_view_all_patients) VALUES
    (_prac, _adm,  'admin',      'active', true),
    (_prac, _doc,  'clinician',  'active', true),
    (_prac, _desk, 'front_desk', 'active', true);
  INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions)
  VALUES (_prac, _pat, true, true, '{}');

  INSERT INTO public.family_members (id, owner_user_id, name) VALUES
    (_fm_pat, _pat, 'Pat''s child'),
    (_fm_str, _str, 'Stranger''s child');

  -- ==========================================================================
  -- 1. anon executes none of the clinical gates or practice RPCs
  -- ==========================================================================
  FOREACH _fn IN ARRAY ARRAY[
    'public.institution_has_clinical_access(uuid)',
    'public.institution_has_clinical_permission(uuid,text)',
    'public.practice_has_clinical_access(uuid)',
    'public.assign_practice_patient(uuid,uuid,uuid,uuid,text)',
    'public.practice_delete_department(uuid,text)',
    'public.practice_set_assignment_first(uuid,boolean)'
  ] LOOP
    PERFORM pg_temp.assert(NOT has_function_privilege('anon', _fn, 'EXECUTE'),
      'anon cannot execute ' || _fn);
    PERFORM pg_temp.assert(has_function_privilege('authenticated', _fn, 'EXECUTE'),
      'signed-in callers still execute ' || _fn);
  END LOOP;

  -- ==========================================================================
  -- 2. has_practice_capability answers for yourself, or for your own staff
  -- ==========================================================================
  PERFORM pg_temp.as_user(_doc);
  PERFORM pg_temp.assert(public.has_practice_capability(_doc, 'view_phi', _prac),
    'a clinician learns their own capability');
  PERFORM pg_temp.assert(public.has_practice_capability(_doc, 'edit_clinical'),
    'the two-argument form still answers for yourself');

  PERFORM pg_temp.as_user(_str);
  PERFORM pg_temp.assert(NOT public.has_practice_capability(_doc, 'view_phi', _prac),
    'a stranger cannot learn a clinician''s practice capability');
  PERFORM pg_temp.assert(NOT public.has_practice_capability(_doc, 'view_phi'),
    'nor through the two-argument form');

  PERFORM pg_temp.as_user(_desk);
  PERFORM pg_temp.assert(NOT public.has_practice_capability(_doc, 'edit_clinical', _prac),
    'a colleague who does not manage the practice cannot ask about another member');

  PERFORM pg_temp.as_user(_own);
  PERFORM pg_temp.assert(public.has_practice_capability(_doc, 'edit_clinical', _prac),
    'the practice''s manager can still ask about their own staff');

  -- ==========================================================================
  -- 3. Only an owner offers the owner role
  -- ==========================================================================
  PERFORM pg_temp.as_user(_adm);
  PERFORM pg_temp.assert(pg_temp.refused(format(
    'INSERT INTO public.practice_invitations (practice_id, email, role, invited_by) VALUES (%L, %L, ''owner'', %L)',
    _prac, 'saf-new-owner@test.local', _adm)),
    'an admin cannot invite someone as owner');

  INSERT INTO public.practice_invitations (practice_id, email, role, invited_by)
  VALUES (_prac, 'saf-new-doc@test.local', 'clinician', _adm)
  RETURNING id INTO _inv;
  PERFORM pg_temp.assert(_inv IS NOT NULL, 'an admin can still invite a clinician');

  PERFORM pg_temp.assert(pg_temp.refused(format(
    'UPDATE public.practice_invitations SET role = ''owner'' WHERE id = %L', _inv)),
    'an admin cannot turn an invitation into an owner invitation');

  PERFORM pg_temp.as_user(_own);
  PERFORM pg_temp.assert(NOT pg_temp.refused(format(
    'INSERT INTO public.practice_invitations (practice_id, email, role, invited_by) VALUES (%L, %L, ''owner'', %L)',
    _prac, 'saf-co-owner@test.local', _own)),
    'an owner can still offer the owner role');

  -- ==========================================================================
  -- 4. Caregiver access is granted for your own family member only
  -- ==========================================================================
  PERFORM pg_temp.as_user(_str);
  PERFORM pg_temp.assert(pg_temp.refused(format(
    'INSERT INTO public.caregiver_access (family_member_id, caregiver_user_id, granted_by) VALUES (%L, %L, %L)',
    _fm_pat, _str, _str)),
    'a stranger cannot attach themselves as caregiver to someone else''s family member');

  PERFORM pg_temp.as_user(_pat);
  INSERT INTO public.caregiver_access (family_member_id, caregiver_user_id, granted_by)
  VALUES (_fm_pat, _cg, _pat)
  RETURNING id INTO _grant;
  PERFORM pg_temp.assert(_grant IS NOT NULL,
    'a patient can grant caregiver access for their own family member');

  PERFORM pg_temp.assert(pg_temp.refused(format(
    'UPDATE public.caregiver_access SET family_member_id = %L WHERE id = %L', _fm_str, _grant)),
    'a grant cannot be moved onto somebody else''s family member');

  -- ==========================================================================
  -- 5. Notes, care plans and goals are written by clinical staff
  -- ==========================================================================
  PERFORM pg_temp.as_user(_desk);
  PERFORM pg_temp.assert(pg_temp.refused(format(
    'INSERT INTO public.internal_notes (patient_user_id, author_user_id, body, visibility) VALUES (%L, %L, ''desk note'', ''team'')',
    _pat, _desk)),
    'front desk cannot write an internal note');
  PERFORM pg_temp.assert(pg_temp.refused(format(
    'INSERT INTO public.fhir_care_plans (patient_user_id, title, status, created_by) VALUES (%L, ''Desk plan'', ''active'', %L)',
    _pat, _desk)),
    'front desk cannot write a care plan');

  PERFORM pg_temp.as_user(_doc);
  INSERT INTO public.internal_notes (patient_user_id, author_user_id, body, visibility)
  VALUES (_pat, _doc, 'Clinician note', 'team');
  PERFORM pg_temp.assert(true, 'a clinician still writes an internal note');
  INSERT INTO public.fhir_care_plans (patient_user_id, title, status, created_by)
  VALUES (_pat, 'Clinician plan', 'active', _doc)
  RETURNING id INTO _plan;
  PERFORM pg_temp.assert(_plan IS NOT NULL, 'a clinician still writes a care plan');
  INSERT INTO public.fhir_care_goals (care_plan_id, description) VALUES (_plan, 'Walk daily');
  PERFORM pg_temp.assert(true, 'a clinician still writes a care goal');
  UPDATE public.fhir_care_plans SET title = 'Clinician plan, amended' WHERE id = _plan;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 1, 'a clinician still amends a care plan');

  PERFORM pg_temp.as_user(_desk);
  UPDATE public.fhir_care_plans SET title = 'Desk amended' WHERE id = _plan;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 0, 'front desk cannot amend a care plan');
  PERFORM pg_temp.assert(pg_temp.refused(format(
    'INSERT INTO public.fhir_care_goals (care_plan_id, description) VALUES (%L, ''Desk goal'')', _plan)),
    'front desk cannot add a care goal');
  UPDATE public.fhir_care_goals SET description = 'Desk edit' WHERE care_plan_id = _plan;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 0, 'front desk cannot edit a care goal');

  PERFORM pg_temp.as_user(NULL);
  RAISE NOTICE 'ALL SMALLER ACCESS FINDINGS TESTS PASSED';
END;
$$;

ROLLBACK;
