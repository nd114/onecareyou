-- practice_delete_department: owner only, archived first, trail survives.
--
-- The point of this one is the last assertion. Deleting a department cascades
-- through its members and its patient routings, so an audit entry that only
-- said "department deleted" would point at three tables that no longer hold the
-- answer. The entry has to carry the contents with it.
--
-- Run against a scaffold: see the harness in the test runner.
DO $$
DECLARE v_practice uuid := gen_random_uuid();
        v_owner uuid := gen_random_uuid();
        v_admin uuid := gen_random_uuid();
        v_dept uuid;
        v_log jsonb;
BEGIN
  INSERT INTO public.practices(id) VALUES (v_practice);
  INSERT INTO public.practice_members VALUES (v_practice, v_owner, 'owner', 'active');
  INSERT INTO public.practice_members VALUES (v_practice, v_admin, 'admin', 'active');
  INSERT INTO public.practice_departments(practice_id, name, description)
    VALUES (v_practice, 'Cardiology', 'Heart') RETURNING id INTO v_dept;
  INSERT INTO public.practice_department_members(department_id, practice_id, user_id, is_lead)
    VALUES (v_dept, v_practice, v_admin, true);
  INSERT INTO public.practice_patient_departments(department_id, patient_user_id)
    VALUES (v_dept, gen_random_uuid()), (v_dept, gen_random_uuid());

  PERFORM set_config('test.uid', v_owner::text, true);

  -- A live department cannot be deleted: no single action ends something
  -- people are working in.
  BEGIN
    PERFORM public.practice_delete_department(v_dept, 'tidy up');
    RAISE EXCEPTION 'FAIL: deleted a live department';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Archive the department%' THEN
      RAISE EXCEPTION 'FAIL: wrong refusal for a live department: %', SQLERRM;
    END IF;
  END;

  UPDATE public.practice_departments SET is_active = false WHERE id = v_dept;

  -- An administrator can archive; only the owner can end one.
  PERFORM set_config('test.uid', v_admin::text, true);
  BEGIN
    PERFORM public.practice_delete_department(v_dept, 'tidy up');
    RAISE EXCEPTION 'FAIL: a non-owner admin deleted a department';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Only the facility owner%' THEN
      RAISE EXCEPTION 'FAIL: wrong refusal for a non-owner: %', SQLERRM;
    END IF;
  END;

  PERFORM set_config('test.uid', v_owner::text, true);
  PERFORM public.practice_delete_department(v_dept, 'ward closed');

  IF EXISTS (SELECT 1 FROM public.practice_departments WHERE id = v_dept) THEN
    RAISE EXCEPTION 'FAIL: department row survived the delete';
  END IF;
  IF EXISTS (SELECT 1 FROM public.practice_department_members WHERE department_id = v_dept) THEN
    RAISE EXCEPTION 'FAIL: membership rows survived the delete';
  END IF;

  SELECT details INTO v_log FROM public.hipaa_audit_logs
   WHERE resource_id = v_dept::text AND action = 'department_deleted';

  IF v_log IS NULL THEN RAISE EXCEPTION 'FAIL: no audit entry was written'; END IF;
  IF v_log->>'name' <> 'Cardiology' THEN RAISE EXCEPTION 'FAIL: audit entry lost the name'; END IF;
  IF v_log->>'reason' <> 'ward closed' THEN RAISE EXCEPTION 'FAIL: audit entry lost the reason'; END IF;
  IF jsonb_array_length(v_log->'members') <> 1 THEN
    RAISE EXCEPTION 'FAIL: audit entry lost who was in the department';
  END IF;
  IF jsonb_array_length(v_log->'patients') <> 2 THEN
    RAISE EXCEPTION 'FAIL: audit entry lost which patients were routed there';
  END IF;

  RAISE NOTICE 'delete_department: 7 assertions passed';
END $$;
