-- A clinician with no practice can keep a personal task list.
--
-- "Create task" was dead in review: practice_tasks.practice_id was NOT NULL and
-- the dialog would not submit without one, so a solo clinician (and every demo
-- account) could not create a task at all. These assert the personal case works
-- and stays private, and that the shared practice case is unchanged.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/personal_tasks.test.sql

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(_condition boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _condition IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', _label; END IF;
  RAISE NOTICE '  ok — %', _label;
END;
$$;

DO $$
DECLARE
  _solo    uuid := 'c1000000-0000-0000-0000-000000000001';
  _member  uuid := 'c1000000-0000-0000-0000-000000000002';
  _manager uuid := 'c1000000-0000-0000-0000-000000000003';
  _prac    uuid := 'c1111111-0000-0000-0000-000000000001';
  _count integer;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_solo,'solo@test.local'), (_member,'member@test.local'), (_manager,'manager@test.local');

  INSERT INTO public.practices (id, name, tenant_type, created_by)
  VALUES (_prac, 'Task Test Practice', 'practice', _manager);

  -- The owner row is created by a trigger on practices; only the member is new.
  INSERT INTO public.practice_members (practice_id, user_id, role, status)
  VALUES (_prac, _member, 'clinician', 'active')
  ON CONFLICT (practice_id, user_id) DO NOTHING;

  -- ========================================================================
  -- 1. A clinician with no practice can create a task for themselves
  -- ========================================================================
  PERFORM set_config('request.jwt.claim.sub', _solo::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.practice_tasks (practice_id, assignee_user_id, created_by, title)
  VALUES (NULL, _solo, _solo, 'Call patient about BP reading');
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT count(*) INTO _count FROM public.practice_tasks
   WHERE created_by = _solo AND practice_id IS NULL;
  PERFORM pg_temp.assert(_count = 1, 'a clinician with no practice can create a task');

  -- ========================================================================
  -- 2. A personal task is private — not even a practice manager sees it
  -- ========================================================================
  PERFORM set_config('request.jwt.claim.sub', _manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.practice_tasks WHERE created_by = _solo;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'a personal task is invisible to a practice manager');

  PERFORM set_config('request.jwt.claim.sub', _solo::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.practice_tasks WHERE created_by = _solo;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1, 'the clinician can still see their own personal task');

  -- ========================================================================
  -- 3. Nobody can create a personal task assigned to someone else
  -- ========================================================================
  PERFORM set_config('request.jwt.claim.sub', _solo::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.practice_tasks (practice_id, assignee_user_id, created_by, title)
    VALUES (NULL, _member, _solo, 'Do my work for me');
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'FAILED: a practice-less task was assigned to another user';
  EXCEPTION WHEN insufficient_privilege THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE NOTICE '  ok — a personal task cannot be pushed onto another clinician';
  END;

  -- ========================================================================
  -- 4. The shared practice queue still works exactly as before
  -- ========================================================================
  PERFORM set_config('request.jwt.claim.sub', _member::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.practice_tasks (practice_id, assignee_user_id, created_by, title)
  VALUES (_prac, _member, _member, 'Chase lab result');
  EXECUTE 'SET LOCAL ROLE postgres';

  PERFORM set_config('request.jwt.claim.sub', _manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.practice_tasks WHERE practice_id = _prac;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1, 'a practice manager still sees their team''s tasks');

  RAISE NOTICE 'ALL PERSONAL TASK TESTS PASSED';
END $$;

ROLLBACK;
