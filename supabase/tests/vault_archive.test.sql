-- Archiving a Vault document.
--
-- Archive rather than delete: a document a clinician has already been given
-- should not be able to vanish from under them. These assert the three things
-- that distinguish archiving from deleting — it hides, it narrows whole-vault
-- sharing, and it destroys nothing — plus the one thing it must NOT do, which
-- is silently revoke a file somebody was handed on purpose.

BEGIN;

DO $$
DECLARE
  v_patient    uuid := '11111111-1111-1111-1111-111111111111';
  v_clinician  uuid := '22222222-2222-2222-2222-222222222222';
  v_share      uuid;
  v_active_doc uuid := gen_random_uuid();
  v_archived   uuid := gen_random_uuid();
  v_shared_doc uuid := gen_random_uuid();
  v_count      int;
  v_failed     boolean;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (v_patient, 'patient@example.com'),
    (v_clinician, 'jane.evans@example.com');

  -- Three documents: one active, one archived, one archived *and* explicitly
  -- shared with the clinician.
  INSERT INTO public.health_documents (id, user_id, file_path, file_name, category)
  VALUES
    (v_active_doc, v_patient, 'p/active.pdf',  'Recent letter',  'other'),
    (v_archived,   v_patient, 'p/old.pdf',     'Old letter',     'other'),
    (v_shared_doc, v_patient, 'p/handed.pdf',  'Handed over',    'other');

  -- The clinician has whole-vault access.
  INSERT INTO public.provider_shares
    (id, user_id, provider_name, provider_email, clinician_user_id, invite_code, is_active, permissions)
  VALUES
    (gen_random_uuid(), v_patient, 'Dr Jane Evans', 'jane.evans@example.com', v_clinician,
     'CODE1234', true,
     '{"vitals":true,"meds":true,"adherence":true,"profile":false,"documents":true}'::jsonb)
  RETURNING id INTO v_share;

  -- ...and one document was also handed over individually.
  INSERT INTO public.document_shares (id, user_id, document_id, provider_share_id, is_active)
  VALUES (gen_random_uuid(), v_patient, v_shared_doc, v_share, true);

  -- ---------------------------------------------------------------
  -- Before archiving: the clinician sees all three
  -- ---------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  PERFORM set_config('request.jwt.claim.email', 'jane.evans@example.com', true);

  SELECT count(*) INTO v_count FROM public.health_documents WHERE user_id = v_patient;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'clinician saw % documents before archiving, expected 3', v_count;
  END IF;
  RAISE NOTICE 'whole-vault access shows every document to start: t';
  RESET ROLE;

  -- ---------------------------------------------------------------
  -- The patient archives two of them
  -- ---------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);

  UPDATE public.health_documents
     SET archived_at = now(), archived_reason = 'Superseded'
   WHERE id IN (v_archived, v_shared_doc);
  RAISE NOTICE 'a patient can archive their own document: t';

  -- The patient still sees them — archiving is tidying, not hiding from
  -- yourself.
  SELECT count(*) INTO v_count FROM public.health_documents WHERE user_id = v_patient;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'the patient lost sight of their own archived documents (saw %)', v_count;
  END IF;
  RAISE NOTICE 'the patient can still see what they archived: t';
  RESET ROLE;

  -- ---------------------------------------------------------------
  -- The clinician's whole-vault grant narrows...
  -- ---------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  PERFORM set_config('request.jwt.claim.email', 'jane.evans@example.com', true);

  SELECT count(*) INTO v_count
    FROM public.health_documents
   WHERE user_id = v_patient AND id = v_archived;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'an archived document was still visible through whole-vault access';
  END IF;
  RAISE NOTICE 'an archived document drops out of whole-vault sharing: t';

  -- ...but a document handed over individually is NOT withdrawn by archiving.
  SELECT count(*) INTO v_count
    FROM public.health_documents
   WHERE user_id = v_patient AND id = v_shared_doc;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'archiving silently revoked a document that was explicitly shared';
  END IF;
  RAISE NOTICE 'archiving does not revoke a file somebody was handed on purpose: t';

  SELECT count(*) INTO v_count FROM public.health_documents WHERE user_id = v_patient;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'clinician saw % documents after archiving, expected 2', v_count;
  END IF;
  RESET ROLE;

  -- ---------------------------------------------------------------
  -- Nothing was destroyed, and it comes back
  -- ---------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);

  UPDATE public.health_documents SET archived_at = NULL, archived_reason = NULL
   WHERE id = v_archived;
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  PERFORM set_config('request.jwt.claim.email', 'jane.evans@example.com', true);
  SELECT count(*) INTO v_count
    FROM public.health_documents WHERE user_id = v_patient AND id = v_archived;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'restoring an archived document did not bring it back';
  END IF;
  RAISE NOTICE 'archiving is reversible: t';
  RESET ROLE;

  -- ---------------------------------------------------------------
  -- The shape of the columns
  -- ---------------------------------------------------------------
  v_failed := false;
  BEGIN
    UPDATE public.health_documents
       SET archived_at = NULL, archived_reason = 'a reason with no archive'
     WHERE id = v_active_doc;
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'a reason was accepted on a document that is not archived';
  END IF;
  RAISE NOTICE 'a reason without an archive date is refused: t';

  v_failed := false;
  BEGIN
    UPDATE public.health_documents
       SET archived_at = now(), archived_reason = repeat('x', 501)
     WHERE id = v_active_doc;
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'a 501-character reason was accepted'; END IF;
  RAISE NOTICE 'an oversized reason is refused: t';

  RAISE NOTICE 'ALL VAULT ARCHIVE TESTS PASSED';
END $$;

ROLLBACK;
