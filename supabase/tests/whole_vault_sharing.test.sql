-- Whole-vault sharing on the private pathway.
--
-- The invite picker offered vitals, medications, adherence and profile but said
-- nothing about documents: those were shareable only one at a time. This adds
-- the other option — the patient who wants their doctor to have the whole file
-- cabinet — without loosening the default, which stays per-document.
--
-- These assert the boundary in both directions: the permission grants exactly
-- the vault it should, and grants nothing when it is off, ended, or belongs to
-- someone else.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/whole_vault_sharing.test.sql

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(_condition boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _condition IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', _label; END IF;
  RAISE NOTICE '  ok — %', _label;
END;
$$;

DO $$
DECLARE
  _patient  uuid := 'f1000000-0000-0000-0000-000000000001';
  _other    uuid := 'f1000000-0000-0000-0000-000000000002';
  _vaultdoc uuid := 'f1000000-0000-0000-0000-000000000003';  -- has whole-vault access
  _limited  uuid := 'f1000000-0000-0000-0000-000000000004';  -- per-document only
  _share_v  uuid;
  _share_l  uuid;
  _doc_a    uuid;
  _doc_b    uuid;
  _count integer;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_patient,'wv-patient@test.local'), (_other,'wv-other@test.local'),
    (_vaultdoc,'wv-vault@test.local'), (_limited,'wv-limited@test.local');

  -- Two documents in the patient's vault.
  INSERT INTO public.health_documents
    (user_id, file_path, file_name, file_size, mime_type, title, category)
  VALUES (_patient, _patient || '/a.pdf', 'a.pdf', 10, 'application/pdf', 'Lipid panel', 'lab_result')
  RETURNING id INTO _doc_a;
  INSERT INTO public.health_documents
    (user_id, file_path, file_name, file_size, mime_type, title, category)
  VALUES (_patient, _patient || '/b.pdf', 'b.pdf', 10, 'application/pdf', 'Discharge summary', 'discharge_summary')
  RETURNING id INTO _doc_b;

  -- One clinician granted the whole vault, one granted nothing of the sort.
  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES (_patient, _vaultdoc, 'Dr Vault', 'wv-vault@test.local', 'wvvault',
          '{"vitals":true,"meds":true,"adherence":false,"profile":false,"documents":true}'::jsonb, true)
  RETURNING id INTO _share_v;

  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES (_patient, _limited, 'Dr Limited', 'wv-limited@test.local', 'wvlim',
          '{"vitals":true,"meds":true,"adherence":false,"profile":false,"documents":false}'::jsonb, true)
  RETURNING id INTO _share_l;

  -- ==========================================================================
  -- 1. Whole-vault access reaches every document
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _vaultdoc::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.health_documents WHERE user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 2, 'whole-vault access reaches every document in the vault');

  -- ==========================================================================
  -- 2. Without the permission, nothing — the default is unchanged
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _limited::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.health_documents WHERE user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'a clinician without the permission sees no documents');

  -- ==========================================================================
  -- 3. Per-document sharing still works for that clinician
  -- ==========================================================================
  INSERT INTO public.document_shares (document_id, user_id, provider_share_id, is_active)
  VALUES (_doc_a, _patient, _share_l, true);

  PERFORM set_config('request.jwt.claim.sub', _limited::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.health_documents WHERE user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1,
    'per-document sharing still grants exactly the document that was shared');

  -- ==========================================================================
  -- 4. A document added later is included — that is what "whole vault" means
  -- ==========================================================================
  INSERT INTO public.health_documents
    (user_id, file_path, file_name, file_size, mime_type, title, category)
  VALUES (_patient, _patient || '/c.pdf', 'c.pdf', 10, 'application/pdf', 'New referral', 'referral');

  PERFORM set_config('request.jwt.claim.sub', _vaultdoc::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.health_documents WHERE user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 3, 'a document added after the grant is included');

  -- ==========================================================================
  -- 5. Turning the permission off takes the vault back
  -- ==========================================================================
  -- As the patient: consent-bearing columns are pinned against anyone else by
  -- guard_provider_share_consent, so this is the only caller who can do it.
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  UPDATE public.provider_shares
     SET permissions = permissions || '{"documents":false}'::jsonb
   WHERE id = _share_v;

  PERFORM set_config('request.jwt.claim.sub', _vaultdoc::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.health_documents WHERE user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'switching the permission off ends vault access at once');

  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  UPDATE public.provider_shares
     SET permissions = permissions || '{"documents":true}'::jsonb
   WHERE id = _share_v;

  -- ==========================================================================
  -- 6. Ending the share ends it too
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  UPDATE public.provider_shares SET is_active = false WHERE id = _share_v;

  PERFORM set_config('request.jwt.claim.sub', _vaultdoc::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.health_documents WHERE user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'revoking the share ends vault access');

  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  UPDATE public.provider_shares SET is_active = true WHERE id = _share_v;

  -- ==========================================================================
  -- 7. It grants nothing about anyone else's vault
  -- ==========================================================================
  INSERT INTO public.health_documents
    (user_id, file_path, file_name, file_size, mime_type, title, category)
  VALUES (_other, _other || '/x.pdf', 'x.pdf', 10, 'application/pdf', 'Someone else', 'other');

  PERFORM set_config('request.jwt.claim.sub', _vaultdoc::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.health_documents WHERE user_id = _other;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0,
    'whole-vault access to one patient grants nothing about another');

  -- ==========================================================================
  -- 8. The patient keeps their own vault throughout
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.health_documents WHERE user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 3, 'the patient still sees their own documents');

  -- ==========================================================================
  -- 9. The clinician cannot grant themselves the vault
  --    guard_provider_share_consent pins permissions against anyone but the
  --    patient. Without it, whole-vault access would be self-serve.
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _limited::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.provider_shares
     SET permissions = permissions || '{"documents":true}'::jsonb
   WHERE id = _share_l;
  EXECUTE 'SET LOCAL ROLE postgres';

  PERFORM set_config('request.jwt.claim.sub', _limited::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.health_documents WHERE user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1,
    'a clinician cannot grant themselves the whole vault — still just the one shared document');

  RAISE NOTICE 'ALL WHOLE VAULT SHARING TESTS PASSED';
END $$;

ROLLBACK;
