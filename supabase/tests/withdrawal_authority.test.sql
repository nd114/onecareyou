-- Withdrawal: always possible, never casual, never adjudicated here.
--
-- The rules being proved, and the reasoning each comes from:
--
--   * Inside 72 hours the sender acts alone. Somebody correcting their own
--     mistake immediately should not need a committee.
--   * Up to ten days it is still theirs, with a reason code on the record.
--   * After ten days ordinary withdrawal is no longer permitted. Not because a
--     late withdrawal is assumed improper — everything here is audited either
--     way — but because it is the wrong instrument: a document that old has
--     been read, and superseding it with a correction serves the patient where
--     removing it does not.
--   * But a declared privacy incident stays open forever, because a disclosure
--     found on day forty is still a disclosure, and it needs a second
--     signature, or an emergency declaration where waiting for one would leave
--     information exposed.
--
-- And throughout: withdrawal removes access and never the record. The document,
-- its content and this event all remain, and the withdrawal is itself audited,
-- so nothing that passed through here can be made never to have happened.
BEGIN;

DO $$
DECLARE
  v_practice   uuid := gen_random_uuid();
  v_clinician  uuid := gen_random_uuid();
  v_colleague  uuid := gen_random_uuid();
  v_admin      uuid := gen_random_uuid();
  v_patient    uuid := gen_random_uuid();
  v_stranger   uuid := gen_random_uuid();
  v_doc        uuid;
  v_msg        uuid;
  v_event      public.document_retraction_events;
  v_count      int;
  v_ok         boolean;
  v_text       text;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
    (v_clinician,'dr@example.com',now()),
    (v_colleague,'nurse@example.com',now()),
    (v_admin,'admin@example.com',now()),
    (v_patient,'jane@example.com',now()),
    (v_stranger,'nobody@example.com',now());

  INSERT INTO public.practices (id, name, created_by)
  VALUES (v_practice, 'St Anne''s', v_admin);

  -- ON CONFLICT because creating a practice already enrols its creator as
  -- owner; inserting them again is the fixture fighting a trigger.
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (v_practice, v_clinician, 'clinician', 'active'),
    (v_practice, v_colleague, 'clinician', 'active'),
    (v_practice, v_admin, 'admin', 'active')
  ON CONFLICT (practice_id, user_id) DO UPDATE
    SET role = EXCLUDED.role, status = 'active';

  -- -------------------------------------------------------------------------
  -- 1. Every reason code carries both sentences: one for the person who
  --    received it, one for the incident record. A code with only the second
  --    leaves the patient staring at a gap.
  -- -------------------------------------------------------------------------
  SELECT count(*) INTO v_count FROM public.retraction_reason_codes
   WHERE btrim(patient_message) = '' OR btrim(audit_description) = '';
  IF v_count > 0 THEN RAISE EXCEPTION 'FAIL: % reason code(s) missing a sentence', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.retraction_reason_codes WHERE is_privacy_incident;
  IF v_count < 2 THEN RAISE EXCEPTION 'FAIL: too few privacy codes to keep late withdrawal possible'; END IF;

  -- The patient-facing sentence must never name anybody or describe the other
  -- patient. Checked crudely, because the failure is severe: a message about a
  -- misfiling that mentions whose record it was is a second disclosure.
  SELECT count(*) INTO v_count FROM public.retraction_reason_codes
   WHERE patient_message ILIKE '%another patient%name%';
  IF v_count > 0 THEN RAISE EXCEPTION 'FAIL: a patient-facing message identifies somebody'; END IF;

  -- -------------------------------------------------------------------------
  -- 2. A concealed ref reveals nothing and is stable.
  -- -------------------------------------------------------------------------
  IF public.person_ref(v_patient) = public.person_ref(v_stranger) THEN
    RAISE EXCEPTION 'FAIL: two people share a concealed ref';
  END IF;
  IF public.person_ref(v_patient) <> public.person_ref(v_patient) THEN
    RAISE EXCEPTION 'FAIL: a concealed ref is not stable';
  END IF;
  IF public.person_ref(v_patient) ILIKE '%jane%' THEN
    RAISE EXCEPTION 'FAIL: a concealed ref leaks identity';
  END IF;

  -- -------------------------------------------------------------------------
  -- 3. The tiers, as dates rather than as prose.
  -- -------------------------------------------------------------------------
  IF public.required_withdrawal_authority(now() - interval '2 hours') <> 'sender'
  THEN RAISE EXCEPTION 'FAIL: a fresh document does not sit in the sender tier'; END IF;
  IF public.required_withdrawal_authority(now() - interval '5 days') <> 'sender_with_reason'
  THEN RAISE EXCEPTION 'FAIL: a five-day-old document is in the wrong tier'; END IF;
  IF public.required_withdrawal_authority(now() - interval '40 days') <> 'privacy_incident'
  THEN RAISE EXCEPTION 'FAIL: a forty-day-old document is in the wrong tier'; END IF;

  -- -------------------------------------------------------------------------
  -- 4. Inside 72 hours: the sender alone, and nobody else.
  -- -------------------------------------------------------------------------
  INSERT INTO public.health_documents (user_id, uploaded_by_user_id, file_path, file_name, category, created_at)
  VALUES (v_patient, v_clinician, 'x/a.pdf', 'Discharge summary.pdf', 'other', now() - interval '2 hours')
  RETURNING id INTO v_doc;

  PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.withdraw_shared_file(v_doc, NULL, 'wrong_recipient', NULL, NULL, NULL, NULL);
    RESET ROLE; v_ok := true;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL: somebody who did not send it withdrew it'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  SET LOCAL ROLE authenticated;
  v_event := public.withdraw_shared_file(v_doc, NULL, 'wrong_recipient', 'Same surname as the intended patient', 'INC-2026-014', NULL, NULL);
  RESET ROLE;

  IF v_event.authority_used <> 'sender' THEN RAISE EXCEPTION 'FAIL: authority recorded as %', v_event.authority_used; END IF;
  IF v_event.actual_recipient_ref IS NULL THEN RAISE EXCEPTION 'FAIL: no concealed recipient ref'; END IF;
  IF v_event.incident_ref <> 'INC-2026-014' THEN RAISE EXCEPTION 'FAIL: the breach register reference was dropped'; END IF;

  -- The document is gone from the patient's reach, and still entirely present.
  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.health_documents WHERE id = v_doc;
  RESET ROLE;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL: the patient can still read a withdrawn document'; END IF;

  SELECT count(*) INTO v_count FROM public.health_documents WHERE id = v_doc;
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: withdrawal deleted the row'; END IF;
  SELECT file_path INTO v_text FROM public.health_documents WHERE id = v_doc;
  IF v_text IS NULL THEN RAISE EXCEPTION 'FAIL: withdrawal destroyed the file reference'; END IF;

  -- -------------------------------------------------------------------------
  -- 5. Past ten days ordinary withdrawal is no longer permitted. A document
  --    that old is corrected rather than removed.
  -- -------------------------------------------------------------------------
  INSERT INTO public.health_documents (user_id, uploaded_by_user_id, file_path, file_name, category, created_at)
  VALUES (v_patient, v_clinician, 'x/b.pdf', 'Assessment.pdf', 'other', now() - interval '40 days')
  RETURNING id INTO v_doc;

  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.withdraw_shared_file(v_doc, NULL, 'superseded', NULL, NULL, NULL, NULL);
    RESET ROLE; v_ok := true;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL: a forty-day-old document was withdrawn on an ordinary reason code'; END IF;

  -- A privacy code alone is not enough either — it needs the second signature.
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.withdraw_shared_file(v_doc, NULL, 'wrong_recipient', NULL, NULL, NULL, NULL);
    RESET ROLE; v_ok := true;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL: a late withdrawal went through without a co-signature'; END IF;

  -- Nor can they sign it themselves.
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.withdraw_shared_file(v_doc, NULL, 'wrong_recipient', NULL, NULL, v_clinician, NULL);
    RESET ROLE; v_ok := true;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL: the sender co-signed their own late withdrawal'; END IF;

  -- Nor can somebody outside the practice sign it.
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.withdraw_shared_file(v_doc, NULL, 'wrong_recipient', NULL, NULL, v_stranger, NULL);
    RESET ROLE; v_ok := true;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL: somebody outside the practice co-signed'; END IF;

  -- With a privacy code and a real colleague, it goes through.
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  SET LOCAL ROLE authenticated;
  v_event := public.withdraw_shared_file(v_doc, NULL, 'wrong_recipient', 'Sent to the wrong Jane', NULL, v_colleague, NULL);
  RESET ROLE;
  IF v_event.authority_used <> 'privacy_incident' THEN
    RAISE EXCEPTION 'FAIL: a late withdrawal recorded as %', v_event.authority_used;
  END IF;
  IF v_event.cosigned_by <> v_colleague THEN RAISE EXCEPTION 'FAIL: the co-signature was not recorded'; END IF;
  IF v_event.days_visible < 39 THEN RAISE EXCEPTION 'FAIL: the exposure window reads as % days', v_event.days_visible; END IF;

  -- -------------------------------------------------------------------------
  -- 6. Emergency: no co-signature, but it costs a privacy code and a written
  --    reason. An emergency nobody can describe afterwards is a bypass.
  -- -------------------------------------------------------------------------
  INSERT INTO public.health_documents (user_id, uploaded_by_user_id, file_path, file_name, category, created_at)
  VALUES (v_patient, v_clinician, 'x/c.pdf', 'Scan.pdf', 'imaging', now() - interval '90 days')
  RETURNING id INTO v_doc;

  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.withdraw_shared_file(v_doc, NULL, 'superseded', NULL, NULL, NULL, 'urgent');
    RESET ROLE; v_ok := true;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL: an emergency was declared on a routine reason code'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  SET LOCAL ROLE authenticated;
  v_event := public.withdraw_shared_file(
    v_doc, NULL, 'contains_other_patient_data', NULL, NULL, NULL,
    'Third party MRI visible to an unrelated patient; no admin available tonight');
  RESET ROLE;
  IF v_event.authority_used <> 'emergency' THEN RAISE EXCEPTION 'FAIL: emergency not recorded'; END IF;
  IF v_event.emergency_justification IS NULL THEN RAISE EXCEPTION 'FAIL: the justification was dropped'; END IF;

  -- -------------------------------------------------------------------------
  -- 7. A chat attachment is the same act. The message survives; the file goes.
  -- -------------------------------------------------------------------------
  INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body, attachment_path, attachment_name, created_at)
  VALUES (v_patient, v_clinician, v_clinician, 'Here is the report', v_patient::text||'/'||v_clinician::text||'/scan.pdf', 'scan.pdf', now() - interval '1 hour')
  RETURNING id INTO v_msg;

  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  SET LOCAL ROLE authenticated;
  v_event := public.withdraw_shared_file(NULL, v_msg, 'wrong_recipient', NULL, NULL, NULL, NULL);
  RESET ROLE;
  IF v_event.message_id <> v_msg THEN RAISE EXCEPTION 'FAIL: the attachment withdrawal did not name the message'; END IF;

  SELECT count(*) INTO v_count FROM public.messages WHERE id = v_msg;
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: withdrawing an attachment deleted the message'; END IF;
  SELECT attachment_retracted_at IS NOT NULL INTO v_ok FROM public.messages WHERE id = v_msg;
  IF NOT v_ok THEN RAISE EXCEPTION 'FAIL: the attachment was not marked withdrawn'; END IF;
  SELECT body INTO v_text FROM public.messages WHERE id = v_msg;
  IF v_text <> 'Here is the report' THEN RAISE EXCEPTION 'FAIL: withdrawing a file edited the conversation'; END IF;

  -- A message with no attachment cannot be withdrawn this way. Taking back the
  -- words of a clinical discussion is a different act with different rules.
  INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body, created_at)
  VALUES (v_patient, v_clinician, v_clinician, 'Just checking in', now())
  RETURNING id INTO v_msg;

  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.withdraw_shared_file(NULL, v_msg, 'sent_in_error', NULL, NULL, NULL, NULL);
    RESET ROLE; v_ok := true;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL: a message with no attachment was withdrawn'; END IF;

  -- -------------------------------------------------------------------------
  -- 8. The remnant. Neutral wording, and never the internal note.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.my_withdrawn_documents;
  RESET ROLE;
  IF v_count < 4 THEN RAISE EXCEPTION 'FAIL: the patient sees only % remnants', v_count; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  SET LOCAL ROLE authenticated;
  SELECT patient_message INTO v_text FROM public.my_withdrawn_documents
   WHERE reason_code = 'wrong_recipient' LIMIT 1;
  RESET ROLE;
  IF v_text IS NULL OR v_text = '' THEN RAISE EXCEPTION 'FAIL: no neutral message reaches the patient'; END IF;
  IF v_text ILIKE '%wrong Jane%' THEN RAISE EXCEPTION 'FAIL: the internal note reached the patient'; END IF;

  -- And a stranger sees no remnants at all.
  PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.my_withdrawn_documents;
  RESET ROLE;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL: a stranger sees % remnants', v_count; END IF;

  -- -------------------------------------------------------------------------
  -- 9. Objection: not in the first 72 hours, then yes, and only by the person
  --    it was withdrawn from. Recorded, never resolved.
  -- -------------------------------------------------------------------------
  SELECT * INTO v_event FROM public.document_retraction_events
   WHERE actual_recipient_id = v_patient ORDER BY retracted_at DESC LIMIT 1;

  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.object_to_withdrawal(v_event.id, 'I think this was mine');
    RESET ROLE; v_ok := true;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL: an objection was accepted inside the correction window'; END IF;

  UPDATE public.document_retraction_events SET retracted_at = now() - interval '8 days' WHERE id = v_event.id;

  PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.object_to_withdrawal(v_event.id, 'not mine to object to');
    RESET ROLE; v_ok := true;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL: a third party objected'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  SET LOCAL ROLE authenticated;
  v_event := public.object_to_withdrawal(v_event.id, 'I believe this document was about me');
  RESET ROLE;
  IF v_event.objected_at IS NULL THEN RAISE EXCEPTION 'FAIL: the objection was not recorded'; END IF;

  -- There is no outcome to set. If a resolution column ever appears here,
  -- somebody has decided this platform arbitrates, which it does not.
  SELECT count(*) INTO v_count FROM information_schema.columns
   WHERE table_name = 'document_retraction_events'
     AND column_name IN ('resolution', 'outcome', 'upheld', 'reviewed_by', 'decision');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'FAIL: the event table has an adjudication column — the platform is not the arbiter';
  END IF;

  -- -------------------------------------------------------------------------
  -- 10. The register carries the pattern: who withdrew what, how often.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.practice_withdrawal_register
   WHERE sending_clinician_id = v_clinician;
  RESET ROLE;
  IF v_count < 4 THEN RAISE EXCEPTION 'FAIL: the practice register shows only % withdrawals', v_count; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.practice_withdrawal_register;
  RESET ROLE;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL: the register leaked % rows to an outsider', v_count; END IF;

  RAISE NOTICE 'withdrawal_authority: all assertions passed';
END $$;

ROLLBACK;
