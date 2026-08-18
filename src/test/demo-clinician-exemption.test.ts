import { describe, it, expect } from 'vitest';

/**
 * Mirrors the rule in supabase/functions/check-clinician-subscription.
 *
 * The point of these is the negative cases. The exemption grants unlimited
 * patients, so a pattern that is one character too loose hands free enterprise
 * accounts to real users — most dangerously to anyone on the onecare.you domain.
 */
const DEMO_CLINICIAN_PATTERN = /^demo-clinician-\d+@onecare\.you$/i;
const isDemoClinician = (email: string) =>
  DEMO_CLINICIAN_PATTERN.test(email.trim().toLowerCase());

describe('demo clinician billing exemption', () => {
  it('matches the seeded demo clinicians', () => {
    for (const email of [
      'demo-clinician-1@onecare.you',
      'demo-clinician-2@onecare.you',
      'demo-clinician-3@onecare.you',
      'demo-clinician-12@onecare.you',
    ]) {
      expect(isDemoClinician(email)).toBe(true);
    }
  });

  it('tolerates casing and surrounding whitespace', () => {
    expect(isDemoClinician('  Demo-Clinician-1@OneCare.You  ')).toBe(true);
  });

  it('does not exempt real staff on the same domain', () => {
    for (const email of [
      'nigel@onecare.you',
      'support@onecare.you',
      'demo@onecare.you',
      'clinician-1@onecare.you',
    ]) {
      expect(isDemoClinician(email)).toBe(false);
    }
  });

  it('does not exempt a lookalike on another domain', () => {
    for (const email of [
      'demo-clinician-1@onecare.you.evil.com',
      'demo-clinician-1@notonecare.you',
      'demo-clinician-1@onecare-you.com',
      'x+demo-clinician-1@onecare.you',
      'demo-clinician-1@onecareXyou',
    ]) {
      expect(isDemoClinician(email)).toBe(false);
    }
  });

  it('does not exempt demo patients', () => {
    expect(isDemoClinician('demo-patient-1@onecare.you')).toBe(false);
  });
});
