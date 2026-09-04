/**
 * The secret used to talk to a connected EHR.
 *
 * `ehr_connections.credentials_encrypted` is a plain `TEXT` column. Nothing
 * writes it encrypted and nothing decrypts it: three functions read it and use
 * it directly, each carrying its own comment saying "in production this would
 * be decrypted". It never is. The column name is the only encryption in the
 * system.
 *
 * This does not fix that — a real fix is a key-management decision (Supabase
 * Vault, which key, who rotates it, how existing values migrate) and not
 * something to invent quietly in a helper. What it does is make the situation
 * legible and give it one place to change:
 *
 *   - one function reads the secret instead of three;
 *   - the log says plainly that a plaintext credential was used, naming the
 *     connection, so it shows up in operations rather than only in a comment;
 *   - `vaultSecretId` is read first, so the migration path is already wired
 *     and moving a connection across is a data change rather than a code one.
 *
 * See docs/ehr-integration-plan.md for what the real fix requires.
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
