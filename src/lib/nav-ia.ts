// Navigation IA v2 — single source of truth for pillar/sub-tab structure.
// See docs/roadmap.md and .lovable/plan.md.

import { FAMILY_HEALTH_ENABLED } from "@/lib/feature-flags";

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
      // "Schedule" reads as an appointment diary. This page is the day's doses.
      { to: "/schedule", label: "Doses" },
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
      // Sits next to the Vault because that is where a recording ends up, and
      // because "what was I actually told" belongs with "what do I have".
      { to: "/recordings", label: "Recordings" },
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
      // Bills come from a clinic relationship, so they live with the rest of it
      // rather than on the dashboard. Kept in the navigation permanently once
      // the patient is connected: a bill that vanishes when paid is one they
      // cannot look back at.
      { to: "/billing", label: "Bills" },
      // Family is hidden — see FAMILY_HEALTH_ENABLED in src/lib/feature-flags.ts.
      ...(FAMILY_HEALTH_ENABLED ? [{ to: "/family", label: "Family" }] : []),
    ],
  },
  {
    // The Knowledge Base is reference reading — conditions, medicines, what to
    // ask your doctor. It sat under a pillar called "AI", which taught people
    // that "AI" is where the reading material lives and made the assistant look
    // like a section of the app rather than something available everywhere.
    //
    // The assistant is not a pillar at all now. It is one tap away on every
    // screen via the drawer, and past conversations are read back in Settings,
    // where "what I have asked and what I shared" already lives. /ai still
    // resolves so existing links and deep links keep working.
    key: "learn",
    label: "Learn",
    primary: "/knowledge-base",
    tabs: [
      { to: "/knowledge-base", label: "Health topics", match: ["/medication-info"] },
    ],
  },
];

export const CLINICIAN_PILLARS: ClinicianPillar[] = [
  {
    key: "today",
    label: "Today",
    primary: "/clinician/today",
    tabs: [
      { to: "/clinician/today", label: "Today", match: ["/clinician/dashboard"] },
      { to: "/clinician/alerts", label: "Alert rules" },
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
      // Dictation belongs to the visit, not beside Messages. EncounterScribePanel
      // already records inside an encounter and produces a SOAP draft tied to a
      // patient; the standalone page was a second, weaker copy — capped at 60
      // seconds, with no patient attached. The route still resolves so existing
      // recordings are not stranded, but it is no longer a destination of its own.
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
      // Audit and the BAA are things you reach *because* of compliance, not
      // three peers in a row. Both keep their routes — deep links and the
      // BAA's existing back-to-compliance breadcrumb still work — they are
      // just no longer competing for space in the tab bar.
      { to: "/clinician/compliance", label: "Compliance", match: ["/clinician/audit", "/clinician/baa"] },
      // "My profile" is deliberately NOT a Practice tab: it edits the person,
      // not the organisation. It lives in the account dropdown under their own
      // name, which is where anyone looks for their own details.
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
  // /ai is no longer a pillar. It is reached from the assistant drawer and
  // from Settings, so it highlights nothing in the primary navigation.
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
