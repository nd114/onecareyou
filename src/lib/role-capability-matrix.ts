import type { PracticeCapability } from '@/hooks/useClinicianCapabilities';
import { ROLE_PROFILES, type PracticeRole } from '@/lib/staff-roles';

/**
 * Which role can do what, by default, for display.
 *
 * Mirrors the CASE in public.has_practice_capability (the documented defaults).
 * A practice can override a default per role in practice_role_permissions, and
 * this table does not know about those: it is the starting point a person reads
 * to understand the roles, not the answer to "can this member do X". That is
 * has_practice_capability, and the interface asks it through `can(...)`.
 *
 * Plain data on purpose, like ROLE_PROFILES, so a change to the database
 * function is one visible edit here and one test failing if the two drift.
 */

export const MATRIX_CAPABILITIES: { key: PracticeCapability; label: string; detail: string }[] = [
  { key: 'view_phi', label: 'See clinical records', detail: 'Read assessments, notes, readings and care plans.' },
  { key: 'edit_clinical', label: 'Write clinical notes', detail: 'Create and sign encounters, plans and orders.' },
  { key: 'send_guidance', label: 'Send guidance', detail: 'Send care guidance to patients.' },
  { key: 'message_patients', label: 'Message patients', detail: 'Start and answer patient conversations.' },
  { key: 'manage_billing', label: 'Manage billing', detail: 'Subscription, invoices, seats and add-ons.' },
  { key: 'manage_team', label: 'Manage the team', detail: 'Invite, change roles, remove members.' },
  { key: 'manage_ehr', label: 'Manage EHR connections', detail: 'Connect and disconnect EHR systems.' },
  { key: 'manage_settings', label: 'Change practice settings', detail: 'Name, address, branding, joining code.' },
  { key: 'invite_patients', label: 'Invite patients', detail: 'Send patient invitations.' },
  { key: 'export_data', label: 'Export data', detail: 'Download practice records.' },
  { key: 'bulk_message', label: 'Bulk message', detail: 'Message many patients at once.' },
  { key: 'view_audit', label: 'View the audit log', detail: 'See who accessed what.' },
  { key: 'assign_patients', label: 'Assign patients', detail: 'Route patients to colleagues, within scope.' },
];

/**
 * Roles as columns. `provider` and `clinician` are two names for one default,
 * so they share a column.
 */
export const MATRIX_ROLES: { key: PracticeRole; label: string }[] = [
  { key: 'owner', label: ROLE_PROFILES.owner.label },
  { key: 'admin', label: ROLE_PROFILES.admin.label },
  { key: 'sub_admin', label: ROLE_PROFILES.sub_admin.label },
  { key: 'provider', label: ROLE_PROFILES.provider.label },
  { key: 'nurse', label: ROLE_PROFILES.nurse.label },
  { key: 'front_desk', label: ROLE_PROFILES.front_desk.label },
  { key: 'billing', label: ROLE_PROFILES.billing.label },
  { key: 'read_only', label: ROLE_PROFILES.read_only.label },
  { key: 'staff', label: ROLE_PROFILES.staff.label },
];

const DEFAULTS: Record<PracticeCapability, PracticeRole[]> = {
  view_phi: ['owner', 'admin', 'sub_admin', 'provider', 'clinician', 'nurse', 'front_desk', 'read_only'],
  edit_clinical: ['owner', 'admin', 'sub_admin', 'provider', 'clinician'],
  send_guidance: ['owner', 'admin', 'sub_admin', 'provider', 'clinician', 'nurse'],
  message_patients: ['owner', 'admin', 'sub_admin', 'provider', 'clinician', 'nurse', 'front_desk'],
  manage_billing: ['owner', 'admin', 'billing'],
  manage_team: ['owner', 'admin'],
  manage_ehr: ['owner', 'admin'],
  manage_settings: ['owner', 'admin'],
  invite_patients: ['owner', 'admin', 'sub_admin', 'provider', 'clinician', 'front_desk'],
  export_data: ['owner', 'admin', 'sub_admin', 'provider', 'clinician'],
  bulk_message: ['owner', 'admin', 'sub_admin', 'provider', 'clinician'],
  view_audit: ['owner', 'admin', 'sub_admin'],
  assign_patients: ['owner', 'admin', 'sub_admin'],
};

/**
 * Owners and admins run the practice. What they read of the clinical record
 * depends on a clinical seat, not on the role, so for these capabilities their
 * cell says so rather than a flat yes.
 */
export const SEAT_DEPENDENT: PracticeCapability[] = ['view_phi', 'edit_clinical', 'send_guidance', 'export_data'];

export type CellState = 'yes' | 'no' | 'seat';

export function roleHas(role: PracticeRole, capability: PracticeCapability): boolean {
  return DEFAULTS[capability].includes(role);
}

export function matrixCell(role: PracticeRole, capability: PracticeCapability): CellState {
  if (!roleHas(role, capability)) return 'no';
  if ((role === 'owner' || role === 'admin') && SEAT_DEPENDENT.includes(capability)) return 'seat';
  return 'yes';
}
