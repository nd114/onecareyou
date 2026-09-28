
export type PracticeRole =
  | "owner" | "admin" | "sub_admin" | "provider" | "clinician"
  | "nurse" | "front_desk" | "billing" | "read_only" | "staff";

/**
 * What a staff role is for, and what it may see.
 *
 * Mirrors public.practice_role_is_clinical exactly. The database is the
 * enforcement — a non-clinical member reading an encounter gets nothing back
 * whatever this file says — but the interface has to agree with it, or a
 * receptionist is shown tabs that return empty and concludes the product is
 * broken rather than that it is working.
 *
 * Kept as a plain table rather than fetched, because it changes with a
 * migration and a stale copy in a cache would be worse than a stale copy in a
 * deploy.
 */
export interface RoleProfile {
  label: string;
  /** May read assessments, notes, readings, care plans. */
  clinical: boolean;
  description: string;
}

export const ROLE_PROFILES: Record<PracticeRole, RoleProfile> = {
  owner: {
    label: "Owner",
    clinical: true,
    description: "Runs the practice and sees everything in it.",
  },
  admin: {
    label: "Administrator",
    clinical: true,
    description: "Manages the team, the settings and the patient list.",
  },
  sub_admin: {
    label: "Department lead",
    clinical: true,
    description: "Runs one department: its clinicians, its queue, its patients.",
  },
  provider: {
    label: "Clinician",
    clinical: true,
    description: "Sees and writes the clinical record for patients they can reach.",
  },
  clinician: {
    label: "Clinician",
    clinical: true,
    description: "Sees and writes the clinical record for patients they can reach.",
  },
  nurse: {
    label: "Nurse",
    clinical: true,
    description: "Sees the clinical record and records observations.",
  },
  front_desk: {
    label: "Front desk",
    clinical: false,
    description: "Books appointments and manages contact details. Does not see the clinical record.",
  },
  billing: {
    label: "Billing",
    clinical: false,
    description: "Raises and tracks invoices. Does not see the clinical record.",
  },
  read_only: {
    label: "Read only",
    clinical: false,
    description: "Can look at scheduling and billing without changing anything.",
  },
  staff: {
    label: "Staff",
    clinical: false,
    description: "General non-clinical staff. Does not see the clinical record.",
  },
};

export function roleProfile(role: string | null | undefined): RoleProfile {
  return (
    ROLE_PROFILES[(role ?? "") as PracticeRole] ?? {
      // An unrecognised role gets the careful answer, matching the database's
      // allowlist: nothing clinical until somebody decides otherwise.
      label: role ?? "Unknown",
      clinical: false,
      description: "This role has no clinical access.",
    }
  );
}

export function isClinicalRole(role: string | null | undefined): boolean {
  return roleProfile(role).clinical;
}

/**
 * Whether to show a patient's clinical record, judged by the relationship the
 * clinician reaches them through, as the database judges it.
 *
 * The patient page used to ask about the role in the *current workspace*. That
 * is the wrong membership, or none at all: a clinician with no practice (solo,
 * reached through the patient's own share) was shown no clinical record, and a
 * clinician who is front desk in the chosen workspace but a doctor at the
 * hospital that assigned the patient was shown none either — while the
 * database, which role-gates only the hospital pathway and only by the role at
 * that hospital, returned it.
 */
export function showsClinicalRecord(
  patient: { source: "private" | "hospital"; hospital_id: string | null } | null | undefined,
  memberships: readonly { practice_id?: string | null; role?: string | null }[],
): boolean {
  if (!patient) return false;
  // The patient's own share to this clinician: no practice role is involved.
  if (patient.source === "private") return true;
  const atThatHospital = memberships.find((m) => m.practice_id === patient.hospital_id);
  return isClinicalRole(atThatHospital?.role);
}

/**
 * Which of a clinician's memberships is the current one.
 *
 * One function because it used to be several. When `useWorkspaceSelection`
 * arrived, `usePractice` and `useClinicianProfile` were moved onto the stored
 * choice and `useClinicianCapabilities` was not — so the Practice screens
 * showed one workspace while every `can(...)` and every `RequireCapability`
 * route gate answered for another. A clinician whose own practice predated
 * their hospital post kept owner capabilities while looking at the hospital.
 *
 * An explicit choice wins. Absent one, the first membership, so a clinician
 * with a single workspace sees no change. A choice naming a workspace they are
 * no longer a member of falls back the same way rather than resolving to
 * nothing.
 *
 * Pass it `liveMemberships(...)`, not raw rows: "first" has to mean the same
 * membership to every caller, and a retired practice is not a workspace.
 */
export function activeMembership<T extends { practice_id?: string | null }>(
  memberships: readonly T[],
  selectedWorkspaceId: string | null | undefined,
): T | null {
  const chosen = selectedWorkspaceId
    ? memberships.find((membership) => membership.practice_id === selectedWorkspaceId)
    : undefined;
  return chosen ?? memberships[0] ?? null;
}

/**
 * The memberships that can be the current workspace: those whose practice is
 * still active, earliest first.
 *
 * usePractice offers only active practices and used to take the first row its
 * practices query returned, in no particular order; useClinicianCapabilities
 * took every active membership, earliest first. So with a retired practice, or
 * with two workspaces and nothing chosen, the Practice screens showed one
 * workspace while every `can(...)` answered for another — including owner
 * rights at a practice nobody could see any more. Every reader filters and
 * orders the same way here before calling activeMembership.
 */
export function liveMemberships<
  T extends { practice_id?: string | null; created_at?: string | null },
>(memberships: readonly T[], activePracticeIds: Iterable<string>): T[] {
  const active = new Set(activePracticeIds);
  return memberships
    .filter((membership) => !!membership.practice_id && active.has(membership.practice_id))
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
}

/** The roles a practice can assign, grouped so the difference is visible. */
export const ASSIGNABLE_ROLES: { group: string; roles: PracticeRole[] }[] = [
  { group: "Clinical", roles: ["provider", "nurse", "sub_admin", "admin"] },
  { group: "Non-clinical", roles: ["front_desk", "billing", "read_only"] },
];
