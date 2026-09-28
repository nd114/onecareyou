/**
 * Where the KingsChat callback may send the browser that approved a login.
 *
 * The callback mints a completion code and hands it to the approving browser by
 * redirecting it back to the OneCare origin recorded when the login began. That
 * origin was chosen by whoever began the login, so it is untrusted: if it could
 * name any site, an attacker would begin a login with their own site as the
 * return address, send the link to a victim, and read the completion code off
 * the victim's redirect. So it must be one of ours.
 *
 * Ours means onecare.you and its tenant subdomains over https, plus exact
 * origins listed in KINGSCHAT_RETURN_ORIGINS (local development, previews).
 * Never a wildcard on a shared host such as a preview platform, where anyone
 * can publish a page.
 *
 * Pure functions with no Deno APIs, so they can be unit-tested directly.
 */

const PRODUCTION_DOMAIN = "onecare.you";

/** Path of the page in the app that finishes the login. */
export const KINGSCHAT_COMPLETE_PATH = "/auth/kingschat/complete";

/** Parse a comma-separated list of exact origins, dropping anything malformed. */
export function parseExtraOrigins(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => normaliseOrigin(s) === s);
}

/** The origin in canonical form, or null when the value is not a bare origin. */
export function normaliseOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  // A bare origin only: `new URL` would happily accept a path, query or fragment.
  if (`${url.protocol}//${url.host}` !== value.toLowerCase()) return null;
  return url.origin;
}

export function isAllowedReturnOrigin(
  value: string | null | undefined,
  extraOrigins: readonly string[] = [],
): boolean {
  const origin = normaliseOrigin(value);
  if (!origin) return false;
  if (extraOrigins.includes(origin)) return true;

  const url = new URL(origin);
  if (url.protocol !== "https:" || url.port !== "") return false;
  const host = url.hostname;
  return host === PRODUCTION_DOMAIN || host.endsWith(`.${PRODUCTION_DOMAIN}`);
}

/**
 * The page the approving browser is sent to. Everything rides in the fragment,
 * which browsers never send to a server or put in a Referer.
 */
export function completionUrl(origin: string, nonce: string, code?: string | null): string {
  const params = new URLSearchParams({ n: nonce });
  if (code) params.set("c", code);
  return `${origin}${KINGSCHAT_COMPLETE_PATH}#${params.toString()}`;
}
