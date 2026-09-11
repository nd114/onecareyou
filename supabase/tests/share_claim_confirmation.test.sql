-- A provider_shares row waiting for its clinician's address must not be
-- claimable, or even visible, on an unconfirmed one.
--
-- The sharpest instance of the same bug ADV-31 fixed for tenant ownership:
-- a patient shares their record with a clinician by email before that
-- clinician has an account (provider_email set, clinician_user_id null,
-- which is the documented, intended shape). Register that address,
-- unconfirmed, and the old policy handed the share to whoever got there
-- first — and every policy built on provider_shares (document_shares,
-- health_documents, the storage buckets, share_events) then reads that
-- account as the treating clinician.

BEGIN;

DO $$
DECLARE
  v_patient    uuid := '66666666-6666-6666-6666-666666666666';
  v_impostor   uuid := '77777777-7777-7777-7777-777777777777';
  v_clinician  uuid := '88888888-8888-8888-8888-888888888888';
  v_share      uuid;
  v_doc        uuid := gen_random_uuid();
  v_count      int;
  v_claimed_by uuid;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (v_patient,   'patient@example.com',       now()),
    -- Registered the clinician's address before the real clinician did.
    (v_impostor,  'dr.smith@clinic.com',       NULL),
    (v_clinician, 'dr.smith@clinic.com',       now());

  -- The patient shares with "dr.smith@clinic.com" before that clinician has
  -- an account: the documented, intended shape for an unclaimed share.
  INSERT INTO public.provider_shares (id, user_id, provider_name, provider_email, invite_code, clinician_user_id, is_active, permissions)
  VALUES (gen_random_uuid(), v_patient, 'Dr Smith', 'dr.smith@clinic.com', 'test-invite-code-1', NULL, true, '{"documents": true}'::jsonb)
  RETURNING id INTO v_share;

  INSERT INTO public.health_documents (id, user_id, uploaded_by_user_id, file_path, file_name, category)
  VALUES (v_doc, v_patient, v_patient, 'x/labs.pdf', 'Labs.pdf', 'lab_result');

  INSERT INTO public.document_shares (provider_share_id, document_id, user_id, is_active)
  VALUES (v_share, v_doc, v_patient, true);

  -- ---------------------------------------------------------------
  -- Unconfirmed: cannot even see the share exists
  -- ---------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_impostor::text, true);

  SELECT count(*) INTO v_count FROM public.provider_shares WHERE id = v_share;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: an unconfirmed address can see a share addressed to it';
  END IF;
  RAISE NOTICE 'an unconfirmed address cannot see the unclaimed share: t';

  -- Nor claim it.
  UPDATE public.provider_shares SET clinician_user_id = v_impostor WHERE id = v_share;
  RESET ROLE;

  SELECT clinician_user_id INTO v_claimed_by FROM public.provider_shares WHERE id = v_share;
  IF v_claimed_by IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: an unconfirmed address claimed a share addressed to it';
  END IF;
  RAISE NOTICE 'an unconfirmed address cannot claim the share: t';

  -- Nor read the patient's document through it.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_impostor::text, true);
  SELECT count(*) INTO v_count FROM public.health_documents WHERE id = v_doc;
  RESET ROLE;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: an unconfirmed address read a document through an unclaimed share';
  END IF;
  RAISE NOTICE 'an unconfirmed address reads no document through the share: t';

  -- ---------------------------------------------------------------
  -- Confirmed: the genuine clinician can see, claim, and then read
  -- ---------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);

  SELECT count(*) INTO v_count FROM public.provider_shares WHERE id = v_share;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: the confirmed, genuine clinician cannot see the share addressed to them';
  END IF;

  UPDATE public.provider_shares SET clinician_user_id = v_clinician WHERE id = v_share;
  RESET ROLE;

  SELECT clinician_user_id INTO v_claimed_by FROM public.provider_shares WHERE id = v_share;
  IF v_claimed_by IS DISTINCT FROM v_clinician THEN
    RAISE EXCEPTION 'FAIL: the confirmed, genuine clinician could not claim the share';
  END IF;
  RAISE NOTICE 'the confirmed genuine clinician claims the share: t';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  SELECT count(*) INTO v_count FROM public.health_documents WHERE id = v_doc;
  RESET ROLE;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: the clinician who claimed the share cannot read the shared document';
  END IF;
  RAISE NOTICE 'the clinician who claimed the share reads the shared document: t';

  -- get_patient_identity() carries the same shape independently of the
  -- policies above — name, email, phone_number, gated on the same
  -- provider_shares match, and found to still leak them to the unconfirmed
  -- impostor even after every policy in this file was fixed.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_impostor::text, true);
  SELECT count(*) INTO v_count FROM public.get_patient_identity(ARRAY[v_patient]);
  RESET ROLE;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: get_patient_identity() named the patient to an unconfirmed impostor';
  END IF;
  RAISE NOTICE 'get_patient_identity() tells the unconfirmed impostor nothing: t';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  SELECT count(*) INTO v_count FROM public.get_patient_identity(ARRAY[v_patient]);
  RESET ROLE;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: get_patient_identity() withheld the patient from the clinician who claimed the share';
  END IF;
  RAISE NOTICE 'get_patient_identity() answers for the clinician who actually claimed the share: t';

  RAISE NOTICE 'ALL SHARE CLAIM CONFIRMATION TESTS PASSED';
END $$;

ROLLBACK;
