-- Assignment-first access: a switch a hospital turns on, not a deploy that
-- narrows everyone.
--
-- The first assertion is the one that matters. Flipping the default globally
-- would empty every clinician's panel at any hospital where assignments have
-- not been made — patients they are treating disappear, and the way back is
-- administrative work nobody has been asked to do. That is the objection that
-- deferred this change the first time, and it has not gone away.
DO $$
DECLARE v_p uuid := gen_random_uuid();
        v_owner uuid := gen_random_uuid();
        v_doc uuid := gen_random_uuid();
        v_nurse uuid := gen_random_uuid();
        v_changed int;
        v_flag boolean;
BEGIN
  INSERT INTO public.practices(id, name, created_by) VALUES (v_p, 'Riverside Medical', v_owner);
  INSERT INTO public.practice_members(practice_id, user_id, role) VALUES (v_p, v_owner, 'owner')
    ON CONFLICT (practice_id, user_id) DO UPDATE SET role = 'owner', status = 'active';
  INSERT INTO public.practice_members(practice_id, user_id, role) VALUES (v_p, v_doc, 'clinician')
    ON CONFLICT (practice_id, user_id) DO NOTHING;
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);

  SELECT can_view_all_patients INTO v_flag FROM public.practice_members WHERE user_id = v_doc;
  IF NOT v_flag THEN RAISE EXCEPTION 'FAIL: the migration narrowed an existing clinician'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_doc::text, true);
  BEGIN
    PERFORM public.practice_set_assignment_first(v_p, true);
    RAISE EXCEPTION 'FAIL: a clinician changed the access model';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%owner or an admin%' THEN
      RAISE EXCEPTION 'FAIL: wrong refusal for a non-admin: %', SQLERRM;
    END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  SELECT public.practice_set_assignment_first(v_p, true) INTO v_changed;
  IF v_changed <> 1 THEN RAISE EXCEPTION 'FAIL: expected 1 member changed, got %', v_changed; END IF;

  SELECT can_view_all_patients INTO v_flag FROM public.practice_members WHERE user_id = v_doc;
  IF v_flag THEN RAISE EXCEPTION 'FAIL: the clinician kept the tenant-wide view'; END IF;

  -- Somebody has to be able to see the whole hospital in order to route it.
  SELECT can_view_all_patients INTO v_flag FROM public.practice_members WHERE user_id = v_owner;
  IF NOT v_flag THEN RAISE EXCEPTION 'FAIL: the owner lost the administrative view'; END IF;

  INSERT INTO public.practice_members(practice_id, user_id, role) VALUES (v_p, v_nurse, 'nurse');
  SELECT can_view_all_patients INTO v_flag FROM public.practice_members WHERE user_id = v_nurse;
  IF v_flag THEN RAISE EXCEPTION 'FAIL: a new clinician was given the wide view anyway'; END IF;

  SELECT public.practice_set_assignment_first(v_p, false) INTO v_changed;
  IF v_changed <> 2 THEN RAISE EXCEPTION 'FAIL: expected 2 members restored, got %', v_changed; END IF;

  IF (SELECT count(*) FROM public.hipaa_audit_logs
        WHERE resource_id = v_p::text
          AND action IN ('assignment_first_enabled','assignment_first_disabled')) <> 2 THEN
    RAISE EXCEPTION 'FAIL: the change was not audited in both directions';
  END IF;

  RAISE NOTICE 'assignment_first_access: 8 assertions passed';
END $$;
