-- Care plans: what the rest of the record is for, and who may see it.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/fhir_care_plans.test.sql

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
  _patient  uuid := 'c9a00000-0000-0000-0000-000000000001';
  _doctor   uuid := 'c9a00000-0000-0000-0000-000000000002';
  _stranger uuid := 'c9a00000-0000-0000-0000-000000000003';
  _draft uuid; _active uuid;
  _count integer; _ok boolean;
BEGIN
  INSERT INTO auth.users (id,email) VALUES
    (_patient,'cp-p@test.local'), (_doctor,'cp-d@test.local'), (_stranger,'cp-s@test.local');

  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES (_patient,_doctor,'Dr Plan','cp-d@test.local','cptest','{"profile":true}'::jsonb,true);

  INSERT INTO public.fhir_care_plans (patient_user_id, title, status, created_by)
  VALUES (_patient,'Diabetes control — draft','draft',_doctor) RETURNING id INTO _draft;

  INSERT INTO public.fhir_care_plans
    (patient_user_id, title, description, status, period_start, period_end, created_by)
  VALUES (_patient,'Diabetes control','Bring the HbA1c down and keep it there','active',
          current_date, current_date + 180, _doctor)
  RETURNING id INTO _active;

  INSERT INTO public.fhir_care_goals
    (care_plan_id, description, measure_type, target_comparator, target_value, target_unit, due_date)
  VALUES (_active,'HbA1c under 7%','hba1c','<',7,'%', current_date + 180),
         (_active,'Walk more on most days', NULL, NULL, NULL, NULL, NULL);

  -- ==========================================================================
  -- 1. A goal is measurable or it is not — never half
  --
  -- Half a target renders as a number with no meaning, which is worse than a
  -- goal that says plainly it cannot be scored.
  -- ==========================================================================
  BEGIN
    INSERT INTO public.fhir_care_goals (care_plan_id, description, measure_type)
    VALUES (_active,'Half a target','hba1c');
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'a measure with no comparator or value is refused');

  BEGIN
    INSERT INTO public.fhir_care_goals (care_plan_id, description, target_value)
    VALUES (_active,'A number about nothing', 7);
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'a value with nothing to measure is refused');

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.fhir_care_goals WHERE care_plan_id = _active AND measure_type IS NULL) = 1,
    'a goal with no measure at all is allowed — "walk more" is a real thing to say');

  BEGIN
    INSERT INTO public.fhir_care_goals (care_plan_id, description, measure_type, target_comparator, target_value)
    VALUES (_active,'Bad comparator','hba1c','~',7);
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'a comparator outside the four is refused');

  -- ==========================================================================
  -- 2. The plan itself has to make sense
  -- ==========================================================================
  BEGIN
    INSERT INTO public.fhir_care_plans (patient_user_id, title, created_by)
    VALUES (_patient,'   ',_doctor);
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'a plan needs a title');

  BEGIN
    UPDATE public.fhir_care_plans
       SET period_start = current_date, period_end = current_date - 1 WHERE id = _active;
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'a plan cannot end before it starts');

  BEGIN
    UPDATE public.fhir_care_plans SET status = 'finished' WHERE id = _active;
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'a status outside the FHIR value set is refused');

  -- ==========================================================================
  -- 3. The patient sees the active plan, not the draft
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.fhir_care_plans;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1, 'the patient sees the active plan');

  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.fhir_care_plans WHERE status = 'draft';
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'and not one still being decided');

  -- Goals follow the plan, through a subquery that inherits its policies.
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.fhir_care_goals;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 2, 'the patient reads the goals of the plan they can see');

  -- ==========================================================================
  -- 4. The clinician sees both; a stranger sees neither
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.fhir_care_plans;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 2, 'the clinician sees the draft as well as the active plan');

  PERFORM set_config('request.jwt.claim.sub', _stranger::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.fhir_care_plans;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'an unrelated clinician sees no plans at all');

  PERFORM set_config('request.jwt.claim.sub', _stranger::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.fhir_care_goals;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'and no goals either');

  -- ==========================================================================
  -- 5. The patient reads but does not write
  --
  -- A plan is what the clinician and patient agreed; the patient changing it
  -- unilaterally in the record is a different feature.
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.fhir_care_plans SET status = 'completed' WHERE id = _active;
    GET DIAGNOSTICS _count = ROW_COUNT;
    _ok := _count > 0;
  EXCEPTION WHEN insufficient_privilege THEN _ok := false;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(NOT _ok, 'a patient cannot mark their own plan complete');

  -- ==========================================================================
  -- 6. A plan is revoked, not deleted
  -- ==========================================================================
  GRANT DELETE ON public.fhir_care_plans TO authenticated;
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM public.fhir_care_plans WHERE id = _active;
  GET DIAGNOSTICS _count = ROW_COUNT;
  EXECUTE 'SET LOCAL ROLE postgres';
  REVOKE DELETE ON public.fhir_care_plans FROM authenticated;
  PERFORM pg_temp.assert(_count = 0, 'no DELETE policy exists, so a plan cannot be deleted');

  UPDATE public.fhir_care_plans SET status = 'revoked' WHERE id = _active;
  PERFORM pg_temp.assert(
    (SELECT status FROM public.fhir_care_plans WHERE id = _active) = 'revoked',
    'it is revoked instead, and stays in the record');

  RAISE NOTICE 'ALL CARE PLAN TESTS PASSED';
END
$$;

ROLLBACK;
