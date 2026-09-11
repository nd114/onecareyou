/**
 * The secret used to talk to a connected EHR.
 *
 * `ehr_connections.credentials_encrypted` is a plain `TEXT` column, and was
 * once the only place a connection's secret lived. As of
 * 20261002000000_ehr_credentials_move_to_vault.sql it no longer is: every
 * connection's secret is moved into Supabase Vault on migration, the
 * database only ever writes it back there
 * (`public.store_ehr_credential_in_vault`, service_role only — the RLS
 * policy on `ehr_connections` is row-level and cannot stop a client from
 * PATCHing this column directly, so a trigger guards it instead), and
 * `credentials_encrypted` is nulled out the moment a connection is migrated.
 *
 * The plain-column branch below stays as a read-side fallback rather than
 * being deleted — for a connection on an environment that has not yet run
 * that migration — and still warns loudly, naming the connection, when it is
 * actually used. On a fully migrated project it should never fire.
 *
 * See docs/ehr-integration-plan.md for the remaining, still-open piece:
 * rotation policy for a bearer token that never expires.
 */

export interface EhrConnectionSecret {
  id: string;
  provider_name?: string | null;
  credentials_encrypted?: string | null;
  /** Set once a connection's secret lives in Supabase Vault. */
  credentials_vault_id?: string | null;
}

export interface ResolvedSecret {
  token: string | null;
  /** True when the value came from the plain column. Worth knowing, and logging. */
  plaintext: boolean;
}

/**
 * Resolve a connection's secret.
 *
 * `fetchVaultSecret` is injected rather than imported so this module stays
 * import-free and testable, and so a caller that has no Vault access simply
 * does not pass one.
 */
export async function resolveEhrSecret(
  connection: EhrConnectionSecret,
  fetchVaultSecret?: (id: string) => Promise<string | null>,
): Promise<ResolvedSecret> {
  if (connection.credentials_vault_id && fetchVaultSecret) {
    const fromVault = await fetchVaultSecret(connection.credentials_vault_id);
    if (fromVault) return { token: fromVault, plaintext: false };
    // Falling through to the plain column would silently undo the migration
    // for that connection, so it does not.
    return { token: null, plaintext: false };
  }

  const raw = connection.credentials_encrypted?.trim();
  if (!raw) return { token: null, plaintext: false };

  console.warn(
    `[ehr] connection ${connection.id} (${connection.provider_name ?? "unnamed"}) is using a ` +
      `plaintext credential from credentials_encrypted. The column name is not accurate: nothing ` +
      `encrypts or decrypts it. Move the secret to Supabase Vault and set credentials_vault_id.`,
  );
  return { token: raw, plaintext: true };
}

/** The Authorization header for a connection, or none when there is no secret. */
export function bearerHeader(secret: ResolvedSecret): Record<string, string> {
  return secret.token ? { Authorization: `Bearer ${secret.token}` } : {};
}
