/**
 * Reading who a KingsChat access token belongs to.
 *
 * The previous attempt asked two guessed profile endpoints — neither appears in
 * KingsChat's documentation — and gave up when they 404'd. What the docs do say
 * is that access tokens are RS256-signed JWTs, which means the identity is
 * already in the token: no second round trip, nothing to guess.
 *
 * These are pure functions with no Deno APIs so they can be unit-tested
 * directly. Signature verification belongs in the edge function, which has the
 * network; this file only reads what is inside.
 */

export interface KingsChatClaims {
  [key: string]: unknown;
}

export interface KingsChatIdentity {
  /** Stable id for this person at KingsChat. Null when no claim looks like one. */
  subject: string | null;
  /** Verified email, when the token carries one. Often it will not. */
  email: string | null;
  /** Display name, when the token carries one. */
  name: string | null;
  /** Every claim, so a first real login tells us what we are actually given. */
  claims: KingsChatClaims;
}

/** base64url -> string, without assuming atob's padding tolerance. */
function decodeSegment(segment: string): string {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  // The payload is UTF-8; going through bytes keeps non-ASCII names intact.
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * The claims inside a JWT, or null if it is not one.
 *
 * Deliberately does not verify the signature — the caller does that, and
 * conflating "what does this say" with "should I believe it" is how an
 * unverified token ends up trusted.
 */
export function decodeJwtClaims(token: string): KingsChatClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const parsed = JSON.parse(decodeSegment(parts[1]));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as KingsChatClaims;
  } catch {
    return null;
  }
}

/** Claim names that have meant "this person", across OAuth providers and versions. */
const SUBJECT_CLAIMS = ["sub", "user_id", "userId", "uid", "id", "username", "user_name"];
const EMAIL_CLAIMS = ["email", "email_address", "emailAddress"];
const NAME_CLAIMS = ["name", "full_name", "fullName", "display_name", "displayName", "username"];

function firstString(claims: KingsChatClaims, keys: string[]): string | null {
  for (const key of keys) {
    const value = claims[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    // Some providers wrap the number; a numeric id is still an id.
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

/**
 * What we can say about the holder of this token.
 *
 * The claim names are unknown until a real token arrives, so several plausible
 * spellings are tried rather than one being assumed correct. Every claim is
 * carried through in `claims` so the first live login is self-diagnosing — the
 * callback logs the key names (never the values) and the linking rule can then
 * be written against what KingsChat actually sends.
 */
export function identityFromClaims(claims: KingsChatClaims | null): KingsChatIdentity {
  if (!claims) return { subject: null, email: null, name: null, claims: {} };

  const email = firstString(claims, EMAIL_CLAIMS);
  return {
    subject: firstString(claims, SUBJECT_CLAIMS),
    email: email ? email.toLowerCase() : null,
    name: firstString(claims, NAME_CLAIMS),
    claims,
  };
}

/**
 * A placeholder address for someone KingsChat gave us no email for.
 *
 * Supabase requires an email to create a user. Anchoring it to the KingsChat
 * subject makes it stable across logins, and the domain is one we control and
 * never send mail to, so it cannot collide with a real address or quietly
 * become a channel we think works.
 */
export function placeholderEmail(subject: string): string {
  const safe = subject.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64).toLowerCase();
  return `kc_${safe}@kingschat.users.onecare.you`;
}

/** True when an address is one of ours rather than something the person gave us. */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith("@kingschat.users.onecare.you");
}
