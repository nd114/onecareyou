// Navigation IA v2 — single source of truth for pillar/sub-tab structure.
// See docs/ui-redesign-plan.md and .lovable/plan.md.

export type PatientPillarKey = "today" | "health" | "team" | "learn";
export type ClinicianPillarKey = "today" | "patients" | "communicate" | "practice";

export interface NavTab {
  to: string;
  label: string;
}

export interface PatientPillar {
  key: PatientPillarKey;
  label: string;
  primary: string; // default landing route
  tabs: NavTab[];
}

export interface ClinicianPillar {
  key: ClinicianPillarKey;
  label: string;
  primary: string;
  tabs: NavTab[];
}

export const PATIENT_PILLARS: PatientPillar[] = [
  {
    key: "today",
    label: "Today",
    primary: "/dashboard",
    tabs: [
      { to: "/dashboard", label: "Overview" },
      { to: "/schedule", label: "Schedule" },
      { to: "/guidance", label: "Catch-up" },
    ],
  },
  {
    key: "health",
    label: "My Health",
    primary: "/vitals",
    tabs: [
      { to: "/vitals", label: "Vitals" },
      { to: "/medications", label: "Medications" },
      { to: "/health-vault", label: "Vault" },
      { to: "/adherence-report", label: "Adherence" },
    ],
  },
  {
    key: "team",
    label: "Care Team",
    primary: "/messages",
    tabs: [
      { to: "/messages", label: "Messages" },
      { to: "/care-circle", label: "Care Circle" },
      { to: "/family", label: "Family" },
    ],
  },
  {
    key: "learn",
    label: "Learn",
    primary: "/assist",
    tabs: [
      { to: "/assist", label: "Ask AI" },
      { to: "/knowledge-base", label: "Knowledge Base" },
    ],
  },
];

export const CLINICIAN_PILLARS: ClinicianPillar[] = [
  {
    key: "today",
    label: "Today",
    primary: "/clinician/today",
    tabs: [
      { to: "/clinician/today", label: "Inbox" },
      { to: "/clinician/dashboard", label: "Overview" },
      { to: "/clinician/alerts", label: "Alerts" },
    ],
  },
  {
    key: "patients",
    label: "Patients",
    primary: "/clinician/patients",
    tabs: [
      { to: "/clinician/patients", label: "All Patients" },
    ],
  },
  {
    key: "communicate",
    label: "Communicate",
    primary: "/clinician/messages",
    tabs: [
      { to: "/clinician/messages", label: "Messages" },
      { to: "/clinician/guidance", label: "Guidance" },
      { to: "/clinician/dictations", label: "Dictations" },
      { to: "/clinician/templates", label: "Templates" },
    ],
  },
  {
    key: "practice",
    label: "Practice",
    primary: "/clinician/practice",
    tabs: [
      { to: "/clinician/practice", label: "Overview" },
      { to: "/clinician/practice#practice-team", label: "Team" },
      { to: "/clinician/audit", label: "Audit" },
      { to: "/clinician/practice#ehr-connections", label: "EHR" },
      { to: "/clinician/practice#subscription", label: "Subscription" },
      { to: "/clinician/baa", label: "BAA" },
      { to: "/clinician/settings", label: "Settings" },
    ],
  },
];

export function getPatientPillarForRoute(pathname: string): PatientPillarKey | null {
  for (const p of PATIENT_PILLARS) {
    if (p.tabs.some((t) => pathname === t.to || pathname.startsWith(t.to + "/"))) return p.key;
  }
  // Common sub-routes
  if (pathname.startsWith("/medications") || pathname.startsWith("/medication-info")) return "health";
  if (pathname.startsWith("/family")) return "team";
  return null;
}

export function getClinicianPillarForRoute(pathname: string): ClinicianPillarKey | null {
  for (const p of CLINICIAN_PILLARS) {
    if (p.tabs.some((t) => {
      const base = t.to.split("#")[0];
      return pathname === base || pathname.startsWith(base + "/");
    })) return p.key;
  }
  if (pathname.startsWith("/clinician/patient")) return "patients";
  return null;
}
