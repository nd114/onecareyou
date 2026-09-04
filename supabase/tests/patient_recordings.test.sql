-- A patient's own recording of a consultation.
--
-- The feature with the most legal exposure on the patient side, so the
-- assertions are mostly about what the database refuses: a recording with no
-- acknowledgement that permission was asked, a transcript marked ready with
-- nothing in it, and anybody at all other than the person who made it.

BEGIN;

DO $$
DECLARE
  v_owner   uuid := '11111111-1111-1111-1111-111111111111';
  v_other   uuid := '22222222-2222-2222-2222-222222222222';
  v_rec     uuid := gen_random_uuid();
  v_count   int;
  v_failed  boolean;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (v_owner, 'patient@example.com'),
    (v_other, 'someone.else@example.com');

  -- ---------------------------------------------------------------
  -- A recording cannot exist without the acknowledgement
  -- ---------------------------------------------------------------
  v_failed := false;
  BEGIN
    INSERT INTO public.patient_recordings (id, user_id, title, consent_notice_version)
    VALUES (gen_random_uuid(), v_owner, 'Tue 1 Oct, 09:15', '2026-09-v1');
  EXCEPTION WHEN not_null_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'a recording was stored with no record that permission was asked';
  END IF;
  RAISE NOTICE 'a recording without an acknowledgement is refused: t';

  -- ...and not without knowing which wording was acknowledged.
  v_failed := false;
  BEGIN
    INSERT INTO public.patient_recordings (id, user_id, title, consent_acknowledged_at)
    VALUES (gen_random_uuid(), v_owner, 'Tue 1 Oct, 09:15', now());
  EXCEPTION WHEN not_null_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'an acknowledgement was stored without which notice it was for';
  END IF;
  RAISE NOTICE 'the acknowledgement must name the wording it was for: t';

  -- ---------------------------------------------------------------
  -- The ordinary case
  -- ---------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);

  INSERT INTO public.patient_recordings
    (id, user_id, title, duration_seconds, consent_acknowledged_at, consent_notice_version)
  VALUES (v_rec, v_owner, 'Tue 1 Oct, 09:15', 742, now(), '2026-09-v1');
  RAISE NOTICE 'a patient can save their own recording: t';

  -- Renaming is the point of an editable title.
  UPDATE public.patient_recordings SET title = 'Cardiology follow-up' WHERE id = v_rec;
  RAISE NOTICE 'and rename it afterwards: t';

  v_failed := false;
  BEGIN
    UPDATE public.patient_recordings SET title = '   ' WHERE id = v_rec;
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'a blank title was accepted'; END IF;
  RAISE NOTICE 'a blank title is refused, because it would be unfindable: t';
  RESET ROLE;

  -- ---------------------------------------------------------------
  -- A transcript marked ready must actually contain something
  -- ---------------------------------------------------------------
  v_failed := false;
  BEGIN
    UPDATE public.patient_recordings
       SET transcript_status = 'ready', transcript = '   '
     WHERE id = v_rec;
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'an empty transcript was marked ready';
  END IF;
  RAISE NOTICE 'an empty transcript cannot be marked ready: t';

  UPDATE public.patient_recordings
     SET transcript_status = 'ready', transcript = 'Doctor: how have you been?'
   WHERE id = v_rec;
  RAISE NOTICE 'a real transcript can be: t';

  v_failed := false;
  BEGIN
    UPDATE public.patient_recordings SET transcript_status = 'transcribing' WHERE id = v_rec;
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'an unknown transcript status was accepted'; END IF;
  RAISE NOTICE 'an unknown transcript status is refused: t';

  -- ---------------------------------------------------------------
  -- Nobody else, including a clinician
  -- ---------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);

  SELECT count(*) INTO v_count FROM public.patient_recordings WHERE id = v_rec;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'another user could see a recording that is not theirs';
  END IF;
  RAISE NOTICE 'nobody else can see it: t';

  UPDATE public.patient_recordings SET title = 'Mine now' WHERE id = v_rec;
  IF EXISTS (SELECT 1 FROM public.patient_recordings WHERE id = v_rec AND title = 'Mine now') THEN
    RAISE EXCEPTION 'another user renamed a recording that is not theirs';
  END IF;
  RAISE NOTICE 'and nobody else can change it: t';
  RESET ROLE;

  -- No share permission grants these. A clinician discovering they had been
  -- recorded by way of a patient list would be a bad way to find out.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'patient_recordings'
       AND qual ILIKE '%practice%'
  ) THEN
    RAISE EXCEPTION 'a practice-wide policy exists on patient recordings';
  END IF;
  RAISE NOTICE 'no share or practice policy reaches recordings at all: t';

  -- ---------------------------------------------------------------
  -- A whole-vault share does not hand over the recordings
  -- ---------------------------------------------------------------
  -- The recording row has no clinician policy, but the audio and transcript
  -- are ordinary health_documents. Whole-vault sharing reached them, so a
  -- patient who turned it on had handed over every recording they had made —
  -- including consultations with a different clinician, who would then hear
  -- what the first one said and the patient's own unguarded words.
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'health_documents'
    AND policyname IN ('Clinicians can view whole vault when granted',
                       'Institution team can view shared documents')
    AND qual LIKE '%patient_recording%';
  IF v_count <> 2 THEN
    RAISE EXCEPTION
      'a whole-vault share still reaches the patient''s recordings — the consent notice says nobody sees them unless the patient chooses to share them';
  END IF;
  RAISE NOTICE 'whole-vault sharing does not reach a recording: t';

  -- ...but sharing one deliberately still does, or the feature is unusable.
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'health_documents'
    AND policyname = 'Users and shared clinicians can view documents'
    AND qual LIKE '%document_shares%';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'the per-document share path is gone, so a recording cannot be shared at all';
  END IF;
  RAISE NOTICE 'sharing one recording deliberately still works: t';

  RAISE NOTICE 'ALL PATIENT RECORDING TESTS PASSED';
END $$;

ROLLBACK;
