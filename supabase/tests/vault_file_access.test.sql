-- The file follows the record.
--
-- Three holes, all in the gap between a row and the bytes behind it. They were
-- invisible locally until the harness was given the storage grants Supabase
-- gives: every probe failed with "permission denied for table objects" before
-- any policy was consulted, so a bucket wide open looked exactly like one
-- locked down.
--
-- The assertion that matters most is the first. Withdrawal's entire promise is
-- that the information stops being reachable, and it was only ever true of the
-- row — the file stayed one signed URL away for anyone who kept the path.
BEGIN;

DO $$
DECLARE
  v_pat   uuid := gen_random_uuid();
  v_clin  uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_sent uuid; v_own uuid; v_lab uuid;
  p_sent text; p_own text; p_lab text;
  v_n int;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
    (v_pat,'p@example.com',now()), (v_clin,'c@example.com',now()), (v_other,'o@example.com',now());

  p_sent := v_pat::text||'/sent.pdf';
  p_own  := v_pat::text||'/mine.pdf';
  p_lab  := v_pat::text||'/labs.pdf';
  INSERT INTO storage.objects (bucket_id,name,owner) VALUES
    ('health-documents', p_sent, v_clin),
    ('health-documents', p_own,  v_pat),
    ('lab-reports',      p_lab,  v_clin);

  INSERT INTO public.health_documents (user_id, uploaded_by_user_id, file_path, file_name, category)
  VALUES (v_pat, v_clin, p_sent, 'Discharge summary.pdf', 'other') RETURNING id INTO v_sent;
  INSERT INTO public.health_documents (user_id, file_path, file_name, category)
  VALUES (v_pat, p_own, 'My scan.pdf', 'imaging') RETURNING id INTO v_own;
  INSERT INTO public.health_documents (user_id, uploaded_by_user_id, file_path, file_name, category)
  VALUES (v_pat, v_clin, p_lab, 'Bloods.pdf', 'lab_result') RETURNING id INTO v_lab;

  -- -------------------------------------------------------------------------
  -- 1. A patient cannot destroy a document a clinician filed. Archiving is
  --    what they have instead: a document somebody was handed cannot vanish
  --    from under them.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.health_documents WHERE id = v_sent;
  RESET ROLE;
  IF (SELECT count(*) FROM public.health_documents WHERE id = v_sent) <> 1 THEN
    RAISE EXCEPTION 'FAIL: a patient deleted a document a clinician filed';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM storage.objects WHERE name = p_sent;
  RESET ROLE;
  IF (SELECT count(*) FROM storage.objects WHERE name = p_sent) <> 1 THEN
    RAISE EXCEPTION 'FAIL: a patient deleted the file behind a clinician-filed document';
  END IF;

  -- 2. But their own upload is theirs to remove.
  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM storage.objects WHERE name = p_own;
  DELETE FROM public.health_documents WHERE id = v_own;
  RESET ROLE;
  IF (SELECT count(*) FROM public.health_documents WHERE id = v_own) <> 0 THEN
    RAISE EXCEPTION 'FAIL: a patient cannot remove their own upload';
  END IF;

  -- -------------------------------------------------------------------------
  -- 3. A withdrawn document's FILE leaves storage, not just its row.
  --
  --    The check has to run with definer rights. Inlined in the policy it
  --    evaluates under the reader's own visibility, and a withdrawn row is
  --    invisible to them — so the check finds nothing and passes. The first
  --    version of the fix did exactly that and leaked every file it was
  --    written to stop.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_clin::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.withdraw_shared_file(v_sent, NULL, 'wrong_recipient', NULL, NULL, NULL, NULL);
  PERFORM public.withdraw_shared_file(v_lab,  NULL, 'wrong_recipient', NULL, NULL, NULL, NULL);
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM storage.objects WHERE name = p_sent;
  RESET ROLE;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: a withdrawn document is still downloadable from storage'; END IF;

  -- Lab reports live in their own bucket and are the same documents. The same
  -- hole existed there and would have been missed by testing one bucket.
  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM storage.objects WHERE name = p_lab;
  RESET ROLE;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: a withdrawn lab report is still downloadable'; END IF;

  -- 4. And the evidence survives. Withdrawal stops access; it does not destroy
  --    what somebody has to answer for.
  IF (SELECT count(*) FROM storage.objects WHERE name = p_sent) <> 1 THEN
    RAISE EXCEPTION 'FAIL: withdrawal destroyed the file';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_pat::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM storage.objects WHERE name = p_sent;
  UPDATE storage.objects SET owner = v_pat WHERE name = p_sent;
  RESET ROLE;
  IF (SELECT count(*) FROM storage.objects WHERE name = p_sent) <> 1 THEN
    RAISE EXCEPTION 'FAIL: a patient destroyed the evidence behind a withdrawal';
  END IF;

  -- 5. A stranger reaches none of it, before or after.
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM storage.objects
   WHERE name IN (p_sent, p_lab) AND bucket_id IN ('health-documents','lab-reports');
  RESET ROLE;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: an unrelated user read % vault files', v_n; END IF;

  RAISE NOTICE 'vault_file_access: all assertions passed';
END $$;

ROLLBACK;
