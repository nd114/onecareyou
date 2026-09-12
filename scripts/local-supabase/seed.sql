-- Demo accounts and enough data that every pillar of the app has something to
-- render. Seeded as postgres, which is what a real project would already hold.
CREATE TABLE IF NOT EXISTS auth.shim_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text, password text
);

DO $seed$
DECLARE
  patient uuid := '11111111-1111-4111-8111-111111111111';
  patient2 uuid := '33333333-3333-4333-8333-333333333333';
  clinician uuid := '22222222-2222-4222-8222-222222222222';
  prac uuid := '44444444-4444-4444-8444-444444444444';
  share uuid;
  med uuid;
BEGIN
  DELETE FROM auth.users WHERE email LIKE 'demo-%@onecare.you';

  INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at)
  VALUES
    (patient,   'demo-patient-1@onecare.you',   '{"name":"Ada Mensah"}',      now()),
    (patient2,  'demo-patient-2@onecare.you',   '{"name":"Kwesi Boateng"}',   now()),
    (clinician, 'demo-clinician-1@onecare.you', '{"name":"Dr Naomi Adeyemi"}', now());

  INSERT INTO auth.shim_credentials (user_id, email, password)
  SELECT id, email, 'Demo123!' FROM auth.users WHERE email LIKE 'demo-%@onecare.you';

  UPDATE public.profiles SET
    onboarding_completed = true, date_of_birth = '1984-03-11', gender = 'female',
    blood_type = 'O+', height = 168, location = 'Accra', country_code = 'GH',
    phone_number = '+233201234567', ai_processing_consent = true,
    allergies = '["Penicillin"]'::jsonb,
    health_conditions = '["Type 2 diabetes","Hypertension"]'::jsonb
  WHERE user_id = patient;

  UPDATE public.profiles SET onboarding_completed = true WHERE user_id IN (patient2, clinician);

  -- The clinician
  INSERT INTO public.clinician_profiles (user_id, first_name, last_name, title, specialty,
      license_number, country, is_verified, practice_name, onboarding_completed, subscription_tier)
  VALUES (clinician, 'Naomi', 'Adeyemi', 'Dr', 'Internal Medicine', 'GH-MDC-40213', 'GH', true,
      'Ridge Family Practice', true, 'pro')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.practices (id, name, created_by, country, slug, tenant_type, is_active, subscription_tier)
  VALUES (prac, 'Ridge Family Practice', clinician, 'GH', 'ridge', 'practice', true, 'pro')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.practice_members (practice_id, user_id, role, status, accepted_at,
      can_invite_patients, can_view_all_patients, can_manage_settings)
  VALUES (prac, clinician, 'owner', 'active', now(), true, true, true)
  ON CONFLICT DO NOTHING;

  -- The patient shares with the clinician
  INSERT INTO public.provider_shares (user_id, provider_name, provider_email, invite_code,
      clinician_user_id, is_active, permissions)
  VALUES (patient, 'Dr Naomi Adeyemi', 'demo-clinician-1@onecare.you', 'DEMOSHARE1',
      clinician, true,
      '{"meds":true,"vitals":true,"profile":true,"adherence":true,"documents":true,"whole_vault":true}'::jsonb)
  RETURNING id INTO share;

  INSERT INTO public.clinician_patient_records (clinician_user_id, practice_id, patient_name,
      patient_email, date_of_birth, gender, blood_type, linked_user_id, provider_share_id,
      invitation_status, allergies, health_conditions, notes)
  VALUES (clinician, prac, 'Ada Mensah', 'demo-patient-1@onecare.you', '1984-03-11', 'female',
      'O+', patient, share, 'accepted', '["Penicillin"]'::jsonb,
      '["Type 2 diabetes","Hypertension"]'::jsonb, 'Reviewed at the March visit.');

  -- A patient with no share, to check the clinician cannot see them
  INSERT INTO public.clinician_patient_records (clinician_user_id, practice_id, patient_name,
      patient_email, invitation_status)
  VALUES (clinician, prac, 'Kwesi Boateng', 'demo-patient-2@onecare.you', 'invited');

  -- Medications
  INSERT INTO public.medications (user_id, name, dosage, frequency, type, instructions,
      start_date, is_active, times_of_day, prescriber, source)
  VALUES
    (patient, 'Metformin', '500 mg', 'Twice daily', 'tablet', 'With food',
       CURRENT_DATE - 200, true, '["08:00","20:00"]'::jsonb, 'Dr Naomi Adeyemi', 'manual')
  RETURNING id INTO med;

  INSERT INTO public.medications (user_id, name, dosage, frequency, type, instructions,
      start_date, is_active, times_of_day, prescriber, source)
  VALUES
    (patient, 'Lisinopril', '10 mg', 'Once daily', 'tablet', 'Morning',
       CURRENT_DATE - 120, true, '["08:00"]'::jsonb, 'Dr Naomi Adeyemi', 'manual'),
    (patient, 'Atorvastatin', '20 mg', 'Once daily', 'tablet', 'At night',
       CURRENT_DATE - 60, true, '["21:00"]'::jsonb, 'Dr Naomi Adeyemi', 'City General EHR');

  -- Vitals
  INSERT INTO public.vitals (user_id, type, value, secondary_value, unit, recorded_at, recorded_by_user_id)
  SELECT patient, 'blood_pressure', 118 + (n * 3), 76 + n, 'mmHg',
         now() - (n || ' days')::interval, patient
    FROM generate_series(0, 6) n;
  INSERT INTO public.vitals (user_id, type, value, unit, recorded_at, recorded_by_user_id)
  SELECT patient, 'blood_glucose', (5.4 + (n * 0.2))::numeric(4,1), 'mmol/L',
         now() - (n || ' days')::interval, patient
    FROM generate_series(0, 6) n;

  INSERT INTO public.vitals (user_id, type, value, secondary_value, unit, recorded_at, source, recorded_by_user_id, notes)
  VALUES (patient, 'blood_pressure', 148, 96, 'mmHg', now() - interval '6 hours', 'clinician', clinician,
          'Heard during the visit: "one forty-eight over ninety-six"');

  -- Documents: one the patient owns, one the clinician filed
  INSERT INTO public.health_documents (user_id, file_path, file_name, title, category,
      mime_type, file_size, uploaded_by_user_id, source_context, document_date)
  VALUES
    (patient, patient || '/lipids-2026-03.pdf', 'lipids-2026-03.pdf', 'Lipid panel',
       'lab_result', 'application/pdf', 24680, patient, 'patient_upload', CURRENT_DATE - 30),
    (patient, patient || '/discharge-summary.pdf', 'discharge-summary.pdf', 'Discharge summary',
       'clinical_note', 'application/pdf', 51200, clinician, 'clinician_upload', CURRENT_DATE - 10);

  -- Guidance the clinician issued through the share
  INSERT INTO public.clinician_guidance (clinician_user_id, patient_user_id, share_id, title,
      category, instruction, priority, status)
  VALUES (clinician, patient, share, 'Check your blood pressure each morning',
      'monitoring', 'Sit for five minutes first, then record the reading here before breakfast.',
      'normal', 'pending');

  -- Schedule entries so adherence has something to show
  INSERT INTO public.schedule_entries (user_id, medication_id, scheduled_time, status, taken_at)
  SELECT patient, med, (CURRENT_DATE - n) + time '08:00',
         CASE WHEN n = 1 THEN 'missed' ELSE 'taken' END,
         CASE WHEN n = 1 THEN NULL ELSE (CURRENT_DATE - n) + time '08:15' END
    FROM generate_series(1, 5) n;

  RAISE NOTICE 'seeded';
END $seed$;
