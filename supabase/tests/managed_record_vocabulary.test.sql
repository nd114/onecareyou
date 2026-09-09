-- The two columns a clinician's consent badge is drawn from only accept the
-- words the application knows.
BEGIN;

DO $$
DECLARE
  clinician uuid := gen_random_uuid();
  rec uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (clinician, 'vocab-clinician@test.local');

  -- A record with the vocabulary's values is accepted.
  INSERT INTO public.clinician_patient_records
    (clinician_user_id, patient_name, invitation_status, data_sharing_model)
  VALUES (clinician, 'Vocabulary Patient', 'invited', 'collaborative')
  RETURNING id INTO rec;

  FOR i IN 1..1 LOOP
    UPDATE public.clinician_patient_records SET invitation_status = 'accepted' WHERE id = rec;
    UPDATE public.clinician_patient_records SET invitation_status = 'declined' WHERE id = rec;
    UPDATE public.clinician_patient_records SET invitation_status = 'not_invited' WHERE id = rec;
  END LOOP;

  -- Anything else is refused, rather than arriving on a screen as agreement.
  BEGIN
    UPDATE public.clinician_patient_records SET invitation_status = 'pending' WHERE id = rec;
    RAISE EXCEPTION 'FAIL: invitation_status accepted a word outside the vocabulary';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.clinician_patient_records SET data_sharing_model = 'whatever' WHERE id = rec;
    RAISE EXCEPTION 'FAIL: data_sharing_model accepted a word outside the vocabulary';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- And the insert path is guarded too, not only the update path.
  BEGIN
    INSERT INTO public.clinician_patient_records
      (clinician_user_id, patient_name, invitation_status)
    VALUES (clinician, 'Bad Insert', 'sort-of-accepted');
    RAISE EXCEPTION 'FAIL: an insert introduced a status outside the vocabulary';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  RAISE NOTICE 'managed record vocabulary: ok';
END $$;

ROLLBACK;
