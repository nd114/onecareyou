import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { publicRoutes, PRIVATE_PREFIXES, ROOT } from '../../scripts/seo/public-routes.mjs';
import { buildSitemap, buildRobots } from '../../scripts/seo/generate-sitemap.mjs';

interface R { path: string; title: string; description: string; file: string }
const routes: R[] = publicRoutes();
const isPrivate = (p: string) =>
  PRIVATE_PREFIXES.some((x: string) => (x.endsWith('/') ? p.startsWith(x) : p === x || p.startsWith(`${x}/`)));

describe('SEO', () => {
  it('public routes contain no app, auth, share or token routes', () => {
    const bad = routes.filter((r) => isPrivate(r.path)).map((r) => r.path);
    expect(bad).toEqual([]);
  });

  it('sitemap.xml on disk matches the generator and has no private URLs', () => {
    const onDisk = readFileSync(path.join(ROOT, 'public/sitemap.xml'), 'utf8');
    expect(onDisk).toBe(buildSitemap());
    const locs = [...onDisk.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    expect(locs.filter(isPrivate)).toEqual([]);
    expect(onDisk).not.toMatch(/token|invite|snapshot/i);
  });

  it('robots.txt is current and blocks share links and app routes', () => {
    const onDisk = readFileSync(path.join(ROOT, 'public/robots.txt'), 'utf8');
    expect(onDisk).toBe(buildRobots());
    expect(onDisk).toContain('Disallow: /s$');
    expect(onDisk).toContain('Disallow: /dashboard');
    expect(onDisk).toContain('User-agent: GPTBot');
  });

  it.each(routes.map((r) => [r.path, r] as const))('%s has a title, description and a page that sets head tags', (_p, r) => {
    expect(r.title.length).toBeGreaterThan(5);
    expect(r.title.length).toBeLessThanOrEqual(70);
    expect(r.description.length).toBeGreaterThan(20);
    expect(r.description.length).toBeLessThanOrEqual(320);
    const f = path.join(ROOT, r.file);
    expect(existsSync(f)).toBe(true);
    const src = readFileSync(f, 'utf8');
    // Data-driven pages (docs, careers) take their head from the shared page component.
    const ok = /SEOHead/.test(src) || r.file.endsWith('docs.ts') || r.file.endsWith('job-listings.ts');
    expect(ok).toBe(true);
  });

  it('share, snapshot and NotFound routes are noindex', () => {
    expect(readFileSync(path.join(ROOT, 'src/pages/SnapshotViewer.tsx'), 'utf8')).toMatch(/noindex/);
    expect(readFileSync(path.join(ROOT, 'src/pages/NotFound.tsx'), 'utf8')).toMatch(/noIndex/);
  });
});
