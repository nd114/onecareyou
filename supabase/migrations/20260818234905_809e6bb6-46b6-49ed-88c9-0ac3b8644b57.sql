-- NOTE (added on review): this was written as a one-off script to run in the
-- SQL editor and has since been applied as a migration. Migrations run against
-- every environment, including fresh ones with no demo accounts, so the hard
-- failure below has been softened to a no-op. Demo data must never be able to
-- break a deploy of the schema.
--
DO $$
DECLARE
  _james    uuid;
  _emily    uuid;
  _third    uuid;
  _share    uuid;
  _now      timestamptz := now();
  _bad      integer;
BEGIN
  SELECT count(*) INTO _bad
    FROM auth.users
   WHERE email IN ('demo-patient-1@onecare.you','demo-clinician-1@onecare.you','demo-clinician-3@onecare.you')
     AND email NOT LIKE 'demo-%@onecare.you';
  IF _bad > 0 THEN
    RAISE NOTICE 'Demo seed skipped: matched a non-demo account.';
    RETURN;
  END IF;

  SELECT id INTO _james FROM auth.users WHERE email = 'demo-patient-1@onecare.you';
  SELECT id INTO _emily FROM auth.users WHERE email = 'demo-clinician-1@onecare.you';
  SELECT id INTO _third FROM auth.users WHERE email = 'demo-clinician-3@onecare.you';

  IF _james IS NULL OR _emily IS NULL THEN
    -- No demo accounts here (a fresh or production database). Nothing to seed.
    RAISE NOTICE 'Demo seed skipped: demo accounts not present in this database.';
    RETURN;
  END IF;

  SELECT id INTO _share
    FROM public.provider_shares
   WHERE user_id = _james AND clinician_user_id = _emily
   ORDER BY created_at DESC LIMIT 1;

  DELETE FROM public.clinician_guidance WHERE patient_user_id = _james;
  DELETE FROM public.alert_logs         WHERE patient_user_id = _james;
  DELETE FROM public.patient_action_log WHERE patient_user_id = _james;
  DELETE FROM public.messages           WHERE patient_user_id = _james;
  DELETE FROM public.practice_tasks     WHERE created_by = _emily;
  DELETE FROM public.vitals
   WHERE user_id = _james
     AND type IN ('hba1c','cholesterol_total','ldl','hdl','hemoglobin','creatinine','gfr');

  INSERT INTO public.clinician_guidance
    (clinician_user_id, patient_user_id, share_id, title, instruction, category,
     priority, due_date, status, acknowledged_at, completed_at, created_at)
  VALUES
    (_emily, _james, _share,
     'Check your blood sugar before breakfast',
     'Take a fasting reading each morning before you eat or drink anything except water. Note it in OneCare so I can see the pattern between visits.',
     'monitoring', 'normal', _now - interval '20 days', 'completed',
     _now - interval '27 days', _now - interval '19 days', _now - interval '28 days'),
    (_emily, _james, _share,
     'Take Metformin with food',
     'Take your 500mg dose with breakfast and again with your evening meal. Taking it on an empty stomach is the usual cause of the nausea you described.',
     'medication', 'normal', NULL, 'acknowledged',
     _now - interval '13 days', NULL, _now - interval '14 days'),
    (_emily, _james, _share,
     'Cut back on added salt',
     'Aim to keep added salt under one teaspoon a day across everything you eat. This is the single change most likely to bring your blood pressure down.',
     'lifestyle', 'normal', _now - interval '5 days', 'completed',
     _now - interval '11 days', _now - interval '6 days', _now - interval '12 days'),
    (_emily, _james, _share,
     'Walk for 20 minutes after dinner',
     'A short walk after your evening meal helps blunt the post-meal glucose rise. Start with 20 minutes and build up if it feels comfortable.',
     'lifestyle', 'normal', _now + interval '3 days', 'pending',
     NULL, NULL, _now - interval '4 days'),
    (_emily, _james, _share,
     'Bring your BP readings to the next review',
     'Please bring at least two weeks of home blood-pressure readings to our next appointment so we can decide together whether the Lisinopril dose needs adjusting.',
     'monitoring', 'high', _now + interval '5 days', 'acknowledged',
     _now - interval '2 days', NULL, _now - interval '3 days'),
    (_emily, _james, _share,
     'Book your annual diabetic eye screening',
     'Your last retinal screening was over a year ago. Please book one — it is the check that catches problems before you notice any change in your sight.',
     'appointment', 'high', _now + interval '10 days', 'pending',
     NULL, NULL, _now - interval '1 day');

  INSERT INTO public.messages
    (patient_user_id, clinician_user_id, sender_user_id, body, read_at, created_at)
  VALUES
    (_james, _emily, _emily,
     'Hello James — I have looked through the readings you have been logging. Thank you for keeping them up, it makes a real difference to what I can tell you.',
     _now - interval '21 days', _now - interval '21 days 2 hours'),
    (_james, _emily, _james,
     'Thanks doctor. I have been trying to be consistent with the morning ones.',
     _now - interval '21 days', _now - interval '21 days 1 hour'),
    (_james, _emily, _emily,
     'It shows. Your fasting numbers have settled a lot since we changed the timing of the Metformin. How has your stomach been on it?',
     _now - interval '20 days', _now - interval '20 days 6 hours'),
    (_james, _emily, _james,
     'Much better since I started taking it with food. Hardly any nausea now.',
     _now - interval '20 days', _now - interval '20 days 5 hours'),
    (_james, _emily, _james,
     'One thing — my blood pressure readings seem higher in the evenings than the mornings. Is that something to worry about?',
     _now - interval '6 days', _now - interval '6 days 3 hours'),
    (_james, _emily, _emily,
     'That pattern is common and usually not a concern on its own. Keep logging both times of day for another fortnight and we will look at it together at your review.',
     _now - interval '6 days', _now - interval '6 days 1 hour'),
    (_james, _emily, _james,
     'Understood, will do. I have attached the letter from the eye clinic as well.',
     _now - interval '2 days', _now - interval '2 days 4 hours'),
    (_james, _emily, _emily,
     'Received, thank you. I have added a reminder for your annual retinal screening — please book it when you have a moment.',
     NULL, _now - interval '20 hours');

  INSERT INTO public.alert_logs
    (patient_user_id, clinician_user_id, alert_type, message, sent_at, acknowledged_at, created_at)
  VALUES
    (_james, _emily, 'threshold_breach',
     'Blood pressure 152/94 — above the 150/90 threshold set for this patient.',
     _now - interval '9 hours', NULL, _now - interval '9 hours'),
    (_james, _emily, 'threshold_breach',
     'Fasting glucose 9.8 mmol/L — third reading above 9.0 this week.',
     _now - interval '2 days', NULL, _now - interval '2 days'),
    (_james, _emily, 'guidance_ignored',
     'No response to "Bring your BP readings to the next review" after 48 hours.',
     _now - interval '5 days', _now - interval '4 days', _now - interval '5 days'),
    (_james, _emily, 'threshold_breach',
     'Blood pressure 148/92 — above threshold.',
     _now - interval '12 days', _now - interval '12 days' + interval '3 hours', _now - interval '12 days');

  INSERT INTO public.practice_tasks
    (practice_id, assignee_user_id, created_by, patient_user_id, title, notes,
     due_at, priority, status, source, created_at)
  VALUES
    (NULL, _emily, _emily, _james,
     'Call James Thompson about evening BP readings',
     'He has noticed a consistent morning/evening gap. Worth a five minute call before the review.',
     _now + interval '1 day', 'high', 'open', 'manual', _now - interval '1 day'),
    (NULL, _emily, _emily, _james,
     'Review HbA1c trend before next appointment',
     NULL, _now + interval '4 days', 'normal', 'open', 'manual', _now - interval '2 days'),
    (NULL, _emily, _emily, NULL,
     'Chase outstanding lab results',
     'Two patients still waiting on lipid panels from last week.',
     _now + interval '2 days', 'normal', 'in_progress', 'manual', _now - interval '3 days'),
    (NULL, _emily, _emily, _james,
     'Confirm retinal screening was booked',
     NULL, _now - interval '1 day', 'normal', 'done', 'manual', _now - interval '6 days');

  INSERT INTO public.patient_action_log
    (patient_user_id, actor_user_id, action, ref_table, summary, created_at)
  VALUES
    (_james, _emily, 'guidance_sent', 'clinician_guidance',
     'Sent guidance: Book your annual diabetic eye screening', _now - interval '1 day'),
    (_james, _emily, 'message_sent', 'messages',
     'Replied in secure messages', _now - interval '20 hours'),
    (_james, _emily, 'alert_acknowledged', 'alert_logs',
     'Acknowledged threshold breach: BP 148/92', _now - interval '12 days'),
    (_james, _emily, 'record_viewed', 'vitals',
     'Reviewed 90 days of blood pressure and glucose readings', _now - interval '6 days'),
    (_james, _emily, 'guidance_sent', 'clinician_guidance',
     'Sent guidance: Bring your BP readings to the next review', _now - interval '3 days'),
    (_james, _emily, 'record_viewed', 'health_documents',
     'Opened shared document: Lipid panel', _now - interval '2 days');

  INSERT INTO public.vitals (user_id, type, value, unit, recorded_at, source, notes)
  VALUES
    (_james, 'hba1c', 8.4, '%', _now - interval '270 days', 'ehr_import', 'Baseline at diagnosis review'),
    (_james, 'hba1c', 7.9, '%', _now - interval '180 days', 'ehr_import', NULL),
    (_james, 'hba1c', 7.4, '%', _now - interval '90 days',  'ehr_import', NULL),
    (_james, 'hba1c', 7.1, '%', _now - interval '10 days',  'ehr_import', 'Improving steadily'),
    (_james, 'cholesterol_total', 5.9, 'mmol/L', _now - interval '180 days', 'ehr_import', NULL),
    (_james, 'cholesterol_total', 5.4, 'mmol/L', _now - interval '90 days',  'ehr_import', NULL),
    (_james, 'cholesterol_total', 5.1, 'mmol/L', _now - interval '10 days',  'ehr_import', NULL),
    (_james, 'ldl', 3.6, 'mmol/L', _now - interval '180 days', 'ehr_import', NULL),
    (_james, 'ldl', 3.2, 'mmol/L', _now - interval '90 days',  'ehr_import', NULL),
    (_james, 'ldl', 2.9, 'mmol/L', _now - interval '10 days',  'ehr_import', NULL),
    (_james, 'hdl', 1.0, 'mmol/L', _now - interval '180 days', 'ehr_import', NULL),
    (_james, 'hdl', 1.1, 'mmol/L', _now - interval '90 days',  'ehr_import', NULL),
    (_james, 'hdl', 1.2, 'mmol/L', _now - interval '10 days',  'ehr_import', NULL),
    (_james, 'creatinine', 88, 'umol/L', _now - interval '180 days', 'ehr_import', NULL),
    (_james, 'creatinine', 91, 'umol/L', _now - interval '10 days',  'ehr_import', NULL),
    (_james, 'gfr', 82, 'mL/min', _now - interval '180 days', 'ehr_import', NULL),
    (_james, 'gfr', 79, 'mL/min', _now - interval '10 days',  'ehr_import', 'Stable kidney function'),
    (_james, 'hemoglobin', 14.2, 'g/dL', _now - interval '180 days', 'ehr_import', NULL),
    (_james, 'hemoglobin', 14.0, 'g/dL', _now - interval '10 days',  'ehr_import', NULL);

  RAISE NOTICE 'Demo data seeded. James user_id = %', _james;
END $$;