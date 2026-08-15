-- Departments and delegated administration — boundary tests.
--
-- The point of a Sub-Admin is that they can run their own department without
-- being handed the hospital. These assert both halves: what they CAN do inside
-- their department, and what they cannot do outside it or above it.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/department_delegation.test.sql

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

CREATE OR REPLACE FUNCTION pg_temp.act_as(_user uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _user::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

-- Did a write actually land? A policy refusal raises; a policy that simply
-- matches no rows affects none. Both mean "not permitted" here.
--
-- ROW_COUNT via GET DIAGNOSTICS, not FOUND: EXECUTE does not set FOUND, so
-- reading it would report every write as a failure and make each negative
-- assertion pass for the wrong reason.
CREATE OR REPLACE FUNCTION pg_temp.try_write(_sql text)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  _rows bigint;
BEGIN
  EXECUTE _sql;
  GET DIAGNOSTICS _rows = ROW_COUNT;
  RETURN _rows > 0;
EXCEPTION WHEN insufficient_privilege OR check_violation OR raise_exception THEN
  RETURN false;
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: one hospital, two departments, a chief admin, two leads, two docs
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _chief    uuid := 'dd000000-0000-0000-0000-00000000000a';
  _peds_led uuid := 'dd000000-0000-0000-0000-00000000000b'; -- leads Paediatrics
  _emg_led  uuid := 'dd000000-0000-0000-0000-00000000000c'; -- leads Emergency
  _peds_doc uuid := 'dd000000-0000-0000-0000-00000000000d'; -- works in Paediatrics
  _emg_doc  uuid := 'dd000000-0000-0000-0000-00000000000e'; -- works in Emergency
  _patient  uuid := 'dd000000-0000-0000-0000-00000000000f';
  _hosp     uuid := 'dd111111-0000-0000-0000-000000000001';
  _peds     uuid := 'dd222222-0000-0000-0000-000000000001';
  _emg      uuid := 'dd222222-0000-0000-0000-000000000002';
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_chief,'chief@t.local'), (_peds_led,'pedslead@t.local'), (_emg_led,'emglead@t.local'),
    (_peds_doc,'pedsdoc@t.local'), (_emg_doc,'emgdoc@t.local'), (_patient,'dpatient@t.local');

  INSERT INTO public.practices (id, name, tenant_type, created_by)
  VALUES (_hosp, 'Delegation Test Hospital', 'hospital', _chief);

  INSERT INTO public.practice_members (practice_id, user_id, role, status, can_view_all_patients)
  VALUES (_hosp,_chief,'owner','active',true),
         (_hosp,_peds_led,'sub_admin','active',false),
         (_hosp,_emg_led,'sub_admin','active',false),
         (_hosp,_peds_doc,'clinician','active',false),
         (_hosp,_emg_doc,'clinician','active',false)
  ON CONFLICT (practice_id,user_id) DO UPDATE
    SET role = EXCLUDED.role, status = 'active',
        can_view_all_patients = EXCLUDED.can_view_all_patients;

  INSERT INTO public.practice_departments (id, practice_id, name, created_by)
  VALUES (_peds,_hosp,'Paediatrics',_chief), (_emg,_hosp,'Emergency',_chief);

  INSERT INTO public.practice_department_members (department_id, practice_id, user_id, is_lead, added_by)
  VALUES (_peds,_hosp,_peds_led,true,_chief),
         (_emg,_hosp,_emg_led,true,_chief),
         (_peds,_hosp,_peds_doc,false,_chief),
         (_emg,_hosp,_emg_doc,false,_chief);

  INSERT INTO public.practice_shares (practice_id, user_id, share_all)
  VALUES (_hosp,_patient,true);
END $$;

SET LOCAL ROLE authenticated;

-- ---------------------------------------------------------------------------
-- A Sub-Admin inside their own department
-- ---------------------------------------------------------------------------
SELECT pg_temp.act_as('dd000000-0000-0000-0000-00000000000b');  -- Paediatrics lead

SELECT pg_temp.assert(
  pg_temp.try_write($sql$
    INSERT INTO public.practice_patient_departments
      (practice_id, department_id, patient_user_id, assigned_by)
    VALUES ('dd111111-0000-0000-0000-000000000001','dd222222-0000-0000-0000-000000000001',
            'dd000000-0000-0000-0000-00000000000f', auth.uid())
  $sql$),
  'department lead routes a shared patient into their own department');

SELECT pg_temp.assert(
  pg_temp.try_write($sql$
    INSERT INTO public.practice_patient_assignments
      (practice_id, department_id, patient_user_id, clinician_user_id, assigned_by)
    VALUES ('dd111111-0000-0000-0000-000000000001','dd222222-0000-0000-0000-000000000001',
            'dd000000-0000-0000-0000-00000000000f','dd000000-0000-0000-0000-00000000000d', auth.uid())
  $sql$),
  'department lead assigns a clinician who works in that department');

