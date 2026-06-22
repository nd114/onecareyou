// Navigation IA v2 — single source of truth for pillar/sub-tab structure.
// See docs/ui-redesign-plan.md and .lovable/plan.md.

export type PatientPillarKey = "today" | "health" | "team" | "learn";
export type ClinicianPillarKey = "today" | "patients" | "communicate" | "practice";

export interface NavTab {
  to: string;
  label: string;
  /** Additional route prefixes that should highlight this tab. */
  match?: string[];
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
      { to: "/knowledge-base", label: "Knowledge Base", match: ["/medication-info"] },
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
      { to: "/clinician/patients", label: "All Patients", match: ["/clinician/patient"] },
      { to: "/clinician/patients/import", label: "Import" },
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
      { to: "/clinician/reports", label: "Reports" },
      { to: "/clinician/audit", label: "Audit" },
      { to: "/clinician/compliance", label: "Compliance" },
      { to: "/clinician/baa", label: "BAA" },
      { to: "/clinician/settings", label: "Settings" },
    ],
  },
];


function tabCandidates(tab: NavTab) {
  return [tab.to.split("#")[0], ...(tab.match || [])].filter(Boolean);
}

function routeMatchScore(pathname: string, candidate: string) {
  if (pathname === candidate) return 10_000 + candidate.length;
  if (candidate !== "/" && pathname.startsWith(candidate + "/")) return candidate.length;
  return 0;
}

export function getActiveNavTab(tabs: NavTab[], pathname: string, hash = "") {
  const hashTab = hash
    ? tabs.find((tab) => {
        const [tabPath, tabHash] = tab.to.split("#");
        return tabHash && pathname === tabPath && hash === `#${tabHash}`;
      })
    : null;
  if (hashTab) return hashTab;

  let best: { tab: NavTab; score: number } | null = null;

  for (const tab of tabs) {
    const [, tabHash] = tab.to.split("#");
    const score = Math.max(
      ...tabCandidates(tab).map((candidate) => routeMatchScore(pathname, candidate))
    );

    if (tabHash) continue;
    if (score > 0 && (!best || score > best.score)) best = { tab, score };
  }

  return best?.tab || null;
}

export function isNavTabActive(tab: NavTab, tabs: NavTab[], pathname: string, hash = "") {
  return getActiveNavTab(tabs, pathname, hash)?.to === tab.to;
}

export function getPatientPillarForRoute(pathname: string): PatientPillarKey | null {
  let best: { key: PatientPillarKey; score: number } | null = null;
  for (const p of PATIENT_PILLARS) {
    const tab = getActiveNavTab(p.tabs, pathname);
    if (!tab) continue;
    const score = Math.max(...tabCandidates(tab).map((candidate) => routeMatchScore(pathname, candidate)));
    if (!best || score > best.score) best = { key: p.key, score };
  }
  if (pathname.startsWith("/family")) return "team";
  return best?.key || null;
}

export function getClinicianPillarForRoute(pathname: string): ClinicianPillarKey | null {
  let best: { key: ClinicianPillarKey; score: number } | null = null;
  for (const p of CLINICIAN_PILLARS) {
    const tab = getActiveNavTab(p.tabs, pathname);
    if (!tab) continue;
    const score = Math.max(...tabCandidates(tab).map((candidate) => routeMatchScore(pathname, candidate)));
    if (!best || score > best.score) best = { key: p.key, score };
  }
  return best?.key || null;
}
