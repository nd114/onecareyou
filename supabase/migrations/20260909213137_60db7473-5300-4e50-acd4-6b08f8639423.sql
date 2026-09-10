ALTER TABLE public.ehr_connections
  ADD COLUMN IF NOT EXISTS credentials_vault_id UUID;

COMMENT ON COLUMN public.ehr_connections.credentials_encrypted IS
  'NOT ENCRYPTED, despite the name. Plain text, read and used directly by the sync, export and '
  'webhook functions. Kept only until each connection''s secret has been moved into Supabase '
  'Vault and credentials_vault_id set; see docs/ehr-integration-plan.md.';

COMMENT ON COLUMN public.ehr_connections.credentials_vault_id IS
  'Reference to the connection''s secret in Supabase Vault. When set it is used in preference to '
  'credentials_encrypted, and a missing vault secret fails rather than falling back.';