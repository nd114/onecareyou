
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

/** The roles a practice can assign, grouped so the difference is visible. */
export const ASSIGNABLE_ROLES: { group: string; roles: PracticeRole[] }[] = [
  { group: "Clinical", roles: ["provider", "nurse", "sub_admin", "admin"] },
  { group: "Non-clinical", roles: ["front_desk", "billing", "read_only"] },
];
