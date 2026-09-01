import { describe, it, expect } from "vitest";
import {
  decodeJwtClaims,
  identityFromClaims,
  identityFromProfile,
  isPlaceholderEmail,
  placeholderEmail,
} from "../../supabase/functions/_shared/kingschat-identity";

/**
 * Build a JWT-shaped string with the given payload. Signature is not read.
 *
 * Encodes UTF-8 bytes before base64, the way a real issuer does — btoa alone
 * throws on anything outside Latin-1, which is exactly the case worth covering.
 */
function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => {
    const bytes = new TextEncoder().encode(JSON.stringify(o));
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  return `${b64({ alg: "RS256", typ: "JWT" })}.${b64(payload)}.c2ln`;
}

describe("decodeJwtClaims", () => {
  it("reads the payload of a well-formed token", () => {
    expect(decodeJwtClaims(jwt({ sub: "kc-123", email: "a@b.test" }))).toMatchObject({
      sub: "kc-123",
      email: "a@b.test",
    });
  });

  it("survives base64url padding, which atob is not always tolerant of", () => {
    // A payload whose length lands on each of the awkward remainders.
    for (const filler of ["a", "ab", "abc", "abcd"]) {
      expect(decodeJwtClaims(jwt({ sub: filler }))).toMatchObject({ sub: filler });
    }
  });

  it("keeps non-ASCII names intact", () => {
    expect(decodeJwtClaims(jwt({ name: "Ọlámidé Adéyẹmí" }))).toMatchObject({
      name: "Ọlámidé Adéyẹmí",
    });
  });

  it("returns null for something that is not a JWT", () => {
    expect(decodeJwtClaims("not-a-token")).toBeNull();
    expect(decodeJwtClaims("")).toBeNull();
    expect(decodeJwtClaims("a.b")).toBeNull();
  });

  it("returns null when the payload is not an object", () => {
    const b64 = (s: string) => btoa(s).replace(/=+$/, "");
    expect(decodeJwtClaims(`${b64("{}")}.${b64('"a string"')}.sig`)).toBeNull();
    expect(decodeJwtClaims(`${b64("{}")}.${b64("[1,2]")}.sig`)).toBeNull();
  });

  it("returns null rather than throwing on undecodable payloads", () => {
    expect(decodeJwtClaims("aaa.!!!!.bbb")).toBeNull();
  });
});

describe("identityFromClaims", () => {
  it("reads the standard OIDC spelling", () => {
    const id = identityFromClaims({ sub: "kc-1", email: "A@B.test", name: "Jane" });
    expect(id).toMatchObject({ subject: "kc-1", email: "a@b.test", name: "Jane" });
  });

  it("finds the subject under other spellings providers use", () => {
    // The claim names are not documented, so several are tried rather than
    // one being assumed and the login failing silently when it is wrong.
    expect(identityFromClaims({ user_id: "kc-2" }).subject).toBe("kc-2");
    expect(identityFromClaims({ userId: "kc-3" }).subject).toBe("kc-3");
    expect(identityFromClaims({ username: "Jane" }).subject).toBe("Jane");
  });

  it("accepts a numeric id", () => {
    expect(identityFromClaims({ id: 12345 }).subject).toBe("12345");
  });

  it("prefers sub over the looser spellings", () => {
    expect(identityFromClaims({ sub: "real", username: "nickname" }).subject).toBe("real");
  });

  it("reports no email when the token carries none, rather than inventing one", () => {
    expect(identityFromClaims({ sub: "kc-1" }).email).toBeNull();
  });

  it("carries every claim through so a first live login is self-diagnosing", () => {
    const id = identityFromClaims({ sub: "kc-1", something_unexpected: "value" });
    expect(id.claims).toMatchObject({ something_unexpected: "value" });
  });

  it("is safe on a token that decoded to nothing", () => {
    expect(identityFromClaims(null)).toMatchObject({ subject: null, email: null, name: null });
  });

  it("ignores a blank claim rather than treating it as a value", () => {
    expect(identityFromClaims({ sub: "   ", user_id: "kc-9" }).subject).toBe("kc-9");
  });
});

describe("placeholderEmail", () => {
  it("is stable for the same subject", () => {
    expect(placeholderEmail("kc-abc")).toBe(placeholderEmail("kc-abc"));
  });

  it("differs between people", () => {
    expect(placeholderEmail("kc-abc")).not.toBe(placeholderEmail("kc-def"));
  });

  it("strips anything that would not survive an address", () => {
    expect(placeholderEmail("a b/c@d")).toMatch(/^kc_abcd@/);
  });

  it("is recognisable afterwards, so it is never mistaken for a real address", () => {
    expect(isPlaceholderEmail(placeholderEmail("kc-abc"))).toBe(true);
    expect(isPlaceholderEmail("someone@gmail.com")).toBe(false);
    expect(isPlaceholderEmail(null)).toBe(false);
  });
});

describe("identityFromProfile", () => {
  const full = {
    profile: {
      id: "user_abc123",
      name: "Jane Doe",
      username: "janedoe",
      email: "Jane@Example.com",
      is_email_verified: true,
    },
  };

  it("reads the documented profile shape", () => {
    expect(identityFromProfile(full)).toMatchObject({
      subject: "user_abc123",
      email: "jane@example.com",
      name: "Jane Doe",
    });
  });

  it("refuses an unverified email", () => {
    // Linking on an unverified address would let anyone set their KingsChat
    // email to a patient's and sign straight into that patient's record.
    const unverified = { profile: { ...full.profile, is_email_verified: false } };
    expect(identityFromProfile(unverified).email).toBeNull();
    expect(identityFromProfile(unverified).subject).toBe("user_abc123");
  });

  it("treats a missing verification flag as unverified", () => {
    const noFlag = { profile: { id: "u1", email: "someone@example.com" } };
    expect(identityFromProfile(noFlag).email).toBeNull();
  });

  it("handles an account with no email set", () => {
    expect(identityFromProfile({ profile: { id: "u1", email: null } }).email).toBeNull();
  });

  it("falls back to the username when there is no id", () => {
    expect(identityFromProfile({ profile: { username: "janedoe" } }).subject).toBe("janedoe");
  });

  it("uses the username as a name when no display name is set", () => {
    expect(identityFromProfile({ profile: { id: "u1", username: "janedoe" } }).name).toBe("janedoe");
  });

  it("is safe on an empty or malformed response", () => {
    expect(identityFromProfile(null)).toMatchObject({ subject: null, email: null });
    expect(identityFromProfile({})).toMatchObject({ subject: null, email: null });
  });
});
