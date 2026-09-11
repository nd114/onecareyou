import { describe, expect, it, vi } from "vitest";

import {
  bearerHeader,
  resolveEhrSecret,
} from "../../supabase/functions/_shared/ehr-credentials";

/**
 * `ehr_connections.credentials_encrypted` is plain TEXT and used to be the
 * only place a connection's secret lived. Every connection is now moved into
 * Supabase Vault on migration (store_ehr_credential_in_vault, service_role
 * only — see 20261002000000_ehr_credentials_move_to_vault.sql), so this
 * module's plain-column branch is a read-side fallback for an environment
 * that has not migrated yet, not the steady state. These assertions hold
 * that shape either way: vault preferred, no silent fallback on a failed
 * vault read, and a loud warning naming the connection on the rare path that
 * still uses the plain column.
 */
const connection = {
  id: "conn-1",
  provider_name: "City General",
  credentials_encrypted: "plain-token",
};

describe("resolving a connection's secret", () => {
  it("prefers the vault when a connection has been migrated", async () => {
    const fromVault = vi.fn().mockResolvedValue("vault-token");
    const secret = await resolveEhrSecret(
      { ...connection, credentials_vault_id: "vault-1" },
      fromVault,
    );
    expect(secret).toEqual({ token: "vault-token", plaintext: false });
    expect(fromVault).toHaveBeenCalledWith("vault-1");
  });

  it("does not fall back to the plain column when the vault lookup fails", async () => {
    // Falling back would silently undo the migration for that connection, and
    // the whole point of moving a secret is that the old copy stops being used.
    const secret = await resolveEhrSecret(
      { ...connection, credentials_vault_id: "vault-1" },
      vi.fn().mockResolvedValue(null),
    );
    expect(secret.token).toBeNull();
  });

  it("uses the plain column when there is nothing else, and says so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const secret = await resolveEhrSecret(connection);
    expect(secret).toEqual({ token: "plain-token", plaintext: true });

    // Named, so it shows up in operations rather than only in a comment.
    const message = warn.mock.calls[0]?.[0] as string;
    expect(message).toContain("conn-1");
    expect(message).toContain("City General");
    expect(message).toMatch(/not accurate|plaintext/i);
    warn.mockRestore();
  });

  it("reports no secret rather than an empty bearer", async () => {
    // `Authorization: Bearer ` is a header that looks like credentials and is
    // not, so a server rejects it with something less clear than no header.
    for (const value of [undefined, null, "", "   "]) {
      const secret = await resolveEhrSecret({ id: "c", credentials_encrypted: value as never });
      expect(secret.token).toBeNull();
      expect(bearerHeader(secret)).toEqual({});
    }
  });

  it("builds the header only when there is something to put in it", () => {
    expect(bearerHeader({ token: "abc", plaintext: true })).toEqual({
      Authorization: "Bearer abc",
    });
    expect(bearerHeader({ token: null, plaintext: false })).toEqual({});
  });
});
