-- A signed note is a record, not a draft.
--
-- encounters.signed_at existed and meant nothing before this: the update policy
-- is (clinician_user_id = auth.uid()) with no reference to it, so an author
-- could rewrite a signed assessment and leave nothing behind but a changed
-- updated_at. That was verified by doing it, and test 1 is that same attempt.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/signed_notes.test.sql

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
  _patient  uuid := 'e5000000-0000-0000-0000-000000000001';
  _doctor   uuid := 'e5000000-0000-0000-0000-000000000002';
  _colleague uuid := 'e5000000-0000-0000-0000-000000000003';
  _stranger uuid := 'e5000000-0000-0000-0000-000000000004';
  _draft uuid; _signed uuid;
  _txt text; _count integer; _ok boolean;
BEGIN
  INSERT INTO auth.users (id,email) VALUES
    (_patient,'sn-patient@test.local'), (_doctor,'sn-doctor@test.local'),
    (_colleague,'sn-colleague@test.local'), (_stranger,'sn-stranger@test.local');

  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES (_patient, _doctor, 'Dr Note', 'sn-doctor@test.local', 'sntest',
          '{"profile":true}'::jsonb, true),
         (_patient, _colleague, 'Dr Colleague', 'sn-colleague@test.local', 'sntes2',
          '{"profile":true}'::jsonb, true);

  INSERT INTO public.encounters (patient_user_id, clinician_user_id, visit_type, status, assessment, plan)
  VALUES (_patient, _doctor, 'follow_up', 'in_progress', 'Draft assessment', 'Draft plan')
  RETURNING id INTO _draft;

  INSERT INTO public.encounters
    (patient_user_id, clinician_user_id, visit_type, status, signed_at, assessment, plan, shared_with_patient)
  VALUES (_patient, _doctor, 'annual', 'signed', now(),
          'Diabetes well controlled', 'Continue metformin; review in six months', true)
  RETURNING id INTO _signed;

  -- ==========================================================================
  -- 1. A signed note cannot be rewritten — the whole point
  -- ==========================================================================
  BEGIN
    UPDATE public.encounters SET assessment = 'Actually I never said that' WHERE id = _signed;
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'a signed assessment cannot be rewritten');

  SELECT assessment INTO _txt FROM public.encounters WHERE id = _signed;
  PERFORM pg_temp.assert(_txt = 'Diabetes well controlled',
    'and the original text is still what it was');

  BEGIN
    UPDATE public.encounters SET plan = 'Something else' WHERE id = _signed;
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'nor the plan');

  BEGIN
    UPDATE public.encounters SET cpt_codes = ARRAY['99215'] WHERE id = _signed;
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'nor the billing codes, which are a claim about the visit');

  BEGIN
    UPDATE public.encounters SET scribe_transcript = 'edited' WHERE id = _signed;
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'nor the transcript the note was written from');

  -- ==========================================================================
  -- 2. A note cannot be un-signed
  --
  -- Otherwise every protection above is one UPDATE away from being stepped
  -- around.
  -- ==========================================================================
  BEGIN
    UPDATE public.encounters SET signed_at = NULL WHERE id = _signed;
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'a signed note cannot be un-signed');

  BEGIN
    UPDATE public.encounters SET signed_at = now() - interval '30 days' WHERE id = _signed;
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'nor back-dated');

  -- ==========================================================================
  -- 3. A draft is still a draft
  -- ==========================================================================
  UPDATE public.encounters SET assessment = 'Revised while still drafting' WHERE id = _draft;
  SELECT assessment INTO _txt FROM public.encounters WHERE id = _draft;
  PERFORM pg_temp.assert(_txt = 'Revised while still drafting',
    'an unsigned note is freely editable, as a draft should be');

  UPDATE public.encounters SET status = 'signed', signed_at = now() WHERE id = _draft;
  PERFORM pg_temp.assert(
    (SELECT signed_at FROM public.encounters WHERE id = _draft) IS NOT NULL,
    'and signing it works');

  BEGIN
    UPDATE public.encounters SET assessment = 'Too late' WHERE id = _draft;
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'after which it is frozen like any other');

  -- ==========================================================================
  -- 4. What may still change after signing
  --
  -- Sharing is a decision about disclosure, not a clinical claim, and a
  -- clinician may reasonably change their mind. Retraction keeps the note
  -- visible rather than leaving a gap where one used to be.
  -- ==========================================================================
  UPDATE public.encounters SET shared_with_patient = false WHERE id = _signed;
  PERFORM pg_temp.assert(
    (SELECT shared_with_patient FROM public.encounters WHERE id = _signed) = false,
    'sharing can be withdrawn after signing');

  UPDATE public.encounters SET status = 'entered-in-error' WHERE id = _signed;
  SELECT assessment INTO _txt FROM public.encounters WHERE id = _signed;
  PERFORM pg_temp.assert(_txt = 'Diabetes well controlled',
    'retracting a note marks it, and leaves the text readable');

  -- ==========================================================================
  -- 5. Corrections go in an addendum
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.encounter_addenda (encounter_id, author_user_id, body)
  VALUES (_signed, _doctor, 'HbA1c from 12 May was 7.8, not 6.9 as recorded.');
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.encounter_addenda WHERE encounter_id = _signed) = 1,
    'the author can append a correction');

  -- A colleague who can reach the patient can add one too: the next clinician
  -- to notice an error should not have to find the original author.
  PERFORM set_config('request.jwt.claim.sub', _colleague::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.encounter_addenda (encounter_id, author_user_id, body)
  VALUES (_signed, _colleague, 'Patient reports the metformin was stopped in June.');
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.encounter_addenda WHERE encounter_id = _signed) = 2,
    'so can a colleague who can reach the patient');

  -- An addendum cannot be filed under somebody else's name.
  PERFORM set_config('request.jwt.claim.sub', _colleague::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.encounter_addenda (encounter_id, author_user_id, body)
    VALUES (_signed, _doctor, 'Signed by someone who did not write it');
    _ok := true;
  EXCEPTION WHEN insufficient_privilege THEN _ok := false;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(NOT _ok, 'an addendum cannot be attributed to another clinician');

  -- A stranger cannot append to a record they have no part in.
  PERFORM set_config('request.jwt.claim.sub', _stranger::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.encounter_addenda (encounter_id, author_user_id, body)
    VALUES (_signed, _stranger, 'I was never here');
    _ok := true;
  EXCEPTION WHEN insufficient_privilege THEN _ok := false;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(NOT _ok, 'an unrelated clinician cannot append to the record');

  -- ==========================================================================
  -- 6. An addendum is itself append-only
  --
  -- An addendum that was wrong is corrected by another addendum. Editing the
  -- first would reintroduce exactly the problem addenda exist to solve.
  -- ==========================================================================
  GRANT UPDATE, DELETE ON public.encounter_addenda TO authenticated;

  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.encounter_addenda SET body = 'rewritten' WHERE author_user_id = _doctor;
  GET DIAGNOSTICS _count = ROW_COUNT;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'an addendum cannot be edited, even by its author');

  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM public.encounter_addenda WHERE author_user_id = _doctor;
  GET DIAGNOSTICS _count = ROW_COUNT;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'nor deleted');

  REVOKE UPDATE, DELETE ON public.encounter_addenda FROM authenticated;

  PERFORM pg_temp.assert(
    (SELECT body FROM public.encounter_addenda WHERE author_user_id = _doctor)
      = 'HbA1c from 12 May was 7.8, not 6.9 as recorded.',
    'and the original wording survived both attempts');

  -- ==========================================================================
  -- 7. An addendum is readable by whoever can read the note
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _stranger::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.encounter_addenda;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0,
    'someone who cannot read the note reads none of its addenda');

  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.encounter_addenda;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 2, 'the author reads both');

  -- ==========================================================================
  -- 8. An empty addendum is not a correction
  -- ==========================================================================
  BEGIN
    INSERT INTO public.encounter_addenda (encounter_id, author_user_id, body)
    VALUES (_signed, _doctor, '   ');
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'a blank addendum is refused');

  -- ==========================================================================
  -- 9. A correction reaches the patient who was given the thing it corrects
  --
  -- Patients read summaries through my_visit_summaries(), a SECURITY DEFINER
  -- function, because they hold no direct SELECT on encounters. The addendum
  -- policy defers to the encounter policies, so without a matching function the
  -- patient saw the summary and none of its corrections — found by testing, not
  -- by reasoning about it. Reading "all well" on a note since corrected is being
  -- shown what the record no longer says.
  -- ==========================================================================
  UPDATE public.encounters SET status = 'signed' WHERE id = _signed;
  UPDATE public.encounters SET shared_with_patient = true WHERE id = _signed;

  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.my_visit_summary_addenda();
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 2,
    'the patient reads corrections to a summary they were given');

  -- Withdrawing the share withdraws the corrections with it. A patient should
  -- not keep receiving amendments to something they can no longer see.
  UPDATE public.encounters SET shared_with_patient = false WHERE id = _signed;
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.my_visit_summary_addenda();
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0,
    'and none once the summary is no longer shared');

  -- A retracted note's corrections go with it, same as the note.
  UPDATE public.encounters SET shared_with_patient = true WHERE id = _signed;
  UPDATE public.encounters SET status = 'entered-in-error' WHERE id = _signed;
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.my_visit_summary_addenda();
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'nor on a note that was retracted');

  PERFORM set_config('request.jwt.claim.sub', _stranger::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.my_visit_summary_addenda();
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'and somebody else''s corrections reach nobody');

  RAISE NOTICE 'ALL SIGNED NOTE TESTS PASSED';
END
$$;

ROLLBACK;
