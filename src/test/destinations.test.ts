import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildDestinations,
  destinationPath,
  recentDestinations,
} from '@/lib/destinations';
import { searchItems } from '@/lib/search';
import { clinicianSettingsTab, patientSettingsTab } from '@/lib/settings-tabs';
import { PRACTICE_SECTIONS, type PracticeContext } from '@/lib/practice-sections';
import { CLINICIAN_PILLARS, navTargets } from '@/lib/nav-ia';

const allow = (...granted: string[]) => (c: string) => granted.includes(c);
const everything = () => true;

const owner: PracticeContext = {
  hasPractice: true,
  isHospital: true,
  isAdmin: true,
  canManageTeam: true,
  canManageBilling: true,
  canManageSettings: true,
  canRoutePatients: true,
};
const solo: PracticeContext = {
  hasPractice: false,
  isHospital: false,
  isAdmin: false,
  canManageTeam: false,
};

// The router, read from source: a destination not declared here is a link to
// the NotFound page.
const appSource = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
const routePatterns = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);
const routeExists = (path: string) =>
  routePatterns.some((pattern) => {
    const re = new RegExp('^' + pattern.replace(/:[^/]+/g, '[^/]+').replace(/\*/g, '.*') + '$');
    return re.test(path);
  });

type Dests = ReturnType<typeof buildDestinations>;
const find = (list: Dests, query: string) =>
  searchItems(list, query, (d) => [d.label, ...d.keywords, d.group]).map((m) => m.item.to);

describe('destination index', () => {
  it('has no dead links: every destination path is a declared route', () => {
    const all = [
      ...buildDestinations({ audience: 'patient' }),
      ...buildDestinations({ audience: 'clinician', can: everything, practice: owner }),
    ];
    expect(all.length).toBeGreaterThan(20);
    for (const d of all) {
      expect(routeExists(destinationPath(d)), `${d.to} is not in App.tsx`).toBe(true);
    }
  });

  it('is built from the navigation: every nav page a member can open is a destination', () => {
    const can = allow('view_phi', 'manage_billing');
    const navPaths = navTargets(CLINICIAN_PILLARS, can).map((t) => t.to);
    const offered = buildDestinations({ audience: 'clinician', can }).map((d) => d.to);
    for (const to of navPaths) expect(offered).toContain(to);
  });

  it('never offers a page whose capability the clinician lacks', () => {
    const none = buildDestinations({ audience: 'clinician', can: () => false }).map((d) => d.to);
    for (const tab of CLINICIAN_PILLARS.flatMap((p) => p.tabs).filter((t) => t.capability)) {
      expect(none).not.toContain(tab.to);
    }
    expect(none).not.toContain('/clinician/invoices');
  });

  it('shows invoices to billing staff and withholds clinical pages from them', () => {
    const clerk = buildDestinations({ audience: 'clinician', can: allow('manage_billing') }).map((d) => d.to);
    expect(clerk).toContain('/clinician/invoices');
    expect(clerk).not.toContain('/clinician/guidance');
    expect(clerk).not.toContain('/clinician/scribe');
  });

  it('offers practice sections only as the practice hub does', () => {
    const solos = buildDestinations({ audience: 'clinician', can: everything, practice: solo }).map((d) => d.to);
    const owners = buildDestinations({ audience: 'clinician', can: everything, practice: owner }).map((d) => d.to);
    for (const section of PRACTICE_SECTIONS) expect(owners).toContain(section.path);
    expect(solos).not.toContain('/clinician/practice/people');
    expect(solos).not.toContain('/clinician/practice/details');
    expect(solos).not.toContain('/clinician/practice/account');
    // Without a context at all, nothing is guessed.
    const unknown = buildDestinations({ audience: 'clinician', can: everything }).map((d) => d.to);
    expect(unknown.some((to) => to.startsWith('/clinician/practice/'))).toBe(false);
  });

  it('keeps audiences apart', () => {
    const patient = buildDestinations({ audience: 'patient' }).map((d) => d.to);
    const clinician = buildDestinations({ audience: 'clinician', can: everything, practice: owner }).map((d) => d.to);
    expect(patient.some((to) => to.startsWith('/clinician'))).toBe(false);
    expect(clinician.some((to) => to === '/settings' || to.startsWith('/settings?'))).toBe(false);
    expect(clinician).toContain('/clinician/settings');
  });

  it('finds settings and sections inside it, by name and by synonym', () => {
    const clinician = buildDestinations({ audience: 'clinician', can: everything, practice: owner });
    expect(find(clinician, 'settings')[0]).toBe('/clinician/settings');
    expect(find(clinician, 'notification preferences')[0]).toBe('/clinician/settings?section=notifications');
    expect(find(clinician, 'dark mode')).toContain('/clinician/settings?section=appearance');
    expect(find(clinician, 'team')).toContain('/clinician/practice/people');
    expect(find(clinician, 'billing')).toEqual(
      expect.arrayContaining(['/clinician/invoices', '/clinician/practice/plan']),
    );
    expect(find(clinician, 'alert rules')[0]).toBe('/clinician/alerts');
    for (const query of ['manage account', 'seats', 'add-ons', 'partner', 'scribe minutes']) {
      expect(find(clinician, query), query).toContain('/clinician/practice/account');
    }

    const patient = buildDestinations({ audience: 'patient' });
    expect(find(patient, 'units')[0]).toBe('/settings?section=units');
    expect(find(patient, 'billing')).toContain('/billing');
    expect(find(patient, 'blood pressure')[0]).toBe('/vitals');
  });

  it('every settings deep link lands on a real tab', () => {
    const tabsOf = (list: Dests, resolveTab: (s: string, h: string) => string) =>
      list
        .filter((d) => d.to.includes('?section='))
        .map((d) => resolveTab('?' + d.to.split('?')[1], ''));
    const patient = tabsOf(buildDestinations({ audience: 'patient' }), patientSettingsTab);
    const clinician = tabsOf(buildDestinations({ audience: 'clinician', can: everything }), clinicianSettingsTab);
    expect(new Set(patient)).toEqual(new Set(['account', 'care', 'privacy', 'prefs']));
    expect(new Set(clinician)).toEqual(new Set(['account', 'privacy', 'prefs']));
  });

  it('settings tab resolution accepts hash and query, and defaults to account', () => {
    expect(patientSettingsTab('', '#sharing-history')).toBe('privacy');
    expect(patientSettingsTab('?section=notifications', '')).toBe('prefs');
    expect(patientSettingsTab('?section=nonsense', '')).toBe('account');
    expect(clinicianSettingsTab('?section=appearance', '')).toBe('prefs');
    expect(clinicianSettingsTab('', '')).toBe('account');
  });

  it('recents are resolved against what is offered now', () => {
    const offered = buildDestinations({ audience: 'clinician', can: () => false });
    const recents = recentDestinations(offered, ['/clinician/invoices', '/clinician/settings', '/gone']);
    expect(recents.map((d) => d.to)).toEqual(['/clinician/settings']);
  });
});
