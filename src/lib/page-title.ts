import { CLINICIAN_PILLARS, PATIENT_PILLARS, getActiveNavTab } from '@/lib/nav-ia';

/**
 * What the browser tab says you are looking at.
 *
 * Four of eighty pages set a title. Everywhere else the tab kept whatever the
 * last page that bothered had put there — sign in and the tab still read
 * "Sign In | OneCare" through the dashboard, your vitals and your medicines.
 * On a phone that is the label on the card in the tab switcher, and for anyone
 * using a screen reader it is the first thing announced on navigation.
 *
 * Rather than adding a tag to seventy-six files and having the seventy-seventh
 * forget, the title is derived from the route. The primary navigation already
 * names most of these screens, and its names are the ones people just clicked,
 * so those are reused verbatim; the table below only covers the screens the
 * navigation has no name for.
 */

const PATIENT_SUFFIX = 'OneCare';
const CLINICIAN_SUFFIX = 'OneCare for Clinicians';
const ADMIN_SUFFIX = 'OneCare Admin';

interface Rule {
  /** Path pattern; a ":name" segment matches any single non-empty segment. */
  pattern: string;
  title: string;
}

/**
 * Screens the navigation does not name, most specific first — "…/import" has
 * to be tried before "…/:inviteCode" or every import lands on "Patient".
 */
const EXTRA: Rule[] = [
  { pattern: '/onboarding', title: 'Set up your account' },
  { pattern: '/settings', title: 'Settings' },
  { pattern: '/medications/add', title: 'Add medication' },
  { pattern: '/medications/:id/edit', title: 'Edit medication' },
  { pattern: '/medication-info/:drugName', title: 'Medicine information' },
  { pattern: '/ai', title: 'Assistant' },
  { pattern: '/ai/:conversationId', title: 'Assistant' },
  { pattern: '/family', title: 'Family' },
  { pattern: '/family/:memberId', title: 'Family' },
  { pattern: '/subscription-success', title: 'Subscription' },

  { pattern: '/clinician/patients/import', title: 'Import patients' },
  { pattern: '/clinician/patients/:inviteCode', title: 'Patient' },
  { pattern: '/clinician/patient/:inviteCode', title: 'Patient' },
  { pattern: '/clinician/records/:recordId', title: 'Record' },
  { pattern: '/clinician/settings', title: 'Settings' },
  { pattern: '/clinician/practice/:sectionId', title: 'Practice' },
  { pattern: '/clinician/audit', title: 'Audit log' },
  { pattern: '/clinician/baa', title: 'Business associate agreement' },
  { pattern: '/clinician/dictations', title: 'Dictations' },
  { pattern: '/clinician/enterprise-inquiry', title: 'Enterprise enquiry' },
  { pattern: '/clinician/subscription-success', title: 'Subscription' },
  { pattern: '/practice', title: 'Practice admin' },

  { pattern: '/admin/import', title: 'Import' },
  { pattern: '/admin/tenants/:id', title: 'Institution' },
];

function segments(path: string) {
  return path.split('/').filter(Boolean);
}

export function matchesPattern(pattern: string, pathname: string) {
  const p = segments(pattern);
  const a = segments(pathname);
  if (p.length !== a.length) return false;
  return p.every((seg, i) => (seg.startsWith(':') ? a[i].length > 0 : seg === a[i]));
}

function suffixFor(pathname: string) {
  if (pathname === '/practice' || pathname.startsWith('/practice/')) return CLINICIAN_SUFFIX;
  if (pathname === '/clinician' || pathname.startsWith('/clinician/')) return CLINICIAN_SUFFIX;
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return ADMIN_SUFFIX;
  return PATIENT_SUFFIX;
}

/** The name of this screen, or null when the route is not one of the app's own. */
export function pageNameForRoute(pathname: string): string | null {
  for (const rule of EXTRA) {
    if (matchesPattern(rule.pattern, pathname)) return rule.title;
  }
  // A route can sit under one pillar only, but nothing enforces that, so take
  // the most specific name on offer rather than the first pillar to answer.
  let best: { label: string; length: number } | null = null;
  for (const pillar of [...PATIENT_PILLARS, ...CLINICIAN_PILLARS]) {
    const tab = getActiveNavTab(pillar.tabs, pathname);
    if (!tab) continue;
    const length = tab.to.split('#')[0].length;
    if (!best || length > best.length) best = { label: tab.label, length };
  }
  return best?.label ?? null;
}

/**
 * The full document title, or null to leave the tab alone — marketing pages
 * set their own through SEOHead, and an unknown route should not be renamed.
 */
export function pageTitleForRoute(pathname: string): string | null {
  const name = pageNameForRoute(pathname);
  if (!name) return null;
  return `${name} | ${suffixFor(pathname)}`;
}
