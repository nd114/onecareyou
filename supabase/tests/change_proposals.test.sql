-- A clinician proposes; the patient decides.
--
-- The bug this closes was a consent bug, not a missing feature: the connection
-- dialog offered "Accept & Collaborate — both you and your provider can update
-- records going forward" and wrote meds_write:true into the sharing agreement,
-- while `medications` carried no clinician write policy of any kind. The
-- patient agreed to something that could not happen.
--
-- The assertions worth reading first are the ones about what an accepted
-- proposal cannot do. "The clinician can change a dose" is easy; "the clinician
-- cannot move the medication to another person, or launder an imported row
-- into an editable one, by putting those keys in the payload" is the whole
-- reason the payload is read through a fixed key list.
BEGIN;

DO $$
DECLARE
  v_clinician  uuid := gen_random_uuid();
  v_patient    uuid := gen_random_uuid();
  v_other      uuid := gen_random_uuid();
  v_stranger   uuid := gen_random_uuid();
  v_share      uuid := gen_random_uuid();
  v_med        uuid := gen_random_uuid();
  v_proposal   uuid;
  v_row        public.record_change_proposals;
  v_count      int;
  v_ok         boolean;
  v_text       text;
  v_date       date;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
    (v_clinician,'dr@example.com',now()),
    (v_patient,'patient@example.com',now()),
    (v_other,'other@example.com',now()),
    (v_stranger,'stranger@example.com',now());

  -- A live share that grants medications.
  INSERT INTO public.provider_shares
    (id, user_id, clinician_user_id, provider_name, invite_code, permissions, is_active)
  VALUES
    (v_share, v_patient, v_clinician, 'Dr Adeyemi', 'code-1',
     '{"medications": true, "vitals": true}'::jsonb, true);

  INSERT INTO public.medications (id, user_id, name, dosage, frequency, source)
  VALUES (v_med, v_patient, 'Metformin', '500 mg', 'twice daily', 'manual');

  -- -------------------------------------------------------------------------
  -- 1. A clinician with a live medications share can propose.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.record_change_proposals
    (patient_user_id, proposed_by_user_id, kind, medication_id, payload, rationale)
  VALUES
    (v_patient, v_clinician, 'medication_change', v_med,
     '{"dosage": "1000 mg"}'::jsonb, 'HbA1c still above target')
  RETURNING id INTO v_proposal;
  RESET ROLE;

  IF v_proposal IS NULL THEN RAISE EXCEPTION 'FAIL: a shared-with clinician could not propose'; END IF;

  -- -------------------------------------------------------------------------
  -- 2. Proposing does not change the record. This is the entire distinction
  --    between a proposal and a write.
  -- -------------------------------------------------------------------------
  SELECT dosage INTO v_text FROM public.medications WHERE id = v_med;
  IF v_text <> '500 mg' THEN
    RAISE EXCEPTION 'FAIL: the dose changed before the patient answered (%)', v_text;
  END IF;

  -- -------------------------------------------------------------------------
  -- 3. A clinician with no share cannot put a decision in front of somebody.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.record_change_proposals
      (patient_user_id, proposed_by_user_id, kind, medication_id, payload)
    VALUES (v_patient, v_stranger, 'medication_change', v_med, '{"dosage": "2000 mg"}'::jsonb);
    RESET ROLE;
    v_ok := true;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RESET ROLE;
  END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL: a clinician with no share proposed a change'; END IF;

  -- -------------------------------------------------------------------------
  -- 4. Revoking the share stops future proposals. Not "held access once".
  --
  -- A start rather than a change, because the proposal from assertion 1 is
  -- still open against v_med and one clinician may only have one open proposal
  -- per medication — colliding with that index would pass this test for the
  -- wrong reason.
  -- -------------------------------------------------------------------------
  -- Revoked by the patient, because guard_provider_share_consent() silently
  -- reverts is_active for anyone who is not the share's owner — a fixture that
  -- revokes under whatever claim the previous assertion left behind quietly
  -- does nothing, and the assertion below then passes or fails for a reason
  -- that has nothing to do with what it claims to test.
  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  UPDATE public.provider_shares SET is_active = false WHERE id = v_share;
  IF (SELECT is_active FROM public.provider_shares WHERE id = v_share) THEN
    RAISE EXCEPTION 'FAIL: the fixture did not actually revoke the share';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.record_change_proposals
      (patient_user_id, proposed_by_user_id, kind, payload)
    VALUES (v_patient, v_clinician, 'medication_start', '{"name": "Anything"}'::jsonb);
    RESET ROLE;
    v_ok := true;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RESET ROLE;
  END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL: a clinician proposed after the patient revoked the share'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  UPDATE public.provider_shares SET is_active = true WHERE id = v_share;

  -- -------------------------------------------------------------------------
  -- 5. The proposer cannot answer their own proposal.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.respond_to_change_proposal(v_proposal, true, NULL);
    RESET ROLE;
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
  END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL: the clinician accepted their own proposal'; END IF;

  -- -------------------------------------------------------------------------
  -- 6. Nor can an unrelated third party.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.respond_to_change_proposal(v_proposal, true, NULL);
    RESET ROLE;
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
  END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL: somebody else answered for the patient'; END IF;

  -- Still untouched after two failed attempts.
  SELECT dosage INTO v_text FROM public.medications WHERE id = v_med;
  IF v_text <> '500 mg' THEN RAISE EXCEPTION 'FAIL: a rejected caller still changed the dose'; END IF;

  -- -------------------------------------------------------------------------
  -- 7. The patient accepts, and only then does the record change.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  SET LOCAL ROLE authenticated;
  v_row := public.respond_to_change_proposal(v_proposal, true, 'Happy to try it');
  RESET ROLE;

  IF v_row.status <> 'accepted' THEN RAISE EXCEPTION 'FAIL: status is %', v_row.status; END IF;
  IF v_row.applied_medication_id <> v_med THEN RAISE EXCEPTION 'FAIL: the proposal does not point at what it changed'; END IF;

  SELECT dosage INTO v_text FROM public.medications WHERE id = v_med;
  IF v_text <> '1000 mg' THEN RAISE EXCEPTION 'FAIL: accepting did not apply the change (%)', v_text; END IF;

  -- -------------------------------------------------------------------------
  -- 8. A proposal is a diff. The payload named the dose, so the name, the
  --    frequency and everything else it did not mention are untouched.
  -- -------------------------------------------------------------------------
  SELECT name INTO v_text FROM public.medications WHERE id = v_med;
  IF v_text <> 'Metformin' THEN RAISE EXCEPTION 'FAIL: an unmentioned field changed (%)', v_text; END IF;
  SELECT frequency INTO v_text FROM public.medications WHERE id = v_med;
  IF v_text <> 'twice daily' THEN RAISE EXCEPTION 'FAIL: frequency was blanked by a partial payload (%)', v_text; END IF;

  -- -------------------------------------------------------------------------
  -- 9. Answering twice is refused. A proposal is a decision, not a switch.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.respond_to_change_proposal(v_proposal, false, NULL);
    RESET ROLE;
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
  END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL: an answered proposal was answered again'; END IF;

  -- -------------------------------------------------------------------------
  -- 10. The accepted change is auditable, attributed to the clinician who
  --     proposed it, and says who answered.
  -- -------------------------------------------------------------------------
  SELECT count(*) INTO v_count
    FROM public.hipaa_audit_logs
   WHERE resource_id = v_proposal::text
     AND action = 'medication_proposal_accepted'
     AND user_id = v_clinician
     AND patient_user_id = v_patient
     AND details->>'answered_by' = v_patient::text;
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: the acceptance is not in the audit log (% rows)', v_count; END IF;

  -- The proposal itself was logged when it was made, so "a change was
  -- suggested" survives even where nobody answers.
  SELECT count(*) INTO v_count
    FROM public.hipaa_audit_logs
   WHERE resource_id = v_proposal::text AND action = 'change_proposed';
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: the proposal was not logged when made'; END IF;

  -- -------------------------------------------------------------------------
  -- 11. A payload cannot reach a column the design did not intend. This is the
  --     "not carte blanche" assertion: the clinician proposes a dose change and
  --     smuggles user_id and source alongside it.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.record_change_proposals
    (patient_user_id, proposed_by_user_id, kind, medication_id, payload)
  VALUES
    (v_patient, v_clinician, 'medication_change', v_med,
     jsonb_build_object('dosage', '750 mg', 'user_id', v_other::text, 'source', 'hospital_ehr'))
  RETURNING id INTO v_proposal;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.respond_to_change_proposal(v_proposal, true, NULL);
  RESET ROLE;

  SELECT user_id INTO v_text FROM public.medications WHERE id = v_med;
  IF v_text <> v_patient::text THEN
    RAISE EXCEPTION 'FAIL: an accepted proposal moved the medication to another person';
  END IF;
  SELECT source INTO v_text FROM public.medications WHERE id = v_med;
  IF v_text <> 'manual' THEN
    RAISE EXCEPTION 'FAIL: an accepted proposal rewrote provenance to % — the patient would lose the right to edit their own row', v_text;
  END IF;
  SELECT dosage INTO v_text FROM public.medications WHERE id = v_med;
  IF v_text <> '750 mg' THEN RAISE EXCEPTION 'FAIL: the legitimate half of the payload did not apply'; END IF;

  -- -------------------------------------------------------------------------
  -- 12. Declining changes nothing and is still recorded. A declined proposal is
  --     as much a part of the history as an accepted one.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.record_change_proposals
    (patient_user_id, proposed_by_user_id, kind, medication_id, payload, rationale)
  VALUES (v_patient, v_clinician, 'medication_stop', v_med, '{}'::jsonb, 'Switching to gliclazide')
  RETURNING id INTO v_proposal;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  SET LOCAL ROLE authenticated;
  v_row := public.respond_to_change_proposal(v_proposal, false, 'I would rather stay on it');
  RESET ROLE;

  IF v_row.status <> 'declined' THEN RAISE EXCEPTION 'FAIL: decline did not stick'; END IF;
  IF v_row.applied_medication_id IS NOT NULL THEN RAISE EXCEPTION 'FAIL: a declined proposal points at a change'; END IF;

  SELECT is_active INTO v_ok FROM public.medications WHERE id = v_med;
  IF NOT v_ok THEN RAISE EXCEPTION 'FAIL: declining a stop stopped the medication anyway'; END IF;

  SELECT response_note INTO v_text FROM public.record_change_proposals WHERE id = v_proposal;
  IF v_text <> 'I would rather stay on it' THEN RAISE EXCEPTION 'FAIL: the patient''s reason was not kept'; END IF;

  -- -------------------------------------------------------------------------
  -- 13. Accepting a stop ends the medication rather than deleting it.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.record_change_proposals
    (patient_user_id, proposed_by_user_id, kind, medication_id, payload, rationale)
  VALUES (v_patient, v_clinician, 'medication_stop', v_med, '{}'::jsonb, 'Switching to gliclazide')
  RETURNING id INTO v_proposal;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.respond_to_change_proposal(v_proposal, true, NULL);
  RESET ROLE;

  SELECT count(*) INTO v_count FROM public.medications WHERE id = v_med;
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: accepting a stop deleted the row'; END IF;
  SELECT is_active INTO v_ok FROM public.medications WHERE id = v_med;
  IF v_ok THEN RAISE EXCEPTION 'FAIL: accepting a stop left the medication active'; END IF;
  SELECT end_date INTO v_date FROM public.medications WHERE id = v_med;
  IF v_date IS NULL THEN RAISE EXCEPTION 'FAIL: a stopped medication has no end date'; END IF;

  -- -------------------------------------------------------------------------
  -- 14. Starting a new medication puts it in the patient's list as theirs —
  --     editable, because they accepted it.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.record_change_proposals
    (patient_user_id, proposed_by_user_id, kind, payload, rationale)
  VALUES
    (v_patient, v_clinician, 'medication_start',
     '{"name": "Gliclazide", "dosage": "80 mg", "frequency": "once daily"}'::jsonb,
     'Replacing metformin')
  RETURNING id INTO v_proposal;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  SET LOCAL ROLE authenticated;
  v_row := public.respond_to_change_proposal(v_proposal, true, NULL);
  RESET ROLE;

  SELECT count(*) INTO v_count
    FROM public.medications
   WHERE id = v_row.applied_medication_id
     AND user_id = v_patient
     AND name = 'Gliclazide'
     AND source = 'manual';
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: the accepted start did not create the patient''s medication'; END IF;

  -- -------------------------------------------------------------------------
  -- 15. A withdrawn proposal is taken off the patient's plate by the person who
  --     made it, and nobody else.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.record_change_proposals
    (patient_user_id, proposed_by_user_id, kind, payload)
  VALUES (v_patient, v_clinician, 'medication_start', '{"name": "Wrong drug"}'::jsonb)
  RETURNING id INTO v_proposal;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.withdraw_change_proposal(v_proposal, 'not mine to withdraw');
    RESET ROLE;
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
  END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL: a third party withdrew somebody else''s proposal'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  SET LOCAL ROLE authenticated;
  v_row := public.withdraw_change_proposal(v_proposal, 'Selected the wrong drug');
  RESET ROLE;
  IF v_row.status <> 'withdrawn' THEN RAISE EXCEPTION 'FAIL: withdraw did not stick'; END IF;

  -- The withdrawn proposal survives, marked. Nothing is hard-deleted where
  -- there is a record of it having been asked.
  SELECT count(*) INTO v_count FROM public.record_change_proposals WHERE id = v_proposal;
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: withdrawing removed the row'; END IF;

  -- And a withdrawn proposal can no longer be accepted.
  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.respond_to_change_proposal(v_proposal, true, NULL);
    RESET ROLE;
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
  END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL: a withdrawn proposal was still accepted'; END IF;

  -- -------------------------------------------------------------------------
  -- 16. The patient can see every proposal about them; a clinician sees only
  --     the ones they made.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.record_change_proposals;
  RESET ROLE;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL: an unrelated user read % proposals', v_count; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.record_change_proposals WHERE patient_user_id = v_patient;
  RESET ROLE;
  IF v_count < 5 THEN RAISE EXCEPTION 'FAIL: the patient cannot see their own history (% rows)', v_count; END IF;

  -- -------------------------------------------------------------------------
  -- 17. A clinician cannot set the status directly. Every transition has to go
  --     through a function, or "accepted" stops meaning the patient accepted.
  --
  --     Asserted on the row rather than on an exception. Postgres refuses this
  --     two different ways depending on which guard bites first — a revoked
  --     privilege raises, an absent policy quietly updates nothing — and a test
  --     that insists on the raise passes only for as long as the grants happen
  --     to be the thing stopping it. What has to stay true is that the status
  --     did not move.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.record_change_proposals SET status = 'accepted' WHERE id = v_proposal;
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;
  SELECT status INTO v_text FROM public.record_change_proposals WHERE id = v_proposal;
  IF v_text <> 'withdrawn' THEN
    RAISE EXCEPTION 'FAIL: a clinician moved their own proposal to % without the patient', v_text;
  END IF;

  -- Nor can the patient bypass the function to accept without applying
  -- anything. "Accepted" has to mean the medication actually changed.
  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.record_change_proposals SET status = 'accepted' WHERE id = v_proposal;
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;
  SELECT status INTO v_text FROM public.record_change_proposals WHERE id = v_proposal;
  IF v_text <> 'withdrawn' THEN
    RAISE EXCEPTION 'FAIL: the patient set a status directly, so acceptance no longer implies the change was applied';
  END IF;

  -- -------------------------------------------------------------------------
  -- 18. Nobody deletes a proposal. A decision somebody was asked to make is
  --     part of the record whichever way it went.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  BEGIN
    SET LOCAL ROLE authenticated;
    DELETE FROM public.record_change_proposals WHERE id = v_proposal;
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;
  SELECT count(*) INTO v_count FROM public.record_change_proposals WHERE id = v_proposal;
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: a proposal was deleted'; END IF;

  RAISE NOTICE 'change_proposals: all assertions passed';
END $$;

ROLLBACK;
