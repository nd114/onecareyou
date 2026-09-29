import { describe, it, expect } from 'vitest';
import {
  confirmedEmailOf,
  shareOpensTo,
  clinicianShareGrants,
  clinicianCanSeePatientAs,
  isClinicianAccount,
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
    expect(shareOpensTo(share(), { id: OTHER, confirmedEmail: null, isClinician: true })).toBe(false);
  });

  it('opens it to the confirmed owner of that address, case-insensitively', () => {
    expect(shareOpensTo(share({ provider_email: 'DR.SMITH@clinic.com' }), { id: OTHER, confirmedEmail: 'dr.smith@clinic.com', isClinician: true })).toBe(true);
  });

  it('opens a claimed share to the claimant only', () => {
    const s = share({ clinician_user_id: CLINICIAN, provider_email: null });
    expect(shareOpensTo(s, { id: CLINICIAN, confirmedEmail: null, isClinician: true })).toBe(true);
    expect(shareOpensTo(s, { id: OTHER, confirmedEmail: null, isClinician: true })).toBe(false);
  });

  it('treats a null address on both sides as no match', () => {
    const s = share({ provider_email: null });
    expect(shareOpensTo(s, { id: OTHER, confirmedEmail: null, isClinician: true })).toBe(false);
  });

  it('closes on expiry and on deactivation', () => {
    const caller = { id: CLINICIAN, confirmedEmail: null, isClinician: true };
    expect(shareOpensTo(share({ clinician_user_id: CLINICIAN, expires_at: '2020-01-01T00:00:00Z' }), caller)).toBe(false);
    expect(shareOpensTo(share({ clinician_user_id: CLINICIAN, is_active: false }), caller)).toBe(false);
  });

  it('checks the permission, through the alias table', () => {
    const caller = { id: CLINICIAN, confirmedEmail: null, isClinician: true };
    const s = share({ clinician_user_id: CLINICIAN, permissions: { meds: true } });
    expect(shareOpensTo(s, caller, 'medications')).toBe(true);
    expect(shareOpensTo(s, caller, 'vitals')).toBe(false);
    expect(shareOpensTo(share({ clinician_user_id: CLINICIAN, permissions: { vitals: 'yes' } }), caller, 'vitals')).toBe(false);
  });
});

describe('shareOpensTo — provider shares are for providers', () => {
  it('opens nothing to a patient account under the shared address', () => {
    const caller = { id: OTHER, confirmedEmail: 'dr.smith@clinic.com', isClinician: false };
    expect(shareOpensTo(share(), caller)).toBe(false);
    expect(shareOpensTo(share(), caller, 'vitals')).toBe(false);
  });

  it('nor to a patient account that claimed the share before the rule existed', () => {
    const s = share({ clinician_user_id: OTHER });
    expect(shareOpensTo(s, { id: OTHER, confirmedEmail: null, isClinician: false })).toBe(false);
  });

  it('treats a missing answer as not a clinician', () => {
    const caller = { id: OTHER, confirmedEmail: 'dr.smith@clinic.com' } as unknown as Parameters<typeof shareOpensTo>[1];
    expect(shareOpensTo(share(), caller)).toBe(false);
  });

  it('still opens to the clinician the share was addressed to', () => {
    expect(shareOpensTo(share(), { id: OTHER, confirmedEmail: 'dr.smith@clinic.com', isClinician: true }, 'vitals')).toBe(true);
  });
});

type RpcCall = { fn: string; args: Record<string, unknown> | undefined };
const rpcReturning = (data: unknown, error: unknown = null) => {
  const calls: RpcCall[] = [];
  return {
    calls,
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data, error };
    },
  };
};

describe('isClinicianAccount', () => {
  it('asks is_clinician_account for the given user', async () => {
    const admin = rpcReturning(true);
    expect(await isClinicianAccount(admin, CLINICIAN)).toBe(true);
    expect(admin.calls).toEqual([{ fn: 'is_clinician_account', args: { _user_id: CLINICIAN } }]);
  });

  it('fails closed on an error or a non-boolean answer', async () => {
    expect(await isClinicianAccount(rpcReturning(true, { message: 'x' }), CLINICIAN)).toBe(false);
    expect(await isClinicianAccount(rpcReturning(null), CLINICIAN)).toBe(false);
    expect(await isClinicianAccount(rpcReturning(true), '')).toBe(false);
  });
});

describe('clinicianCanSeePatientAs / clinicianShareGrants', () => {
  it('asks the database for the named clinician, with the permission', async () => {
    const admin = rpcReturning(true);
    expect(await clinicianShareGrants(admin, { id: CLINICIAN }, 'p', 'vitals')).toBe(true);
    expect(admin.calls).toEqual([
      { fn: 'clinician_can_see_patient_as', args: { _clinician: CLINICIAN, _patient: 'p', _permission: 'vitals' } },
    ]);
  });

  it('passes a null permission for "any access"', async () => {
    const admin = rpcReturning(false);
    expect(await clinicianCanSeePatientAs(admin, CLINICIAN, 'p')).toBe(false);
    expect(admin.calls[0].args).toEqual({ _clinician: CLINICIAN, _patient: 'p', _permission: null });
  });

  it('does not match on anything the caller supplies besides their id', async () => {
    // A background job used to pass confirmedEmail: null and so ignore
    // unclaimed shares; the database now resolves the address itself.
    const admin = rpcReturning(true);
    const caller = { id: CLINICIAN, confirmedEmail: null, isClinician: false };
    expect(await clinicianShareGrants(admin, caller, 'p', 'vitals')).toBe(true);
    expect(admin.calls[0].args).toEqual({ _clinician: CLINICIAN, _patient: 'p', _permission: 'vitals' });
  });

  it('tells an outage apart from a no, and fails closed on it', async () => {
    const broken = rpcReturning(null, { message: 'x' });
    expect(await clinicianCanSeePatientAs(broken, CLINICIAN, 'p', 'vitals')).toBeNull();
    expect(await clinicianShareGrants(broken, { id: CLINICIAN }, 'p', 'vitals')).toBe(false);
    expect(await clinicianShareGrants(rpcReturning('yes'), { id: CLINICIAN }, 'p', 'vitals')).toBe(false);
  });

  it('never asks without both ids', async () => {
    const admin = rpcReturning(true);
    expect(await clinicianShareGrants(admin, { id: '' }, 'p', 'vitals')).toBe(false);
    expect(await clinicianShareGrants(admin, { id: CLINICIAN }, '', 'vitals')).toBe(false);
    expect(admin.calls).toHaveLength(0);
  });
});