/**
 * Hostname-based tenant resolution.
 *
 * Production uses wildcard DNS (*.onecare.you) behind a reverse proxy/CDN, so
 * every request arrives at the same app bundle. We extract the subdomain from
 * window.location.hostname, and the tenant is then resolved from the database
 * (see useInstitutionBranding -> public_institution_by_slug).
 *
 * Supported shapes:
 *   lmc.onecare.you            -> "lmc"
 *   www.lmc.onecare.you        -> "lmc"
 *   lmc.localhost:8080         -> "lmc"   (local testing)
 *   ?tenant=lmc                -> "lmc"   (preview/dev override)
 *   onecare.you / www.onecare.you / *.lovable.app -> null (marketing site)
 */

/** Apex domains that host tenant subdomains. */
const TENANT_BASE_DOMAINS = ['onecare.you', 'localhost'];

/** Subdomains that are never tenants. */
const RESERVED_SUBDOMAINS = new Set([
  'www',
  'app',
  'api',
  'admin',
  'staging',
  'preview',
  'id-preview',
  'onecare',
  'mail',
  'cdn',
  'assets',
]);

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,31}$/.test(slug);
}

/**
 * Extracts the tenant slug from a hostname, or null when the host is the
 * marketing site / a preview host.
 */
export function tenantSlugFromHost(
  host: string = typeof window !== 'undefined' ? window.location.hostname : '',
  search: string = typeof window !== 'undefined' ? window.location.search : '',
): string | null {
  // Dev/preview override: ?tenant=lmc — lets us exercise branded intake on
  // hosts that can't carry a wildcard subdomain (e.g. Lovable previews).
  if (search) {
    const override = new URLSearchParams(search).get('tenant');
    if (override && isValidSlug(override.toLowerCase())) return override.toLowerCase();
  }

  const hostname = (host || '').toLowerCase().split(':')[0].replace(/\.$/, '');
  if (!hostname) return null;

  const base = TENANT_BASE_DOMAINS.find(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
  if (!base) return null; // unknown host (e.g. *.lovable.app) -> marketing site

  const prefix = hostname.slice(0, Math.max(0, hostname.length - base.length - 1));
  if (!prefix) return null; // apex domain

  const labels = prefix.split('.').filter(Boolean);
  // Allow an optional leading "www." in front of the tenant label.
  const slug = labels[0] === 'www' ? labels[1] : labels[0];
  if (!slug || RESERVED_SUBDOMAINS.has(slug) || !isValidSlug(slug)) return null;
  return slug;
}

/** True when the current request is being served on a tenant subdomain. */
export function isTenantHost(host?: string, search?: string): boolean {
  return tenantSlugFromHost(host, search) !== null;
}

/** Canonical branded address for a tenant, e.g. https://lmc.onecare.you */
export function tenantHostUrl(slug: string, path = '/'): string {
  return `https://${slug}.onecare.you${path.startsWith('/') ? path : `/${path}`}`;
}
