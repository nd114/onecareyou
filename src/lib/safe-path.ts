/**
 * A path this app is willing to send someone to.
 *
 * Sign-in remembers where you were headed and goes there afterwards, and
 * "where you were headed" comes from the URL — which anyone can write. A
 * value like "//evil.com" or "/\evil.com" is a path as far as a router is
 * concerned and a protocol-relative URL as far as a browser is concerned, so
 * a login form that trusts it becomes an open redirect: the attacker sends a
 * link to the real site, the victim signs in for real, and the browser leaves
 * for somewhere else with the session freshly minted.
 *
 * React Router has patched several versions of exactly this — the backslash
 * bypass of CVE-2025-68470 among them. Rather than depend on the router
 * getting every variant right, nothing leaves here that is not one leading
 * slash followed by an ordinary path.
 */
export function safeInternalPath(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;

  const path = value.trim();
  if (!path.startsWith('/')) return fallback;

  // "//host" and "/\host" are both read as protocol-relative by browsers.
  if (path.length > 1 && (path[1] === '/' || path[1] === '\\')) return fallback;

  // A backslash anywhere can be re-read as a separator; no route here has one.
  if (path.includes('\\')) return fallback;

  // Control characters and spaces, which browsers strip before re-parsing.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0020\u007f]/.test(path)) return fallback;

  return path;
}
