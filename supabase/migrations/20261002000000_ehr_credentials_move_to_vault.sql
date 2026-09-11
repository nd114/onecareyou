-- Closing what 20260910130000 deliberately left open
--
-- That migration named the problem and stopped short of fixing it, on
-- purpose: "a decision about key management... inventing an answer quietly
-- in a migration would be the same mistake in a new place." The decision was
-- already made in the same breath, though — "Supabase Vault is the obvious
-- answer on this stack" — and docs/ehr-integration-plan.md spells out the
-- three steps this migration now takes.
--
-- What was still open, concretely, and worse than the docs said: RLS on
-- ehr_connections is row-level ("the owning clinician"), not column-level.
-- "Clinicians can update their EHR connections" lets the owner PATCH ANY
-- column on their own row — including credentials_encrypted and
-- credentials_vault_id — whether or not a UI ever offers that field. Nothing
-- in the schema stopped a raw API call from writing a plaintext secret back
-- in, or from repointing credentials_vault_id at an arbitrary id and having
-- a sync function read whatever that id names.

-- ---------------------------------------------------------------------------
-- 0. The store, and a clear failure if it is not there yet
-- ---------------------------------------------------------------------------
-- Deliberately not `CREATE EXTENSION IF NOT EXISTS supabase_vault;` here.
-- Some hosted projects manage extensions from the dashboard rather than a
-- migration role's privileges, and failing on a cryptic
-- "function vault.create_secret does not exist" three sections down is
-- exactly the illegible failure this whole effort is about avoiding.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
    RAISE EXCEPTION 'Supabase Vault is not enabled on this project. Enable it '
      '(Dashboard -> Database -> Extensions -> supabase_vault, or '
      '`create extension if not exists supabase_vault;`), then re-run this migration.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. The only way in: a definer function, not a client column write
-- ---------------------------------------------------------------------------
-- Not granted to authenticated. A client that could set its own
-- credentials_vault_id could point it at any secret's id and have a sync
-- function read that instead of its own — the column is a capability, not
-- data the row's owner should be trusted to assign themselves. Whatever
-- eventually collects a real credential from a clinician does so through an
-- edge function running as service_role, the same shape as every other
-- SECURITY DEFINER boundary in this schema.

CREATE OR REPLACE FUNCTION public.store_ehr_credential_in_vault(_connection_id uuid, _secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $function$
DECLARE
  _vault_id uuid;
BEGIN
  IF _secret IS NULL OR btrim(_secret) = '' THEN
    RAISE EXCEPTION 'A credential cannot be empty';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ehr_connections WHERE id = _connection_id) THEN
    RAISE EXCEPTION 'Connection not found';
  END IF;

  SELECT vault.create_secret(
    _secret,
    'ehr_connection_' || _connection_id::text,
    'EHR credential for connection ' || _connection_id::text
  ) INTO _vault_id;

  -- Announced to the guard trigger below, the same pattern as
  -- withdraw_shared_file()'s onecare.withdrawal flag: definer rights change
  -- the executing role but not the JWT claim, so this function's own write
  -- looks exactly like a client's and checking auth.uid() cannot tell them
  -- apart. Cleared immediately after — set_config's local flag is scoped to
  -- the transaction, not the statement, so leaving it set would disable the
  -- guard for every later write in the same request.
  PERFORM set_config('onecare.ehr_credential_write', 'on', true);
  UPDATE public.ehr_connections
     SET credentials_vault_id = _vault_id,
         credentials_encrypted = NULL,
         updated_at = now()
   WHERE id = _connection_id;
  PERFORM set_config('onecare.ehr_credential_write', 'off', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.store_ehr_credential_in_vault(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_ehr_credential_in_vault(uuid, text) TO service_role;

COMMENT ON FUNCTION public.store_ehr_credential_in_vault(uuid, text) IS
  'The only sanctioned way to set an EHR connection''s secret. service_role only — called from an edge function, never from the client directly — because the alternative is a clinician''s browser holding the plaintext credential even briefly on its way to Vault.';

-- ---------------------------------------------------------------------------
-- 2. Nobody else may move these two columns
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_ehr_credential_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Migrations and the seed have no actor at all.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF current_setting('onecare.ehr_credential_write', true) = 'on' THEN
    RETURN NEW;
  END IF;

  NEW.credentials_encrypted := OLD.credentials_encrypted;
  NEW.credentials_vault_id := OLD.credentials_vault_id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_ehr_credential_columns ON public.ehr_connections;
CREATE TRIGGER trg_guard_ehr_credential_columns
BEFORE UPDATE ON public.ehr_connections
FOR EACH ROW EXECUTE FUNCTION public.guard_ehr_credential_columns();

COMMENT ON FUNCTION public.guard_ehr_credential_columns() IS
  'A connection''s secret is set by store_ehr_credential_in_vault() and by nothing else. Reverts credentials_encrypted and credentials_vault_id silently for any client write, the same shape as guard_attachment_withdrawal_columns().';

-- ---------------------------------------------------------------------------
-- 3. Whatever is sitting in the plain column today moves now
-- ---------------------------------------------------------------------------
-- Runs inside this migration rather than waiting on an operator to trigger
-- it by hand: a step that depends on someone remembering to run it later is
-- the same failure mode that left this column unencrypted in the first
-- place. credentials_encrypted is not dropped here — once every row here has
-- a vault id (this loop's own postcondition) the column is dead, and
-- dropping it is a separate, deliberate step for whoever confirms that on
-- the actual hosted project.

DO $$
DECLARE
  _rec record;
BEGIN
  FOR _rec IN
    SELECT id, credentials_encrypted FROM public.ehr_connections
     WHERE credentials_vault_id IS NULL
       AND credentials_encrypted IS NOT NULL
       AND btrim(credentials_encrypted) <> ''
  LOOP
    PERFORM public.store_ehr_credential_in_vault(_rec.id, _rec.credentials_encrypted);
  END LOOP;
END $$;
