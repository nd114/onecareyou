import { describe, it, expect } from 'vitest';
import { pageNameForRoute, pageTitleForRoute, matchesPattern } from '@/lib/page-title';

describe('matchesPattern', () => {
  it('matches a literal path', () => {
    expect(matchesPattern('/settings', '/settings')).toBe(true);
    expect(matchesPattern('/settings', '/setting')).toBe(false);
  });

  it('matches one segment per parameter, and only one', () => {
    expect(matchesPattern('/medications/:id/edit', '/medications/abc/edit')).toBe(true);
    expect(matchesPattern('/medications/:id/edit', '/medications/edit')).toBe(false);
    expect(matchesPattern('/medications/:id/edit', '/medications/a/b/edit')).toBe(false);
  });

  it('ignores trailing slashes', () => {
    expect(matchesPattern('/settings', '/settings/')).toBe(true);
  });
});

describe('pageNameForRoute', () => {
  it('uses the name the navigation already gives a screen', () => {
    expect(pageNameForRoute('/vitals')).toBe('Vitals');
    expect(pageNameForRoute('/health-vault')).toBe('Vault');
    expect(pageNameForRoute('/care-circle')).toBe('Care Circle');
    expect(pageNameForRoute('/clinician/patients')).toBe('All Patients');
  });

  it('names the screens the navigation does not', () => {
    expect(pageNameForRoute('/medications/add')).toBe('Add medication');
    expect(pageNameForRoute('/medications/9f/edit')).toBe('Edit medication');
    expect(pageNameForRoute('/settings')).toBe('Settings');
    expect(pageNameForRoute('/onboarding')).toBe('Set up your account');
    expect(pageNameForRoute('/clinician/settings')).toBe('Settings');
  });

  it('prefers the specific route over the section it sits under', () => {
    // /clinician/patients/import is a real screen; /clinician/patients/:code
    // would otherwise swallow it and call it "Patient".
    expect(pageNameForRoute('/clinician/patients/import')).toBe('Import patients');
    expect(pageNameForRoute('/clinician/patients/AB12CD')).toBe('Patient');
    // …and neither should fall through to the "All Patients" tab.
    expect(pageNameForRoute('/medications/add')).not.toBe('Medications');
  });

  it('leaves routes it does not own alone', () => {
    expect(pageNameForRoute('/pricing')).toBeNull();
    expect(pageNameForRoute('/sign-in')).toBeNull();
    expect(pageNameForRoute('/nothing-here')).toBeNull();
  });
});

describe('pageTitleForRoute', () => {
  it('says which product you are in', () => {
    expect(pageTitleForRoute('/vitals')).toBe('Vitals | OneCare');
    expect(pageTitleForRoute('/clinician/messages')).toBe('Messages | OneCare for Clinicians');
    expect(pageTitleForRoute('/practice')).toBe('Practice admin | OneCare for Clinicians');
    expect(pageTitleForRoute('/admin/import')).toBe('Import | OneCare Admin');
  });

  it('returns null rather than renaming a page that titles itself', () => {
    expect(pageTitleForRoute('/')).toBeNull();
    expect(pageTitleForRoute('/features')).toBeNull();
  });

  it('covers every signed-in screen the review found untitled', () => {
    for (const path of [
      '/dashboard', '/vitals', '/medications', '/medications/add', '/health-vault',
      '/care-circle', '/recordings', '/schedule', '/adherence-report', '/billing',
      '/settings', '/messages', '/guidance',
      '/clinician/today', '/clinician/patients', '/clinician/messages',
      '/clinician/practice', '/clinician/settings', '/clinician/guidance',
    ]) {
      expect(pageTitleForRoute(path), path).not.toBeNull();
    }
  });
});