-- ---------------------------------------------------------------------------
-- …and outside it
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert(
  NOT pg_temp.try_write($sql$
    INSERT INTO public.practice_patient_assignments
      (practice_id, department_id, patient_user_id, clinician_user_id, assigned_by)
    VALUES ('dd111111-0000-0000-0000-000000000001','dd222222-0000-0000-0000-000000000002',
            'dd000000-0000-0000-0000-00000000000f','dd000000-0000-0000-0000-00000000000e', auth.uid())
  $sql$),
  'department lead cannot assign inside another department');

SELECT pg_temp.assert(
  NOT pg_temp.try_write($sql$
    INSERT INTO public.practice_patient_assignments
      (practice_id, department_id, patient_user_id, clinician_user_id, assigned_by)
    VALUES ('dd111111-0000-0000-0000-000000000001','dd222222-0000-0000-0000-000000000001',
            'dd000000-0000-0000-0000-00000000000f','dd000000-0000-0000-0000-00000000000e', auth.uid())
  $sql$),
  'department lead cannot assign a clinician who does not work in that department');

-- Delegation must not be self-extending.
SELECT pg_temp.assert(
  NOT pg_temp.try_write($sql$
    INSERT INTO public.practice_department_members
      (department_id, practice_id, user_id, is_lead, added_by)
    VALUES ('dd222222-0000-0000-0000-000000000001','dd111111-0000-0000-0000-000000000001',
            'dd000000-0000-0000-0000-00000000000d', true, auth.uid())
  $sql$),
  'department lead cannot appoint another lead');

SELECT pg_temp.assert(
  NOT pg_temp.try_write($sql$
    INSERT INTO public.practice_departments (practice_id, name, created_by)
    VALUES ('dd111111-0000-0000-0000-000000000001','Radiology', auth.uid())
  $sql$),
  'department lead cannot create a department');

-- The hospital itself stays with the chief admin.
SELECT pg_temp.assert(
  NOT public.can_manage_practice('dd111111-0000-0000-0000-000000000001'),
  'sub_admin does not hold tenant management rights');
SELECT pg_temp.assert(
  public.has_practice_capability(auth.uid(), 'assign_patients',
    'dd111111-0000-0000-0000-000000000001'),
  'sub_admin can assign patients');
SELECT pg_temp.assert(
  NOT public.has_practice_capability(auth.uid(), 'manage_team',
    'dd111111-0000-0000-0000-000000000001'),
  'sub_admin cannot manage the team');
SELECT pg_temp.assert(
  NOT public.has_practice_capability(auth.uid(), 'manage_billing',
    'dd111111-0000-0000-0000-000000000001'),
  'sub_admin cannot manage billing');

-- ---------------------------------------------------------------------------
-- Oversight scope
-- ---------------------------------------------------------------------------
-- The Emergency lead must not see a patient routed to Paediatrics.
SELECT pg_temp.act_as('dd000000-0000-0000-0000-00000000000c');
SELECT pg_temp.assert(
  (SELECT count(*) FROM public.practice_patient_overview(
     'dd111111-0000-0000-0000-000000000001')) = 0,
  'a lead sees no patients routed to another department');

-- The chief admin sees everyone, with the access basis spelled out.
SELECT pg_temp.act_as('dd000000-0000-0000-0000-00000000000a');
SELECT pg_temp.assert(
  (SELECT count(*) FROM public.practice_patient_overview(
     'dd111111-0000-0000-0000-000000000001')) = 1,
  'chief admin sees every patient sharing with the hospital');
SELECT pg_temp.assert(
  (SELECT count(*) FROM public.practice_staff_overview(
     'dd111111-0000-0000-0000-000000000001')) = 5,
  'chief admin sees the full staff roster');
SELECT pg_temp.assert(
  (SELECT 'Paediatrics' = ANY(leads_departments)
     FROM public.practice_staff_overview('dd111111-0000-0000-0000-000000000001')
    WHERE user_id = 'dd000000-0000-0000-0000-00000000000b'),
  'roster shows which departments a sub-admin leads');
SELECT pg_temp.assert(
  (SELECT assigned_patient_count = 1
     FROM public.practice_staff_overview('dd111111-0000-0000-0000-000000000001')
    WHERE user_id = 'dd000000-0000-0000-0000-00000000000d'),
  'roster shows each clinician''s current caseload');

-- An ordinary clinician gets no oversight surface at all.
SELECT pg_temp.act_as('dd000000-0000-0000-0000-00000000000d');
SELECT pg_temp.assert(
  (SELECT count(*) FROM public.practice_staff_overview(
     'dd111111-0000-0000-0000-000000000001')) = 0,
  'a clinician sees no staff roster');

SET LOCAL ROLE postgres;
DO $$ BEGIN RAISE NOTICE 'ALL DEPARTMENT DELEGATION TESTS PASSED'; END $$;

ROLLBACK;
