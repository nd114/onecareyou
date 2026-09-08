-- Revoking a share ends an assigned clinician's access.
--
-- Found by running the suites as a set for the first time, September 2026.
-- `is_assigned_to_patient()` checked only that an assignment row existed and
-- was in date, and the `encounters` policy ORs it with the practice gate — so a
-- patient who withdrew their share kept having their signed assessment and raw
-- ambient transcript read by the clinician they had been assigned to.
--
-- An assignment records who is looking after whom. It is a roster fact, and it
-- was being read as a permission.
BEGIN;

DO $$
DECLARE p uuid := gen_random_uuid(); doc uuid := gen_random_uuid();
        pat uuid := gen_random_uuid(); own uuid := gen_random_uuid(); n int;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
    (doc,'doc@example.com',now()),(pat,'pat@example.com',now()),(own,'own@example.com',now());
  INSERT INTO public.practices(id,name,created_by) VALUES (p,'St Martins Hospital',own);
  INSERT INTO public.practice_members(practice_id,user_id,role,status)
    VALUES (p,own,'owner','active') ON CONFLICT (practice_id,user_id) DO UPDATE SET role='owner';
  -- Deliberately without the tenant-wide view: this is about the assignment
  -- path, not the administrative one.
  INSERT INTO public.practice_members(practice_id,user_id,role,status,can_view_all_patients)
    VALUES (p,doc,'clinician','active',false);

  INSERT INTO public.practice_shares(practice_id,user_id,is_active,share_all) VALUES (p,pat,true,true);
  INSERT INTO public.practice_patient_assignments(practice_id,patient_user_id,clinician_user_id,assigned_by)
    VALUES (p,pat,doc,own);
  INSERT INTO public.encounters(patient_user_id,clinician_user_id,practice_id,visit_type,status,signed_at,assessment,scribe_transcript)
    VALUES (pat,own,p,'annual','signed',now(),'Depression, started sertraline','everything said in the room');

  -- A tightening that breaks real access is not a fix, so this half matters
  -- as much as the next.
  PERFORM set_config('request.jwt.claim.sub', doc::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.encounters WHERE patient_user_id = pat;
  EXECUTE 'SET LOCAL ROLE postgres';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: an assigned clinician cannot read a shared record (% of 1)', n; END IF;

  PERFORM set_config('request.jwt.claim.sub', pat::text, true);
  UPDATE public.practice_shares SET is_active = false WHERE practice_id = p AND user_id = pat;

  PERFORM set_config('request.jwt.claim.sub', doc::text, true);
  IF public.is_assigned_to_patient(doc, pat) THEN
    RAISE EXCEPTION 'FAIL: the assignment still reports access after the share ended';
  END IF;

  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.encounters WHERE patient_user_id = pat;
  EXECUTE 'SET LOCAL ROLE postgres';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: reads % encounter(s) after the patient revoked', n; END IF;

  -- The row is the record of who was responsible; only the consent moved.
  IF (SELECT count(*) FROM public.practice_patient_assignments
        WHERE patient_user_id = pat AND clinician_user_id = doc) <> 1 THEN
    RAISE EXCEPTION 'FAIL: the assignment record was destroyed rather than ignored';
  END IF;

  -- A suspended practice is the practice's own switch, and closes the same door.
  UPDATE public.practice_shares SET is_active = true, practice_suspended_at = now()
   WHERE practice_id = p AND user_id = pat;
  PERFORM set_config('request.jwt.claim.sub', doc::text, true);
  IF public.is_assigned_to_patient(doc, pat) THEN
    RAISE EXCEPTION 'FAIL: a suspended practice still reaches the patient by assignment';
  END IF;

  RAISE NOTICE 'assignment_is_not_consent: 5 assertions passed';
END $$;

ROLLBACK;
