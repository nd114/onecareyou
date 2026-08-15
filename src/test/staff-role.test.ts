import { describe, it, expect } from 'vitest';

/**
 * The rule that decides which side of the product someone lands on.
 *
 * This was a live defect: a hospital owner invited by email had no
 * clinician_profiles row, so they were treated as a patient — shown the patient
 * dashboard, and blocked from /clinician/practice, which is the only place the
 * invitation can be accepted. They had to sign out and back in to escape it.
 *
 * Mirrors the derivation in useClinicianProfile so the rule itself is covered
 * without standing up Supabase.
 */
function deriveRole(input: {
  hasClinicalProfile: boolean;
  memberships: { role: string }[];
  pendingTenantInvites: number;
}) {
  const { hasClinicalProfile, memberships, pendingTenantInvites } = input;
  const isClinician =
    hasClinicalProfile || memberships.length > 0 || pendingTenantInvites > 0;
  const primary = memberships[0] ?? null;
  const isTenantAdmin =
    primary?.role === 'owner' || primary?.role === 'admin' || pendingTenantInvites > 0;
  return { isClinician, isTenantAdmin };
}

const none = { hasClinicalProfile: false, memberships: [], pendingTenantInvites: 0 };

describe('which side of the product a user belongs on', () => {
  it('treats a plain account as a patient', () => {
    expect(deriveRole(none)).toEqual({ isClinician: false, isTenantAdmin: false });
  });

  it('treats a clinical profile as clinician-side', () => {
    const r = deriveRole({ ...none, hasClinicalProfile: true });
    expect(r.isClinician).toBe(true);
    expect(r.isTenantAdmin).toBe(false);
  });

  it('treats an invited tenant owner as clinician-side before they have a profile', () => {
    // The reported bug: this returned patient, so the invitation was unreachable.
    const r = deriveRole({ ...none, pendingTenantInvites: 1 });
    expect(r.isClinician).toBe(true);
    expect(r.isTenantAdmin).toBe(true);
  });

  it('treats a hospital admin with no clinical profile as an admin', () => {
    const r = deriveRole({ ...none, memberships: [{ role: 'admin' }] });
    expect(r.isClinician).toBe(true);
    expect(r.isTenantAdmin).toBe(true);
  });

  it('treats an owner the same way', () => {
    expect(deriveRole({ ...none, memberships: [{ role: 'owner' }] }).isTenantAdmin).toBe(true);
  });

  it('keeps a sub-admin clinician-side but not a tenant admin', () => {
    // Sub-admins run a department, not the hospital: their landing page is the
    // clinical inbox, and Practice shows them only what they administer.
    const r = deriveRole({ ...none, memberships: [{ role: 'sub_admin' }] });
    expect(r.isClinician).toBe(true);
    expect(r.isTenantAdmin).toBe(false);
  });

  it('keeps ordinary staff clinician-side but not tenant admins', () => {
    for (const role of ['clinician', 'nurse', 'front_desk', 'billing', 'read_only']) {
      const r = deriveRole({ ...none, memberships: [{ role }] });
      expect(r.isClinician, role).toBe(true);
      expect(r.isTenantAdmin, role).toBe(false);
    }
  });

  it('does not promote a clinician to tenant admin via a second affiliation', () => {
    // Primary membership is the earliest one; a later admin role elsewhere must
    // not decide where this person lands.
    const r = deriveRole({
      ...none,
      memberships: [{ role: 'clinician' }, { role: 'admin' }],
    });
    expect(r.isTenantAdmin).toBe(false);
  });
});
