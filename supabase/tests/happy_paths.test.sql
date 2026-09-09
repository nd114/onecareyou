-- The things that must still work.
--
-- Written after a run of passes that tightened a great deal: delete policies,
-- storage reads, withdrawal enforcement, cascades, constraints. Every one of
-- those was a restriction, and a restriction that also stops the legitimate
-- case is a bug with better manners — one that shows up as nothing happening,
-- which is the hardest kind to notice.
--
-- So this asserts the ordinary day. Nothing here is a security property; it is
-- the list of things a patient and a clinician actually do, and each one is
-- here because something in the last few passes could plausibly have broken it.
BEGIN;

DO $$
DECLARE
  v_pat   uuid := gen_random_uuid();
  v_clin  uuid := gen_random_uuid();
  v_share uuid := gen_random_uuid();
  v_doc uuid; v_own uuid; v_med uuid; v_prop uuid; v_g uuid; v_sched uuid;
  v_n int; v_txt text;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
    (v_pat,'patient@example.com',now()), (v_clin,'clinician@example.com',now());
  INSERT INTO public.provider_shares (id,user_id,clinician_user_id,provider_name,invite_code,permissions,is_active)
  VALUES (v_share,v_pat,v_clin,'Dr Adeyemi','happy-1',
          '{"medications":true,"vitals":true,"documents":true,"adherence":true}'::jsonb,true);

  -- =========================================================================
  -- The patient's own record
  -- =========================================================================

  -- Upload a document, archive it, restore it, delete it.
  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.health_documents (user_id,file_path,file_name,category)
  VALUES (v_pat, v_pat::text||'/mine.pdf','My scan.pdf','imaging') RETURNING id INTO v_own;
  UPDATE public.health_documents SET archived_at = now() WHERE id = v_own;
  RESET ROLE;
  IF (SELECT archived_at FROM public.health_documents WHERE id=v_own) IS NULL THEN
    RAISE EXCEPTION 'FAIL: a patient cannot archive their own document';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.health_documents SET archived_at = NULL WHERE id = v_own;
  RESET ROLE;
  IF (SELECT archived_at FROM public.health_documents WHERE id=v_own) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: a patient cannot restore their own document';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.health_documents WHERE id = v_own;
  RESET ROLE;
  IF (SELECT count(*) FROM public.health_documents WHERE id=v_own) <> 0 THEN
    RAISE EXCEPTION 'FAIL: a patient cannot remove a document they uploaded themselves';
  END IF;

  -- Read their own medications. This is the one that was silently broken for
  -- everybody until a policy rewrite dropped the owner's branch.
  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.medications (user_id,name,dosage,frequency)
  VALUES (v_pat,'Metformin','500 mg','twice daily') RETURNING id INTO v_med;
  SELECT count(*) INTO v_n FROM public.medications WHERE id = v_med;
  RESET ROLE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: a patient cannot read their own medication'; END IF;

  -- Edit it, take a dose, and see the adherence.
  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.medications SET dosage = '1000 mg' WHERE id = v_med;
  INSERT INTO public.schedule_entries (user_id,medication_id,scheduled_time,status)
  VALUES (v_pat,v_med,now() - interval '2 hours','pending') RETURNING id INTO v_sched;
  UPDATE public.schedule_entries SET status='taken', taken_at=now() WHERE id = v_sched;
  RESET ROLE;
  IF (SELECT dosage FROM public.medications WHERE id=v_med) <> '1000 mg' THEN
    RAISE EXCEPTION 'FAIL: a patient cannot edit their own medication';
  END IF;
  IF (SELECT status FROM public.schedule_entries WHERE id=v_sched) <> 'taken' THEN
    RAISE EXCEPTION 'FAIL: a patient cannot mark a dose taken';
  END IF;

  -- Stop it. Available on anything, and it keeps the history.
  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.stop_medication(v_med,'Finished the course',NULL);
  RESET ROLE;
  IF (SELECT is_active FROM public.medications WHERE id=v_med) THEN
    RAISE EXCEPTION 'FAIL: a patient cannot stop their own medication';
  END IF;
  IF (SELECT count(*) FROM public.schedule_entries WHERE id=v_sched) <> 1 THEN
    RAISE EXCEPTION 'FAIL: stopping a medication erased the dose history';
  END IF;

  -- Record a reading.
  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.vitals (user_id,type,value,unit,recorded_at)
  VALUES (v_pat,'blood_pressure',120,'mmHg',now());
  SELECT count(*) INTO v_n FROM public.vitals WHERE user_id = v_pat;
  RESET ROLE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: a patient cannot record and read their own vitals'; END IF;

  -- =========================================================================
  -- What the clinician can do with a live share
  -- =========================================================================

  -- See the shared medication.
  PERFORM set_config('request.jwt.claim.sub', v_clin::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.medications WHERE id = v_med;
  RESET ROLE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: a shared-with clinician cannot see the medication'; END IF;

  -- File a document into the Vault, and the patient can read it.
  PERFORM set_config('request.jwt.claim.sub', v_clin::text, true);
  SET LOCAL ROLE authenticated;
  -- source_context is required by the clinician insert policy, which is how a
  -- clinician upload is told apart from a patient one at the row level.
  INSERT INTO public.health_documents (user_id,uploaded_by_user_id,file_path,file_name,category,source_context)
  VALUES (v_pat,v_clin,v_pat::text||'/sent.pdf','Discharge summary.pdf','discharge_summary','clinician_upload')
  RETURNING id INTO v_doc;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.health_documents WHERE id = v_doc;
  RESET ROLE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: the patient cannot read a document their clinician filed'; END IF;

  -- The patient can archive it — what they have instead of deleting.
  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.health_documents SET archived_at = now(), archived_reason = 'Dealt with' WHERE id = v_doc;
  RESET ROLE;
  IF (SELECT archived_at FROM public.health_documents WHERE id=v_doc) IS NULL THEN
    RAISE EXCEPTION 'FAIL: a patient cannot archive a document a clinician filed';
  END IF;

  -- Issue guidance, and the patient acknowledges it.
  PERFORM set_config('request.jwt.claim.sub', v_clin::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.clinician_guidance (clinician_user_id,patient_user_id,share_id,title,instruction)
  VALUES (v_clin,v_pat,v_share,'Check your blood pressure','Twice a week for a fortnight')
  RETURNING id INTO v_g;
  RESET ROLE;
  IF v_g IS NULL THEN RAISE EXCEPTION 'FAIL: a clinician cannot issue guidance'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.clinician_guidance SET acknowledged_at = now(), status = 'acknowledged' WHERE id = v_g;
  RESET ROLE;
  IF (SELECT acknowledged_at FROM public.clinician_guidance WHERE id=v_g) IS NULL THEN
    RAISE EXCEPTION 'FAIL: a patient cannot acknowledge guidance';
  END IF;

  -- =========================================================================
  -- Propose, accept, decline
  -- =========================================================================
  -- The patient adds it. A clinician cannot insert a medication at all, which
  -- is the design: they propose, and the patient accepts.
  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.medications (user_id,name,dosage,frequency) VALUES (v_pat,'Ramipril','5 mg','once daily')
  RETURNING id INTO v_med;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', v_clin::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.record_change_proposals (patient_user_id,proposed_by_user_id,kind,medication_id,payload,rationale)
  VALUES (v_pat,v_clin,'medication_change',v_med,'{"dosage":"10 mg"}'::jsonb,'Blood pressure still high')
  RETURNING id INTO v_prop;
  RESET ROLE;
  IF v_prop IS NULL THEN RAISE EXCEPTION 'FAIL: a clinician with a live share cannot propose a change'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.record_change_proposals WHERE id = v_prop;
  RESET ROLE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: the patient cannot see a proposal about their own record'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.respond_to_change_proposal(v_prop, true, NULL);
  RESET ROLE;
  IF (SELECT dosage FROM public.medications WHERE id=v_med) <> '10 mg' THEN
    RAISE EXCEPTION 'FAIL: accepting a proposal did not apply the change';
  END IF;

  -- =========================================================================
  -- Withdrawal, from both sides
  -- =========================================================================
  PERFORM set_config('request.jwt.claim.sub', v_clin::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.health_documents (user_id,uploaded_by_user_id,file_path,file_name,category,source_context)
  VALUES (v_pat,v_clin,v_pat::text||'/oops.pdf','Wrong letter.pdf','other','clinician_upload') RETURNING id INTO v_doc;
  PERFORM public.withdraw_shared_file(v_doc,NULL,'wrong_recipient','Same surname',NULL,NULL,NULL);
  RESET ROLE;

  -- The patient is told, in plain words, without the internal note.
  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  SELECT patient_message INTO v_txt FROM public.my_withdrawn_documents WHERE document_id = v_doc;
  RESET ROLE;
  IF v_txt IS NULL OR v_txt = '' THEN
    RAISE EXCEPTION 'FAIL: the patient is not told a document was withdrawn';
  END IF;
  IF v_txt ILIKE '%Same surname%' THEN
    RAISE EXCEPTION 'FAIL: the internal note reached the patient';
  END IF;

  -- And the clinician can see their own register entry.
  PERFORM set_config('request.jwt.claim.sub', v_clin::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.practice_withdrawal_register WHERE sending_clinician_id = v_clin;
  RESET ROLE;
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: a clinician cannot see the withdrawals they made'; END IF;

  -- =========================================================================
  -- Revoking, which must end access without destroying anything
  -- =========================================================================
  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.provider_shares SET is_active = false, revoked_at = now() WHERE id = v_share;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', v_clin::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.medications WHERE id = v_med;
  RESET ROLE;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: revoking a share did not end the clinician''s access'; END IF;

  IF (SELECT count(*) FROM public.clinician_guidance WHERE id = v_g) <> 1 THEN
    RAISE EXCEPTION 'FAIL: revoking destroyed the guidance that was issued';
  END IF;

  RAISE NOTICE 'happy_paths: all assertions passed';
END $$;

ROLLBACK;
