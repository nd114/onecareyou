-- =============================================================================
-- Health Vault documents for the demo patient
--
-- RUN THIS SECOND, and only after the eight HTML files have been uploaded to
-- storage. SQL cannot put bytes into a storage bucket, so the files go up
-- through the Supabase Storage UI first and this script files the rows that
-- point at them.
--
--   1. Run supabase/seed/demo_data.sql. It prints James Thompson's user_id.
--   2. In Storage → health-documents, create a folder named with that user_id
--      and upload the eight files into it, keeping their filenames exactly.
--   3. Run this script.
--
-- The folder name matters: storage access on this bucket is scoped by user id,
-- so a file anywhere else is unreachable to the patient it belongs to.
--
-- Safe to run repeatedly.
-- =============================================================================

DO $$
DECLARE
  _james uuid;
  _now   timestamptz := now();
  _n     integer;
BEGIN
  SELECT id INTO _james FROM auth.users WHERE email = 'demo-patient-1@onecare.you';
  IF _james IS NULL THEN
    RAISE EXCEPTION 'demo-patient-1@onecare.you not found. Run seed-demo-data first.';
  END IF;

  -- Only the documents this script files; a care record snapshot created in the
  -- app is left alone.
  DELETE FROM public.health_documents
   WHERE user_id = _james
     AND source_context = 'demo_seed';

  INSERT INTO public.health_documents
    (user_id, file_path, file_name, file_size, mime_type, title, category,
     document_date, notes, tags, source_context, family_member_id, created_at)
  VALUES
    (_james, _james || '/lipid-panel.html', 'lipid-panel.html', 2351, 'text/html',
     'Lipid panel', 'lab_result', (_now - interval '10 days')::date,
     'Total cholesterol marginally high; LDL, HDL and triglycerides all within range.',
     jsonb_build_array('cholesterol','pathology'), 'demo_seed', NULL, _now - interval '10 days'),

    (_james, _james || '/hba1c-and-renal-profile.html', 'hba1c-and-renal-profile.html', 2472, 'text/html',
     'HbA1c and renal profile', 'lab_result', (_now - interval '10 days')::date,
     'HbA1c 7.1%, down from 8.4% over nine months. Renal function stable.',
     jsonb_build_array('diabetes','hba1c','kidney'), 'demo_seed', NULL, _now - interval '10 days'),

    (_james, _james || '/discharge-summary.html', 'discharge-summary.html', 3094, 'text/html',
     'Discharge summary — hypertensive urgency', 'discharge_summary', (_now - interval '240 days')::date,
     'Two-night admission. Lisinopril started. No end-organ damage.',
     jsonb_build_array('hospital','blood pressure'), 'demo_seed', NULL, _now - interval '240 days'),

    (_james, _james || '/referral-ophthalmology.html', 'referral-ophthalmology.html', 2272, 'text/html',
     'Referral — ophthalmology', 'referral', (_now - interval '1 day')::date,
     'Routine diabetic retinopathy screening, overdue by two months.',
     jsonb_build_array('eyes','screening'), 'demo_seed', NULL, _now - interval '1 day'),

    (_james, _james || '/visit-note-diabetes-review.html', 'visit-note-diabetes-review.html', 2615, 'text/html',
     'Visit note — diabetes review', 'visit_note', (_now - interval '10 days')::date,
     'Medication unchanged. Two more weeks of home BP readings before any dose change.',
     jsonb_build_array('diabetes','review'), 'demo_seed', NULL, _now - interval '10 days'),

    (_james, _james || '/visit-note-blood-pressure-review.html', 'visit-note-blood-pressure-review.html', 2427, 'text/html',
     'Visit note — blood pressure review', 'visit_note', (_now - interval '90 days')::date,
     'BP above target at 150/92. Salt reduction advised.',
     jsonb_build_array('blood pressure','review'), 'demo_seed', NULL, _now - interval '90 days'),

    (_james, _james || '/prescription.html', 'prescription.html', 2177, 'text/html',
     'Repeat prescription', 'prescription', (_now - interval '10 days')::date,
     'Metformin, Lisinopril and Vitamin D. Penicillin allergy flagged.',
     jsonb_build_array('medication'), 'demo_seed', NULL, _now - interval '10 days'),

    (_james, _james || '/vaccination-record.html', 'vaccination-record.html', 2218, 'text/html',
     'Vaccination record', 'vaccination', (_now - interval '10 days')::date,
     'Influenza, pneumococcal, COVID-19 booster and Td/IPV.',
     jsonb_build_array('vaccination'), 'demo_seed', NULL, _now - interval '10 days');

  SELECT count(*) INTO _n FROM public.health_documents
   WHERE user_id = _james AND source_context = 'demo_seed';
  RAISE NOTICE '% documents filed to James Thompson''s Health Vault.', _n;
  RAISE NOTICE 'Expected storage folder: health-documents/%/', _james;
END $$;
