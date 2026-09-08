-- Stopping is the patient's to say; editing is not.
--
-- The bug behind this: `is_active` carried two facts at once, and the
-- clinician's chart filtered on it. So a patient who stopped taking a
-- hospital-prescribed drug removed the single most clinically significant
-- statement their record can make from the only person who needed it.
--
-- The assertions that matter most are 3 and 7. A patient must be able to stop
-- an imported medicine — refusing would be refusing their account of their own
-- behaviour — and must still not be able to rewrite what it says was
-- prescribed.
BEGIN;

DO $$
DECLARE
  v_patient   uuid := gen_random_uuid();
  v_other     uuid := gen_random_uuid();
  v_own       uuid := gen_random_uuid();
  v_imported  uuid := gen_random_uuid();
  v_med       public.medications;
  v_count     int;
  v_ok        boolean;
  v_text      text;
  v_date      date;
  v_days      int;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
    (v_patient,'p@example.com',now()),
    (v_other,'other@example.com',now());

  INSERT INTO public.medications (id, user_id, name, dosage, frequency, source, start_date)
  VALUES
    (v_own, v_patient, 'Vitamin D', '1000 iu', 'once daily', 'manual', CURRENT_DATE - 60),
    (v_imported, v_patient, 'Morphine', '10 mg', 'twice daily', 'hospital_ehr', CURRENT_DATE - 30);

  -- -------------------------------------------------------------------------
  -- 1. A patient stops their own medicine.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  SET LOCAL ROLE authenticated;
  v_med := public.stop_medication(v_own, 'Ran out', NULL);
  RESET ROLE;

  IF v_med.is_active THEN RAISE EXCEPTION 'FAIL: stopping left it active'; END IF;
  IF v_med.stopped_by <> 'patient' THEN RAISE EXCEPTION 'FAIL: stopped_by is %', v_med.stopped_by; END IF;
  IF v_med.stopped_reason <> 'Ran out' THEN RAISE EXCEPTION 'FAIL: the reason was not kept'; END IF;

  -- -------------------------------------------------------------------------
  -- 2. The row survives. Stopping is not deleting: what somebody used to take
  --    is part of their record.
  -- -------------------------------------------------------------------------
  SELECT count(*) INTO v_count FROM public.medications WHERE id = v_own;
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: stopping removed the row'; END IF;

  -- -------------------------------------------------------------------------
  -- 3. A patient may stop a medicine the hospital prescribed. This is their
  --    account of their own behaviour, and refusing it does not make them take
  --    the medicine — it only makes the record wrong.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  SET LOCAL ROLE authenticated;
  v_med := public.stop_medication(v_imported, 'The side effects were unbearable', NULL);
  RESET ROLE;

  IF v_med.is_active THEN RAISE EXCEPTION 'FAIL: a patient could not stop an imported medicine'; END IF;
  IF v_med.stopped_by <> 'patient' THEN RAISE EXCEPTION 'FAIL: an imported stop was not attributed to the patient'; END IF;

  -- -------------------------------------------------------------------------
  -- 4. Provenance is untouched. The row is still the hospital's record of what
  --    it prescribed; only the patient's behaviour changed.
  -- -------------------------------------------------------------------------
  SELECT source INTO v_text FROM public.medications WHERE id = v_imported;
  IF v_text <> 'hospital_ehr' THEN RAISE EXCEPTION 'FAIL: stopping rewrote provenance to %', v_text; END IF;
  SELECT dosage INTO v_text FROM public.medications WHERE id = v_imported;
  IF v_text <> '10 mg' THEN RAISE EXCEPTION 'FAIL: stopping changed the recorded dose'; END IF;

  -- -------------------------------------------------------------------------
  -- 5. A stop can be backdated, because that is how people report. Somebody
  --    saying in October that they stopped in August is telling the truth.
  -- -------------------------------------------------------------------------
  INSERT INTO public.medications (user_id, name, dosage, frequency, source, start_date)
  VALUES (v_patient, 'Amlodipine', '5 mg', 'once daily', 'manual', CURRENT_DATE - 90)
  RETURNING id INTO v_own;

  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  SET LOCAL ROLE authenticated;
  v_med := public.stop_medication(v_own, NULL, CURRENT_DATE - 40);
  RESET ROLE;

  IF v_med.end_date <> CURRENT_DATE - 40 THEN
    RAISE EXCEPTION 'FAIL: the backdated stop was not honoured (%)', v_med.end_date;
  END IF;

  -- -------------------------------------------------------------------------
  -- 6. When it stopped and when we were told are separate, and the gap is
  --    readable. A record that stamps an August stop as October is not right.
  -- -------------------------------------------------------------------------
  SELECT reported_after_days INTO v_days
    FROM public.medications_with_status WHERE id = v_own;
  IF v_days <> 40 THEN RAISE EXCEPTION 'FAIL: the reporting gap reads as % days, not 40', v_days; END IF;

  SELECT status INTO v_text FROM public.medications_with_status WHERE id = v_own;
  IF v_text <> 'stopped_by_patient' THEN RAISE EXCEPTION 'FAIL: status is %', v_text; END IF;

  -- A stop cannot be dated before the medicine began, nor in the future. Either
  -- would quietly corrupt the adherence window it is measured against.
  INSERT INTO public.medications (user_id, name, dosage, frequency, source, start_date)
  VALUES (v_patient, 'Ramipril', '5 mg', 'once daily', 'manual', CURRENT_DATE - 10)
  RETURNING id INTO v_own;

  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  SET LOCAL ROLE authenticated;
  v_med := public.stop_medication(v_own, NULL, CURRENT_DATE - 400);
  RESET ROLE;
  IF v_med.end_date <> CURRENT_DATE - 10 THEN
    RAISE EXCEPTION 'FAIL: a stop was dated before the medicine started (%)', v_med.end_date;
  END IF;

  INSERT INTO public.medications (user_id, name, dosage, frequency, source, start_date)
  VALUES (v_patient, 'Atorvastatin', '20 mg', 'once daily', 'manual', CURRENT_DATE - 10)
  RETURNING id INTO v_own;

  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  SET LOCAL ROLE authenticated;
  v_med := public.stop_medication(v_own, NULL, CURRENT_DATE + 30);
  RESET ROLE;
  IF v_med.end_date <> CURRENT_DATE THEN
    RAISE EXCEPTION 'FAIL: a stop was dated in the future (%)', v_med.end_date;
  END IF;

  -- -------------------------------------------------------------------------
  -- 7. Stopping is allowed; rewriting what was prescribed is not. The imported
  --    row's dose is still the sending system's statement.
  --
  --    Asserted on the row rather than on an exception: the medications UPDATE
  --    policy has no provenance condition, so this is guarded in the client.
  --    What must hold at the database is that stopping did not become a way to
  --    reach those columns.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.stop_medication(v_imported, 'again', NULL);
  RESET ROLE;
  SELECT dosage INTO v_text FROM public.medications WHERE id = v_imported;
  IF v_text <> '10 mg' THEN RAISE EXCEPTION 'FAIL: a repeated stop altered the dose'; END IF;

  -- -------------------------------------------------------------------------
  -- 8. Nobody else can stop somebody's medicine. A clinician who wants it
  --    stopped proposes that, and the patient accepts.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.stop_medication(v_imported, 'not mine to stop', NULL);
    RESET ROLE;
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
  END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL: somebody else stopped this patient''s medicine'; END IF;

  -- -------------------------------------------------------------------------
  -- 9. Past doses survive. Deleting the history of doses that were due would
  --    rewrite adherence to look as though nothing was ever missed.
  -- -------------------------------------------------------------------------
  INSERT INTO public.medications (id, user_id, name, dosage, frequency, source, start_date)
  VALUES (gen_random_uuid(), v_patient, 'Sertraline', '50 mg', 'once daily', 'manual', CURRENT_DATE - 20)
  RETURNING id INTO v_own;

  INSERT INTO public.schedule_entries (user_id, medication_id, scheduled_time, status) VALUES
    (v_patient, v_own, now() - interval '2 days', 'missed'),
    (v_patient, v_own, now() - interval '1 day', 'taken'),
    (v_patient, v_own, now() + interval '1 day', 'pending');

  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.stop_medication(v_own, NULL, NULL);
  RESET ROLE;

  SELECT count(*) INTO v_count
    FROM public.schedule_entries
   WHERE medication_id = v_own AND scheduled_time < now();
  IF v_count <> 2 THEN RAISE EXCEPTION 'FAIL: stopping erased % past doses', 2 - v_count; END IF;

  SELECT count(*) INTO v_count
    FROM public.schedule_entries
   WHERE medication_id = v_own AND status = 'pending' AND scheduled_time >= now();
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL: upcoming reminders survived the stop'; END IF;

  -- -------------------------------------------------------------------------
  -- 10. A stopped medicine is still readable by everyone who could read it
  --     before. This is the bug the whole migration exists for: the chart
  --     filtered is_active, so the most important thing a record can say was
  --     the one thing it could not.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count
    FROM public.medications_with_status
   WHERE user_id = v_patient AND status = 'stopped_by_patient';
  RESET ROLE;
  IF v_count < 4 THEN RAISE EXCEPTION 'FAIL: only % stopped medicines are visible', v_count; END IF;

  -- And the view does not widen access: a stranger sees none of them.
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.medications_with_status WHERE user_id = v_patient;
  RESET ROLE;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL: the status view leaked % rows to a stranger', v_count; END IF;

  RAISE NOTICE 'stop_medication: all assertions passed';
END $$;

ROLLBACK;
