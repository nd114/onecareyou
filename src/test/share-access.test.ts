import { describe, it, expect } from 'vitest';
import {
  confirmedEmailOf,
  shareOpensTo,
  clinicianShareGrants,
  type ShareAccessRow,
} from '../../supabase/functions/_shared/share-access';

const CLINICIAN = 'c0000000-0000-0000-0000-000000000001';
const OTHER = 'c0000000-0000-0000-0000-000000000002';

const share = (over: Partial<ShareAccessRow> = {}): ShareAccessRow => ({
  clinician_user_id: null,
  provider_email: 'dr.smith@clinic.com',
  is_active: true,
  expires_at: null,
  permissions: { vitals: true },
  ...over,
});

describe('confirmedEmailOf', () => {
  it('returns nothing for an address that was never confirmed', () => {
    expect(confirmedEmailOf({ email: 'dr.smith@clinic.com', email_confirmed_at: null })).toBeNull();
  });
  it('lower-cases a confirmed address', () => {
    expect(confirmedEmailOf({ email: 'Dr.Smith@Clinic.com', email_confirmed_at: '2026-01-01' })).toBe(
      'dr.smith@clinic.com',
    );
  });
});

describe('shareOpensTo', () => {
  it('does not open an email-addressed share to an unconfirmed look-alike account', () => {
    expect(shareOpensTo(share(), { id: OTHER, confirmedEmail: null })).toBe(false);
  });

  it('opens it to the confirmed owner of that address, case-insensitively', () => {
    expect(shareOpensTo(share({ provider_email: 'DR.SMITH@clinic.com' }), { id: OTHER, confirmedEmail: 'dr.smith@clinic.com' })).toBe(true);
  });

  it('opens a claimed share to the claimant only', () => {
    const s = share({ clinician_user_id: CLINICIAN, provider_email: null });
    expect(shareOpensTo(s, { id: CLINICIAN, confirmedEmail: null })).toBe(true);
    expect(shareOpensTo(s, { id: OTHER, confirmedEmail: null })).toBe(false);
  });

  it('treats a null address on both sides as no match', () => {
    const s = share({ provider_email: null });
    expect(shareOpensTo(s, { id: OTHER, confirmedEmail: null })).toBe(false);
  });

  it('closes on expiry and on deactivation', () => {
    const caller = { id: CLINICIAN, confirmedEmail: null };
    expect(shareOpensTo(share({ clinician_user_id: CLINICIAN, expires_at: '2020-01-01T00:00:00Z' }), caller)).toBe(false);
    expect(shareOpensTo(share({ clinician_user_id: CLINICIAN, is_active: false }), caller)).toBe(false);
  });

  it('checks the permission, through the alias table', () => {
    const caller = { id: CLINICIAN, confirmedEmail: null };
    const s = share({ clinician_user_id: CLINICIAN, permissions: { meds: true } });
    expect(shareOpensTo(s, caller, 'medications')).toBe(true);
    expect(shareOpensTo(s, caller, 'vitals')).toBe(false);
    expect(shareOpensTo(share({ clinician_user_id: CLINICIAN, permissions: { vitals: 'yes' } }), caller, 'vitals')).toBe(false);
  });
});

describe('clinicianShareGrants', () => {
  const adminReturning = (rows: ShareAccessRow[] | null, error: unknown = null) => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: async () => ({ data: rows, error }) }) }),
    }),
  });

  it('fails closed on a lookup error', async () => {
    expect(await clinicianShareGrants(adminReturning(null, { message: 'x' }), { id: CLINICIAN, confirmedEmail: null }, 'p', 'vitals')).toBe(false);
  });

  it('finds a live claimed share with the permission', async () => {
    const rows = [share({ clinician_user_id: OTHER }), share({ clinician_user_id: CLINICIAN })];
    expect(await clinicianShareGrants(adminReturning(rows), { id: CLINICIAN, confirmedEmail: null }, 'p', 'vitals')).toBe(true);
  });
});
