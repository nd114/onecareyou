-- Nothing is hard-deleted where somebody else relies on it.
--
-- Four DELETE policies predated the rule and each granted deletion on ownership
-- alone. All four looked unremarkable; all four were found by testing rather
-- than reading. Each pair below asserts the refusal and the thing that must
-- still work, because a rule that also blocks the legitimate case is a bug with
-- better manners.
BEGIN;

DO $$
DECLARE
  v_pat  uuid := gen_random_uuid();
  v_clin uuid := gen_random_uuid();
  v_id uuid; v_id2 uuid; v_med uuid; v_n int;
  v_share uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
    (v_pat,'p@example.com',now()), (v_clin,'c@example.com',now());

  -- -------------------------------------------------------------------------
  -- 1. Advice the patient acknowledged stands. Advice never seen can go.
  -- -------------------------------------------------------------------------
  INSERT INTO public.clinician_guidance (clinician_user_id,patient_user_id,title,instruction,acknowledged_at)
  VALUES (v_clin,v_pat,'Reduce your dose','Take one instead of two',now()) RETURNING id INTO v_id;
  PERFORM set_config('request.jwt.claim.sub', v_clin::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.clinician_guidance WHERE id = v_id;
  RESET ROLE;
  IF (SELECT count(*) FROM public.clinician_guidance WHERE id = v_id) <> 1 THEN
    RAISE EXCEPTION 'FAIL: a clinician deleted advice the patient had acknowledged';
  END IF;

  INSERT INTO public.clinician_guidance (clinician_user_id,patient_user_id,title,instruction)
  VALUES (v_clin,v_pat,'Draft','Not sent yet') RETURNING id INTO v_id2;
  PERFORM set_config('request.jwt.claim.sub', v_clin::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.clinician_guidance WHERE id = v_id2;
  RESET ROLE;
  IF (SELECT count(*) FROM public.clinician_guidance WHERE id = v_id2) <> 0 THEN
    RAISE EXCEPTION 'FAIL: a clinician cannot remove guidance nobody has seen';
  END IF;

  -- -------------------------------------------------------------------------
  -- 2. An imported medication is the sending system's record of what it
  --    prescribed. The interface already refused this; the policy did not, so
  --    the refusal was a message rather than a boundary.
  -- -------------------------------------------------------------------------
  INSERT INTO public.medications (user_id,name,dosage,frequency,source)
  VALUES (v_pat,'Morphine','10 mg','twice daily','hospital_ehr') RETURNING id INTO v_id;
  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.medications WHERE id = v_id;
  RESET ROLE;
  IF (SELECT count(*) FROM public.medications WHERE id = v_id) <> 1 THEN
    RAISE EXCEPTION 'FAIL: a patient deleted a medication imported from a hospital system';
  END IF;

  -- Stopping it stays available, which is the point. Saying "I am not taking
  -- this" is theirs to say; deleting the prescription is not.
  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.stop_medication(v_id, 'Side effects', NULL);
  RESET ROLE;
  IF (SELECT is_active FROM public.medications WHERE id = v_id) THEN
    RAISE EXCEPTION 'FAIL: a patient cannot stop an imported medication';
  END IF;

  INSERT INTO public.medications (user_id,name,dosage,frequency)
  VALUES (v_pat,'Vitamin D','1000 iu','once daily') RETURNING id INTO v_id;
  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.medications WHERE id = v_id;
  RESET ROLE;
  IF (SELECT count(*) FROM public.medications WHERE id = v_id) <> 0 THEN
    RAISE EXCEPTION 'FAIL: a patient cannot delete a medication they added themselves';
  END IF;

  -- -------------------------------------------------------------------------
  -- 3. A dose that has come round is history. Clinicians change treatment on
  --    the strength of adherence, and one whose misses can be removed is not
  --    something anybody can rely on.
  -- -------------------------------------------------------------------------
  INSERT INTO public.medications (user_id,name,dosage,frequency)
  VALUES (v_pat,'Ramipril','5 mg','once daily') RETURNING id INTO v_med;
  INSERT INTO public.schedule_entries (user_id,medication_id,scheduled_time,status)
  VALUES (v_pat,v_med,now() - interval '2 days','missed') RETURNING id INTO v_id;
  INSERT INTO public.schedule_entries (user_id,medication_id,scheduled_time,status)
  VALUES (v_pat,v_med,now() - interval '1 day','taken') RETURNING id INTO v_id2;

  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.schedule_entries WHERE id IN (v_id, v_id2);
  RESET ROLE;
  SELECT count(*) INTO v_n FROM public.schedule_entries WHERE id IN (v_id, v_id2);
  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL: % dose(s) of history were deleted', 2 - v_n; END IF;

  -- Clearing a reminder that has not come round yet is fine, and is what
  -- stopping a medicine does.
  INSERT INTO public.schedule_entries (user_id,medication_id,scheduled_time,status)
  VALUES (v_pat,v_med,now() + interval '2 days','pending') RETURNING id INTO v_id;
  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.schedule_entries WHERE id = v_id;
  RESET ROLE;
  IF (SELECT count(*) FROM public.schedule_entries WHERE id = v_id) <> 0 THEN
    RAISE EXCEPTION 'FAIL: a patient cannot clear a reminder that has not come round';
  END IF;

  -- -------------------------------------------------------------------------
  -- 4. A claimed record belongs to the patient, and carries the onboarding
  --    attribution the institution is paid on. The UPDATE policy already
  --    stopped at the claim; DELETE did not, so the row could be removed
  --    instead of edited.
  -- -------------------------------------------------------------------------
  INSERT INTO public.clinician_patient_records (clinician_user_id,patient_name,linked_user_id,invitation_status)
  VALUES (v_clin,'Jane Evans',v_pat,'accepted') RETURNING id INTO v_id;
  PERFORM set_config('request.jwt.claim.sub', v_clin::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.clinician_patient_records WHERE id = v_id;
  RESET ROLE;
  IF (SELECT count(*) FROM public.clinician_patient_records WHERE id = v_id) <> 1 THEN
    RAISE EXCEPTION 'FAIL: a clinician deleted a record the patient had claimed';
  END IF;

  INSERT INTO public.clinician_patient_records (clinician_user_id,patient_name,invitation_status)
  VALUES (v_clin,'Unclaimed','pending') RETURNING id INTO v_id;
  PERFORM set_config('request.jwt.claim.sub', v_clin::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.clinician_patient_records WHERE id = v_id;
  RESET ROLE;
  IF (SELECT count(*) FROM public.clinician_patient_records WHERE id = v_id) <> 0 THEN
    RAISE EXCEPTION 'FAIL: a clinician cannot remove a record nobody has claimed';
  END IF;

  -- -------------------------------------------------------------------------
  -- 5. And the way round rule 3: schedule_entries cascades from medications, so
  --    a patient blocked from deleting a missed dose could delete the medicine
  --    and take the history with it.
  -- -------------------------------------------------------------------------
  INSERT INTO public.medications (user_id,name,dosage,frequency)
  VALUES (v_pat,'Sertraline','50 mg','once daily') RETURNING id INTO v_med;
  INSERT INTO public.schedule_entries (user_id,medication_id,scheduled_time,status)
  VALUES (v_pat,v_med,now() - interval '3 days','missed');

  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.medications WHERE id = v_med;
  RESET ROLE;
  IF (SELECT count(*) FROM public.medications WHERE id = v_med) <> 1 THEN
    RAISE EXCEPTION 'FAIL: deleting a medication erased its adherence history through the cascade';
  END IF;
  IF (SELECT count(*) FROM public.schedule_entries WHERE medication_id = v_med) <> 1 THEN
    RAISE EXCEPTION 'FAIL: the dose history went with it';
  END IF;

  -- Stopping is what they do instead, and it keeps everything.
  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.stop_medication(v_med, 'Changed my mind', NULL);
  RESET ROLE;
  IF (SELECT count(*) FROM public.schedule_entries WHERE medication_id = v_med) <> 1 THEN
    RAISE EXCEPTION 'FAIL: stopping a medication erased its history';
  END IF;

  -- A medication with nothing behind it is still removable — the case deleting
  -- is actually for.
  INSERT INTO public.medications (user_id,name,dosage,frequency)
  VALUES (v_pat,'Typo','1','od') RETURNING id INTO v_med;
  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.medications WHERE id = v_med;
  RESET ROLE;
  IF (SELECT count(*) FROM public.medications WHERE id = v_med) <> 0 THEN
    RAISE EXCEPTION 'FAIL: a medication entered by mistake cannot be removed';
  END IF;

  RAISE NOTICE 'deletion_rules: rules 1-5 passed';
END $$;

-- A second block with its own people, because assertions 6 and 7 are about
-- cascades and the earlier ones leave shares, guidance and medications behind
-- that a cascade test will pick up. Sharing fixtures across a long block is how
-- a test starts failing for reasons that have nothing to do with its subject.
DO $$
DECLARE
  v_pat   uuid := gen_random_uuid();
  v_clin  uuid := gen_random_uuid();
  v_share uuid := gen_random_uuid();
  v_g     uuid;
  v_med   uuid;
  v_prop  uuid;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
    (v_pat,'p2@example.com',now()), (v_clin,'c2@example.com',now());

  -- -------------------------------------------------------------------------
  -- 6. Revoking a share must not erase the advice given through it.
  --
  --    clinician_guidance.share_id cascaded from provider_shares and patients
  --    held DELETE on their own shares, so ending access removed every
  --    instruction issued through it — including advice the patient had
  --    acknowledged — from both sides at once.
  -- -------------------------------------------------------------------------
  INSERT INTO public.provider_shares (id,user_id,clinician_user_id,provider_name,invite_code,permissions,is_active)
  VALUES (v_share,v_pat,v_clin,'Dr Adeyemi','code-cascade','{"medications":true}'::jsonb,true);
  INSERT INTO public.clinician_guidance (clinician_user_id,patient_user_id,share_id,title,instruction,acknowledged_at)
  VALUES (v_clin,v_pat,v_share,'Bring your monitor','Bring your blood pressure monitor next visit',now())
  RETURNING id INTO v_g;
  IF v_g IS NULL THEN
    -- skip_duplicate_guidance() drops a repeat silently, so a fixture that
    -- reuses wording elsewhere in the file vanishes without an error.
    RAISE EXCEPTION 'FAIL: the guidance fixture was not created';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.provider_shares WHERE id = v_share;
  RESET ROLE;

  IF (SELECT count(*) FROM public.provider_shares WHERE id = v_share) <> 1 THEN
    RAISE EXCEPTION 'FAIL: a share was deleted rather than deactivated, losing the sharing history';
  END IF;
  IF (SELECT count(*) FROM public.clinician_guidance WHERE id = v_g) <> 1 THEN
    RAISE EXCEPTION 'FAIL: revoking a share erased the advice given through it';
  END IF;

  -- Ending it the way the product actually does keeps everything.
  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.provider_shares SET is_active = false WHERE id = v_share;
  RESET ROLE;
  IF (SELECT is_active FROM public.provider_shares WHERE id = v_share) THEN
    RAISE EXCEPTION 'FAIL: a patient cannot revoke their own share';
  END IF;

  -- And a delete reaching the row another way — the service role, an admin
  -- path — leaves the instruction standing rather than taking it along.
  DELETE FROM public.provider_shares WHERE id = v_share;
  IF (SELECT count(*) FROM public.clinician_guidance WHERE id = v_g) <> 1 THEN
    RAISE EXCEPTION 'FAIL: the cascade still erases guidance when a share is removed';
  END IF;
  IF (SELECT share_id FROM public.clinician_guidance WHERE id = v_g) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: the guidance still points at a share that no longer exists';
  END IF;

  -- -------------------------------------------------------------------------
  -- 7. A proposal outlives the medication it referred to. A declined change is
  --    the record of a patient refusing something, and it was going with the row.
  -- -------------------------------------------------------------------------
  INSERT INTO public.medications (user_id,name,dosage,frequency)
  VALUES (v_pat,'Untaken','1 mg','once daily') RETURNING id INTO v_med;
  INSERT INTO public.record_change_proposals
    (patient_user_id,proposed_by_user_id,kind,medication_id,payload,status,responded_at)
  VALUES (v_pat,v_clin,'medication_change',v_med,'{"dosage":"2 mg"}'::jsonb,'declined',now())
  RETURNING id INTO v_prop;

  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.medications WHERE id = v_med;
  RESET ROLE;

  IF (SELECT count(*) FROM public.record_change_proposals WHERE id = v_prop) <> 1 THEN
    RAISE EXCEPTION 'FAIL: deleting a medication erased the record of a change the patient declined';
  END IF;

  RAISE NOTICE 'deletion_rules: all assertions passed';

END $$;

ROLLBACK;
