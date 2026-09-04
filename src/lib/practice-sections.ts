/**
 * How practice management is organised, and why.
 *
 * The page it replaces was fifteen cards stacked in one column in an order
 * that followed no principle: an ownership invitation, then the team, then the
 * postal address, then the billing currency, then the hospital code, then who
 * counts as staff, then departments, then shared patients, then an access
 * overview, then revenue share, then storage, then the subscription, then EHR
 * connections, then branding. Every one of them a Card, so every one carried
 * the same weight as every other and nothing read as belonging to anything.
 *
 * The organising principle here is **how often somebody touches it**, because
 * that is what actually separates these things:
 *
 *   - People changes weekly. Somebody starts, somebody leaves, a department
 *     gets a new lead.
 *   - Patient access is looked at when something is wrong — a clinic cannot
 *     see a record, or can see one it should not.
 *   - Practice details are set once and revisited when the practice moves or
 *     rebrands.
 *   - Plan and usage is checked monthly, or when a limit bites.
 *
 * ## The rule that shapes the code
 *
 * Nearly every card on the old page hides itself: `if (!currentPractice)
 * return null`, `if (tenant_type !== 'hospital') return null`, and so on. A
 * solo clinician sees five of the fifteen; a hospital owner sees all of them.
 * That was survivable on one long page and is not survivable in a hub, because
 * **a link to an empty page is worse than the pile it replaced.**
 *
 * So each section declares what makes it worth offering, and the hub asks
 * before it offers. The predicates are the same structural facts the cards
 * check — whether there is a practice, whether it is a hospital, what the
 * plan includes — so they cannot answer differently.
 */

export type PracticeSectionId = "people" | "access" | "details" | "plan";

export interface PracticeContext {
  /** Whether this clinician belongs to a practice at all. */
  hasPractice: boolean;
  /** Hospital tenants get departments, an allowlist and an access overview. */
  isHospital: boolean;
  /** Owners and admins; a member sees the practice but does not run it. */
  isAdmin: boolean;
  /** Whether the plan includes team management. */
  canManageTeam: boolean;
}

export interface PracticeSection {
  id: PracticeSectionId;
  label: string;
  /** One line, in the hub, saying what is behind the link. */
  summary: string;
  path: string;
  /**
   * Whether the section has anything to show.
   *
   * Returning true is a promise that the page behind the link is not blank,
   * so every section names at least one card that is unconditionally there
   * under these conditions.
   */
  isAvailable: (context: PracticeContext) => boolean;
}

export const PRACTICE_SECTIONS: PracticeSection[] = [
  {
    id: "people",
    label: "People",
    summary: "Who works here, which departments they belong to, and who may join.",
    path: "/clinician/practice/people",
    // The team section is always rendered here — either the real thing, or an
    // explanation of what the plan does not include, which is a real answer to
    // "how do I add a colleague" rather than a blank page.
    isAvailable: (c) => c.hasPractice,
  },
  {
    id: "access",
    label: "Patient access",
    summary: "Which patients are shared with the practice, and where their records come from.",
    path: "/clinician/practice/access",
    // EHR connections are here whatever the tenancy, so this is never empty.
    isAvailable: () => true,
  },
  {
    id: "details",
    label: "Practice details",
    summary: "Name, address, joining code, billing currency and branding.",
    path: "/clinician/practice/details",
    // Every card here needs a practice to describe.
    isAvailable: (c) => c.hasPractice,
  },
  {
    id: "plan",
    label: "Plan and usage",
    summary: "Subscription, storage, and what the practice is being billed.",
    path: "/clinician/practice/plan",
    // The subscription card is always there, even on a trial.
    isAvailable: () => true,
  },
];

export function availableSections(context: PracticeContext): PracticeSection[] {
  return PRACTICE_SECTIONS.filter((section) => section.isAvailable(context));
}

export function findSection(id: string | undefined): PracticeSection | undefined {
  return PRACTICE_SECTIONS.find((section) => section.id === id);
}

/**
 * Where the old anchors now live.
 *
 * The previous page put every card behind a `#hash` on one long route. Nothing
 * in the app links to those any more, but a bookmark is a real thing and
 * landing on a page that no longer has your section is a bad way to find out
 * it moved. Each old anchor maps to the section that absorbed it.
 */
export const LEGACY_ANCHOR_SECTIONS: Record<string, PracticeSectionId> = {
  "practice-team": "people",
  "staff-recognition": "people",
  departments: "people",
  "institution-patients": "access",
  "access-overview": "access",
  "ehr-connections": "access",
  "practice-contact": "details",
  "practice-currency": "details",
  "hospital-code": "details",
  branding: "details",
  subscription: "plan",
  storage: "plan",
  "revenue-share": "plan",
};

/** The section an old `#hash` should land on, if it names one we recognise. */
export function sectionForLegacyAnchor(hash: string): PracticeSection | undefined {
  const id = LEGACY_ANCHOR_SECTIONS[hash.replace(/^#/, "")];
  return id ? findSection(id) : undefined;
}
