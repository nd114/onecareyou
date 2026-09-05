-- One action, one row.
--
-- A walkthrough of another hospital's system found two rows in a doctor's
-- consultation list sharing the same note, the same patient and the same
-- timestamp to the microsecond — one action fired twice, both saved. Nothing
-- here stopped the same thing: the client disables its buttons while a write
-- is in flight, which covers the impatient second click and nothing else. A
-- request that succeeds and loses its response gets retried, and the retry
-- lands on a server with no memory of the first.
--
-- These assertions are about the discard being silent and narrow: a duplicate
-- disappears, and everything that merely resembles one still gets written.

BEGIN;

DO $$
DECLARE
  doc   uuid := gen_random_uuid();
  pat   uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  ts    timestamptz := now();
  n     int;
BEGIN
  -- ---------------------------------------------------------------
  -- Instructions
  -- ---------------------------------------------------------------
  INSERT INTO public.clinician_guidance (clinician_user_id, patient_user_id, title, instruction)
  VALUES (doc, pat, 'Take with food', 'Take the metformin with your evening meal.');
  INSERT INTO public.clinician_guidance (clinician_user_id, patient_user_id, title, instruction)
  VALUES (doc, pat, 'Take with food', 'Take the metformin with your evening meal.');

  SELECT count(*) INTO n FROM public.clinician_guidance
   WHERE clinician_user_id = doc AND patient_user_id = pat;
  IF n <> 1 THEN
    RAISE EXCEPTION 'the same instruction sent twice was stored % times, not once', n;
  END IF;
  RAISE NOTICE 'a double-submitted instruction is stored once: t';

  -- The same words to a different patient is a different instruction.
  INSERT INTO public.clinician_guidance (clinician_user_id, patient_user_id, title, instruction)
  VALUES (doc, other, 'Take with food', 'Take the metformin with your evening meal.');
  SELECT count(*) INTO n FROM public.clinician_guidance WHERE patient_user_id = other;
  IF n <> 1 THEN
    RAISE EXCEPTION 'an instruction to a second patient was swallowed as a duplicate';
  END IF;
  RAISE NOTICE 'the same words to another patient still send: t';

  -- Different wording to the same patient is a second instruction.
  INSERT INTO public.clinician_guidance (clinician_user_id, patient_user_id, title, instruction)
  VALUES (doc, pat, 'Take with food', 'Take it with breakfast instead.');
  SELECT count(*) INTO n FROM public.clinician_guidance
   WHERE clinician_user_id = doc AND patient_user_id = pat;
  IF n <> 2 THEN
    RAISE EXCEPTION 'a reworded instruction was swallowed as a duplicate';
  END IF;
  RAISE NOTICE 'rewording sends a second instruction: t';

  -- Outside the window a repeat is intent, not an accident.
  UPDATE public.clinician_guidance SET created_at = now() - interval '5 minutes'
   WHERE clinician_user_id = doc;
  INSERT INTO public.clinician_guidance (clinician_user_id, patient_user_id, title, instruction)
  VALUES (doc, pat, 'Take with food', 'Take the metformin with your evening meal.');
  SELECT count(*) INTO n FROM public.clinician_guidance
   WHERE clinician_user_id = doc AND patient_user_id = pat;
  IF n <> 3 THEN
    RAISE EXCEPTION 'sending the same instruction again five minutes later was blocked';
  END IF;
  RAISE NOTICE 'the same instruction later is a deliberate repeat: t';

  -- ---------------------------------------------------------------
  -- Encounters
  -- ---------------------------------------------------------------
  INSERT INTO public.encounters (clinician_user_id, patient_user_id, occurred_at, assessment)
  VALUES (doc, pat, ts, 'Well.');
  INSERT INTO public.encounters (clinician_user_id, patient_user_id, occurred_at, assessment)
  VALUES (doc, pat, ts, 'Well.');
  SELECT count(*) INTO n FROM public.encounters WHERE clinician_user_id = doc;
  IF n <> 1 THEN
    RAISE EXCEPTION 'the same encounter saved twice was stored % times', n;
  END IF;
  RAISE NOTICE 'a double-submitted encounter is stored once: t';

  -- An empty draft saved twice is still one empty draft. IS NOT DISTINCT FROM
  -- is what makes this hold: every field is NULL on both sides.
  INSERT INTO public.encounters (clinician_user_id, patient_user_id, occurred_at)
  VALUES (doc, other, ts);
  INSERT INTO public.encounters (clinician_user_id, patient_user_id, occurred_at)
  VALUES (doc, other, ts);
  SELECT count(*) INTO n FROM public.encounters WHERE patient_user_id = other;
  IF n <> 1 THEN
    RAISE EXCEPTION 'an empty encounter saved twice was stored % times — NULLs compared as distinct', n;
  END IF;
  RAISE NOTICE 'an empty draft saved twice is stored once: t';

  -- ---------------------------------------------------------------
  -- Readings
  -- ---------------------------------------------------------------
  INSERT INTO public.vitals (user_id, type, value, secondary_value, unit, recorded_at)
  VALUES (pat, 'blood_pressure', 128, 82, 'mmHg', ts);
  INSERT INTO public.vitals (user_id, type, value, secondary_value, unit, recorded_at)
  VALUES (pat, 'blood_pressure', 128, 82, 'mmHg', ts);
  SELECT count(*) INTO n FROM public.vitals WHERE user_id = pat AND type = 'blood_pressure';
  IF n <> 1 THEN
    RAISE EXCEPTION 'the same reading logged twice was stored % times', n;
  END IF;
  RAISE NOTICE 'a double-submitted reading is stored once: t';

  -- A genuine second reading differs in recorded_at, which is the reading's own
  -- timestamp rather than the moment it was typed.
  INSERT INTO public.vitals (user_id, type, value, secondary_value, unit, recorded_at)
  VALUES (pat, 'blood_pressure', 128, 82, 'mmHg', ts + interval '1 second');
  SELECT count(*) INTO n FROM public.vitals WHERE user_id = pat AND type = 'blood_pressure';
  IF n <> 2 THEN
    RAISE EXCEPTION 'a second reading a second later was swallowed as a duplicate';
  END IF;
  RAISE NOTICE 'a genuine second reading is kept: t';

  RAISE NOTICE 'no_double_submit: all assertions passed';
END $$;

ROLLBACK;
