-- A status a screen cannot bucket is content the patient never sees. Both
-- columns only accept the words their screens know.
BEGIN;

DO $$
DECLARE
  clin uuid := gen_random_uuid();
  pat uuid := gen_random_uuid();
  share uuid;
  guide uuid;
  med uuid;
  entry uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (clin, 'vocab-clin@test.local'), (pat, 'vocab-pat@test.local');
  INSERT INTO public.provider_shares (user_id, provider_name, invite_code, clinician_user_id, is_active)
  VALUES (pat, 'Dr Vocabulary', 'VOCABCODE1', clin, true) RETURNING id INTO share;

  -- Guidance: the four words the patient's page can sort.
  INSERT INTO public.clinician_guidance (clinician_user_id, patient_user_id, share_id, title, instruction)
  VALUES (clin, pat, share, 'Take a walk', 'Twenty minutes, most days.') RETURNING id INTO guide;

  UPDATE public.clinician_guidance SET status = 'acknowledged' WHERE id = guide;
  UPDATE public.clinician_guidance SET status = 'completed' WHERE id = guide;
  UPDATE public.clinician_guidance SET status = 'archived' WHERE id = guide;
  UPDATE public.clinician_guidance SET status = 'pending' WHERE id = guide;

  BEGIN
    UPDATE public.clinician_guidance SET status = 'active' WHERE id = guide;
    RAISE EXCEPTION 'FAIL: guidance took a status the patient''s page cannot bucket';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Doses: the four the adherence sum can count.
  INSERT INTO public.medications (user_id, name, dosage, frequency)
  VALUES (pat, 'Vocabulary tablet', '1 mg', 'Once daily') RETURNING id INTO med;
  INSERT INTO public.schedule_entries (user_id, medication_id, scheduled_time)
  VALUES (pat, med, now()) RETURNING id INTO entry;

  UPDATE public.schedule_entries SET status = 'taken' WHERE id = entry;
  UPDATE public.schedule_entries SET status = 'skipped' WHERE id = entry;
  UPDATE public.schedule_entries SET status = 'missed' WHERE id = entry;
  UPDATE public.schedule_entries SET status = 'pending' WHERE id = entry;

  BEGIN
    UPDATE public.schedule_entries SET status = 'due' WHERE id = entry;
    RAISE EXCEPTION 'FAIL: a dose took a status adherence cannot count';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- The insert path too, not only the update path.
  BEGIN
    INSERT INTO public.schedule_entries (user_id, medication_id, scheduled_time, status)
    VALUES (pat, med, now(), 'unknown');
    RAISE EXCEPTION 'FAIL: an insert introduced a dose status outside the vocabulary';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  RAISE NOTICE 'status vocabularies: ok';
END $$;

ROLLBACK;
