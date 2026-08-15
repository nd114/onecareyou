import { describe, it, expect } from 'vitest';
import { isTenantHost, tenantHostUrl, tenantSlugFromHost } from '@/lib/tenant-host';

describe('tenantSlugFromHost', () => {
  it('resolves a tenant subdomain', () => {
    expect(tenantSlugFromHost('lmc.onecare.you', '')).toBe('lmc');
    expect(tenantSlugFromHost('www.lmc.onecare.you', '')).toBe('lmc');
    expect(tenantSlugFromHost('LMC.OneCare.You', '')).toBe('lmc');
  });

  it('falls back to the marketing site on the apex and reserved subdomains', () => {
    expect(tenantSlugFromHost('onecare.you', '')).toBeNull();
    expect(tenantSlugFromHost('www.onecare.you', '')).toBeNull();
    expect(tenantSlugFromHost('app.onecare.you', '')).toBeNull();
    expect(tenantSlugFromHost('admin.onecare.you', '')).toBeNull();
  });

  it('falls back to the marketing site on unknown hosts', () => {
    expect(tenantSlugFromHost('preview.lovable.app', '')).toBeNull();
    expect(tenantSlugFromHost('', '')).toBeNull();
  });

  it('supports local development subdomains', () => {
    expect(tenantSlugFromHost('lmc.localhost', '')).toBe('lmc');
    expect(tenantSlugFromHost('lmc.localhost:8080', '')).toBe('lmc');
  });

  it('honours the ?tenant override only off production', () => {
    // Preview and local hosts may simulate a tenant address.
    expect(tenantSlugFromHost('preview.lovable.app', '?tenant=lmc')).toBe('lmc');
    expect(tenantSlugFromHost('localhost', '?tenant=lmc')).toBe('lmc');

    // In production the address is the consent signal: arriving through a
    // hospital's own subdomain is what selects the hospital sharing posture,
    // so a query parameter must not be able to stand in for it.
    expect(tenantSlugFromHost('onecare.you', '?tenant=lmc')).toBeNull();
    expect(tenantSlugFromHost('www.onecare.you', '?tenant=lmc')).toBeNull();
  });

  it('does not let the override impersonate another tenant on a real one', () => {
    expect(tenantSlugFromHost('lmc.onecare.you', '?tenant=other')).toBe('lmc');
  });

  it('rejects malformed slugs', () => {
    expect(tenantSlugFromHost('-bad.onecare.you', '')).toBeNull();
    expect(tenantSlugFromHost('a.onecare.you', '')).toBeNull();
    expect(tenantSlugFromHost('localhost', '?tenant=../etc')).toBeNull();
  });

  it('holds the hospital code to 3-7 characters', () => {
    // The identifier a patient reads off a card and types in. Matches
    // set_institution_slug in the database.
    expect(tenantSlugFromHost('ab.onecare.you', '')).toBeNull();
    expect(tenantSlugFromHost('abc.onecare.you', '')).toBe('abc');
    expect(tenantSlugFromHost('abcdefg.onecare.you', '')).toBe('abcdefg');
    expect(tenantSlugFromHost('abcdefgh.onecare.you', '')).toBeNull();
    expect(tenantSlugFromHost('st-marys-clinic.onecare.you', '')).toBeNull();
  });
});

describe('isTenantHost / tenantHostUrl', () => {
  it('reports whether a host resolves a tenant', () => {
    expect(isTenantHost('lmc.onecare.you', '')).toBe(true);
    expect(isTenantHost('onecare.you', '')).toBe(false);
  });

  it('builds the canonical branded address', () => {
    expect(tenantHostUrl('lmc')).toBe('https://lmc.onecare.you/');
    expect(tenantHostUrl('lmc', 'sign-in')).toBe('https://lmc.onecare.you/sign-in');
    expect(tenantHostUrl('lmc', '/sign-in')).toBe('https://lmc.onecare.you/sign-in');
  });
});
