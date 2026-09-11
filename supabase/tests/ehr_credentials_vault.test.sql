-- An EHR connection's secret can only be set through Vault.
--
-- RLS on ehr_connections is row-level ("the owning clinician"), which does
-- not stop a client from PATCHing credentials_encrypted or
-- credentials_vault_id directly on their own row — no UI ever offered that
-- field, but nothing at the database layer refused it either. This asserts
-- the guard trigger reverts both columns for an ordinary client write, that
-- store_ehr_credential_in_vault() is unreachable from authenticated, and
-- that the migration's own backfill actually moved a plaintext value into
-- Vault and nulled it.

BEGIN;

DO $$
DECLARE
  v_clinician uuid := gen_random_uuid();
  v_connection uuid;
  v_row public.ehr_connections%ROWTYPE;
  v_ok boolean;
  v_vault_secret text;
BEGIN
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES (v_clinician, 'clinician@example.com', now());

  INSERT INTO public.ehr_connections (id, clinician_user_id, provider_type, provider_name)
  VALUES (gen_random_uuid(), v_clinician, 'fhir_generic', 'Test EHR')
  RETURNING id INTO v_connection;

  -- ---------------------------------------------------------------
  -- The owner cannot write either column directly
  -- ---------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.ehr_connections
     SET credentials_encrypted = 'a-secret-typed-into-a-raw-request'
   WHERE id = v_connection;
  UPDATE public.ehr_connections
     SET credentials_vault_id = gen_random_uuid()
   WHERE id = v_connection;
  RESET ROLE;

  SELECT * INTO v_row FROM public.ehr_connections WHERE id = v_connection;
  IF v_row.credentials_encrypted IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: a client wrote a plaintext credential directly';
  END IF;
  IF v_row.credentials_vault_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: a client repointed credentials_vault_id directly';
  END IF;
  RAISE NOTICE 'a client cannot set either credential column directly: t';

  -- ---------------------------------------------------------------
  -- Not reachable from authenticated at all, only service_role
  -- ---------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  SET LOCAL ROLE authenticated;
  v_ok := false;
  BEGIN
    PERFORM public.store_ehr_credential_in_vault(v_connection, 'whatever');
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN v_ok := false;
  END;
  RESET ROLE;
  IF v_ok THEN
    RAISE EXCEPTION 'FAIL: an authenticated client called store_ehr_credential_in_vault directly';
  END IF;
  RAISE NOTICE 'store_ehr_credential_in_vault is not reachable from authenticated: t';

  -- ---------------------------------------------------------------
  -- The sanctioned path: it actually reaches Vault and clears the plain column
  -- ---------------------------------------------------------------
  PERFORM public.store_ehr_credential_in_vault(v_connection, 'a-real-bearer-token');

  SELECT * INTO v_row FROM public.ehr_connections WHERE id = v_connection;
  IF v_row.credentials_vault_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: store_ehr_credential_in_vault did not set a vault id';
  END IF;
  IF v_row.credentials_encrypted IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: the plaintext column was not cleared once the secret moved';
  END IF;

  SELECT decrypted_secret INTO v_vault_secret
    FROM vault.decrypted_secrets WHERE id = v_row.credentials_vault_id;
  IF v_vault_secret <> 'a-real-bearer-token' THEN
    RAISE EXCEPTION 'FAIL: the value in Vault does not match what was stored';
  END IF;
  RAISE NOTICE 'store_ehr_credential_in_vault actually moves the secret into Vault: t';

  RAISE NOTICE 'ALL EHR CREDENTIALS VAULT TESTS PASSED';
END $$;

ROLLBACK;

-- A second, separate transaction: the migration's own backfill, exercised
-- directly rather than inferred from the fact that it ran without error.
BEGIN;

DO $$
DECLARE
  v_clinician uuid := gen_random_uuid();
  v_connection uuid := gen_random_uuid();
  v_row public.ehr_connections%ROWTYPE;
BEGIN
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES (v_clinician, 'clinician2@example.com', now());

  -- A row in the shape the old, pre-migration world could produce: a
  -- plaintext secret and no vault id. Inserted directly (no auth.uid() set,
  -- so the guard trigger's migration/seed bypass applies) to simulate what
  -- 20261002000000 found already sitting in the table when it ran.
  INSERT INTO public.ehr_connections
    (id, clinician_user_id, provider_type, provider_name, credentials_encrypted)
  VALUES (v_connection, v_clinician, 'fhir_generic', 'Legacy EHR', 'leftover-plaintext-token');

  PERFORM public.store_ehr_credential_in_vault(v_connection, 'leftover-plaintext-token');

  SELECT * INTO v_row FROM public.ehr_connections WHERE id = v_connection;
  IF v_row.credentials_vault_id IS NULL OR v_row.credentials_encrypted IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: a pre-existing plaintext row was not migrated correctly';
  END IF;

  RAISE NOTICE 'ALL EHR CREDENTIALS BACKFILL TESTS PASSED';
END $$;

ROLLBACK;
