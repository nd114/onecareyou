-- Say what `credentials_encrypted` actually is, and give it somewhere to go.
--
-- The column is plain `TEXT`. Nothing writes it encrypted and nothing decrypts
-- it — `scheduled-ehr-sync`, `ehr-export` and `ehr-webhook` each read it and
-- use it directly, each with its own comment saying "in production this would
-- be decrypted". The column name is the only encryption in the system, and a
-- name that claims a protection nobody implemented is worse than a name that
-- does not, because it stops anybody looking.
--
-- This migration does not encrypt anything. Doing that properly is a decision
-- about key management — Supabase Vault, which key, who rotates it, how live
-- connections migrate without an outage — and inventing an answer quietly in a
-- migration would be the same mistake in a new place.
--
-- What it does is make the situation legible and leave the path open:
--
--   * the comment says plainly that the column is not encrypted;
--   * `credentials_vault_id` exists, so moving a connection's secret into
--     Supabase Vault is a data change rather than a schema change;
--   * `supabase/functions/_shared/ehr-credentials.ts` reads the vault id
--     first and warns, naming the connection, whenever it falls back to the
--     plain column — so this shows up in operations rather than only in a
--     comment somebody has to find.

ALTER TABLE public.ehr_connections
  ADD COLUMN IF NOT EXISTS credentials_vault_id UUID;

COMMENT ON COLUMN public.ehr_connections.credentials_encrypted IS
  'NOT ENCRYPTED, despite the name. Plain text, read and used directly by the sync, export and '
  'webhook functions. Kept only until each connection''s secret has been moved into Supabase '
  'Vault and credentials_vault_id set; see docs/ehr-integration-plan.md.';

COMMENT ON COLUMN public.ehr_connections.credentials_vault_id IS
  'Reference to the connection''s secret in Supabase Vault. When set it is used in preference to '
  'credentials_encrypted, and a missing vault secret fails rather than falling back — falling back '
  'would silently undo the migration for that connection.';
