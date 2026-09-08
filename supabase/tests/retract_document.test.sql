-- Taking back a document filed to the wrong person.
--
-- The hole this closes: clinicians had INSERT on health_documents and nothing
-- else, so a letter sent to the wrong Jane Evans stayed in her vault
-- permanently, readable by her and by everyone she had shared her vault with,
-- and the only person able to archive it was the person who should never have
-- had it.
--
-- The assertion that matters most is the one about the owner. A retraction that
-- hides a document from clinicians and leaves it with the patient holding
-- somebody else's letter has retracted nothing.
BEGIN;

DO $$
DECLARE
  v_doc_id uuid := gen_random_uuid();
  v_clinician uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid();
  v_wrong_patient uuid := gen_random_uuid();
  v_count int;
  v_ok boolean;
  v_details jsonb;
  v_event_id uuid;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
    (v_clinician,'evans@example.com',now()),
    (v_wrong_patient,'jane.evans@example.com',now()),
    (v_stranger,'someone@example.com',now());

  INSERT INTO public.health_documents
    (id, user_id, uploaded_by_user_id, file_path, file_name, category, created_at)
  VALUES
    (v_doc_id, v_wrong_patient, v_clinician, 'x/y.pdf', 'Discharge summary.pdf', 'other',
     now() - interval '3 days');

  -- Before: the wrong patient can read it.
  PERFORM set_config('request.jwt.claim.sub', v_wrong_patient::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.health_documents WHERE id = v_doc_id;
  RESET ROLE;
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: the fixture is wrong — the patient cannot see the document'; END IF;

  -- Somebody who did not file it cannot withdraw it. "I can see it" is not
  -- "I put it there".
  PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);
  v_ok := false;
  BEGIN
    PERFORM public.withdraw_shared_file(v_doc_id, NULL, 'wrong_recipient', 'not mine to take back', NULL, NULL, NULL);
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN v_ok := false;
  END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL: a third party withdrew somebody else''s document'; END IF;

  -- Nor on a reason nobody defined. Free text used to be accepted here, which
  -- is what made the withdrawals uncountable.
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  v_ok := false;
  BEGIN
    PERFORM public.withdraw_shared_file(v_doc_id, NULL, 'because I said so', NULL, NULL, NULL, NULL);
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN v_ok := false;
  END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL: a document was withdrawn on an undefined reason'; END IF;

  -- And the old function is gone rather than merely unused. A permissive path
  -- left reachable is not narrowed by adding a strict one beside it.
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'retract_health_document') THEN
    RAISE EXCEPTION 'FAIL: the unrestricted withdrawal function is still callable';
  END IF;

  -- The sender withdraws it.
  PERFORM public.withdraw_shared_file(v_doc_id, NULL, 'wrong_recipient', 'Filed to the wrong patient — same name', NULL, NULL, NULL);

  -- The patient holding somebody else's letter stops seeing it. This is the
  -- assertion the whole thing exists for.
  PERFORM set_config('request.jwt.claim.sub', v_wrong_patient::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.health_documents WHERE id = v_doc_id;
  RESET ROLE;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL: the wrong patient still reads the retracted document'; END IF;

  -- But is told it happened, without the content coming back.
  PERFORM set_config('request.jwt.claim.sub', v_wrong_patient::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.my_withdrawn_documents WHERE document_id = v_doc_id;
  RESET ROLE;
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: the patient is not told a document was withdrawn'; END IF;

  -- The row and the file survive: somebody has to answer what was disclosed.
  IF (SELECT count(*) FROM public.health_documents WHERE id = v_doc_id) <> 1 THEN
    RAISE EXCEPTION 'FAIL: the evidence of the incident was deleted';
  END IF;

  -- And the incident says how long it was visible rather than implying nothing
  -- was seen.
  SELECT e.id INTO v_event_id FROM public.document_retraction_events e
   WHERE e.document_id = v_doc_id;
  SELECT details INTO v_details FROM public.hipaa_audit_logs
   WHERE resource_id = v_event_id::text AND action = 'document_withdrawn';
  IF v_details IS NULL THEN RAISE EXCEPTION 'FAIL: the retraction was not audited'; END IF;
  IF (v_details->>'days_visible')::numeric < 3 THEN
    RAISE EXCEPTION 'FAIL: the exposure window was understated (% days)', v_details->>'days_visible';
  END IF;
  IF v_details->>'reason_code' IS NULL THEN RAISE EXCEPTION 'FAIL: the reason code was not kept'; END IF;

  -- Retracting twice is not an error.
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  PERFORM public.withdraw_shared_file(v_doc_id, NULL, 'wrong_recipient', 'again', NULL, NULL, NULL);

  RAISE NOTICE 'retract_document: assertions passed';
END $$;

ROLLBACK;
