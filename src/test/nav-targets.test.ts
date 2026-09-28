import { describe, it, expect } from 'vitest';
import { CLINICIAN_PILLARS, PATIENT_PILLARS, navTargets } from '@/lib/nav-ia';

/**
 * What search is allowed to offer.
 *
 * Search reaches pages by name rather than by clicking through to them, so it
 * is a second way in. If it drew on its own list of routes, that list would
 * eventually include something the navigation hides — and a role would have a
 * shortcut around itself. These cover the rule that stops that: the same
 * pillars, filtered by the same capability check.
 */

const allow = (...granted: string[]) => (capability: string) => granted.includes(capability);
const allowAll = () => true;
const allowNothing = () => false;

describe('navTargets', () => {
  it('offers a clinician with every capability more than one with none', () => {
    const full = navTargets(CLINICIAN_PILLARS, allowAll);
    const bare = navTargets(CLINICIAN_PILLARS, allowNothing);
    expect(full.length).toBeGreaterThan(bare.length);
  });

  it('never offers a page whose capability the member lacks', () => {
    // Every tab carrying a capability requirement, across every pillar.
    const gated = CLINICIAN_PILLARS.flatMap((pillar) =>
      pillar.tabs.filter((tab) => tab.capability),
    );
    expect(gated.length).toBeGreaterThan(0);

    const offered = navTargets(CLINICIAN_PILLARS, allowNothing).map((target) => target.to);
    for (const tab of gated) {
      expect(offered).not.toContain(tab.to);
    }
  });

  it('withholds clinical pages from a billing clerk but keeps billing ones', () => {
    // The role the capability field was written for: a clerk who should reach
    // Invoices and not Guidance.
    const offered = navTargets(CLINICIAN_PILLARS, allow('manage_billing')).map((t) => t.to);
    expect(offered).toContain('/clinician/invoices');
    expect(offered).not.toContain('/clinician/guidance');
    expect(offered).not.toContain('/clinician/scribe');
  });

  it('keeps ungated pages available to everyone in a practice', () => {
    const offered = navTargets(CLINICIAN_PILLARS, allowNothing).map((t) => t.to);
    expect(offered).toContain('/clinician/today');
    expect(offered).toContain('/clinician/patients');
  });

  it('tags each page with the pillar it sits under, so a result reads in context', () => {
    const invoices = navTargets(CLINICIAN_PILLARS, allowAll).find(
      (t) => t.to === '/clinician/invoices',
    );
    expect(invoices).toMatchObject({ label: 'Invoices', group: 'Practice' });
  });

  it('offers a patient their own pillars without asking about capabilities', () => {
    // Patient tabs carry no capability requirement, so the two must agree.
    const withNothing = navTargets(PATIENT_PILLARS, allowNothing);
    const withEverything = navTargets(PATIENT_PILLARS, allowAll);
    expect(withNothing).toEqual(withEverything);
    expect(withNothing.map((t) => t.to)).toContain('/health-vault');
  });

  it('produces no duplicate routes, so one page is one result', () => {
    const routes = navTargets(CLINICIAN_PILLARS, allowAll).map((t) => t.to);
    expect(new Set(routes).size).toBe(routes.length);
  });
});
