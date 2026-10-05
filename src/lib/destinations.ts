import {
  CLINICIAN_PILLARS,
  PATIENT_PILLARS,
  navTargets,
  type NavTarget,
} from '@/lib/nav-ia';
import { availableSections, type PracticeContext } from '@/lib/practice-sections';

/**
 * Places search can send somebody: every page the navigation offers, plus the
 * things the navigation has no tab for - Settings and what is inside it.
 *
 * ## Derived, not duplicated
 *
 * Pages come from `navTargets`, so the same pillars and the same capability
 * check that draw the tab bars decide what is offered. Only the extras live
 * here, and each is filtered by the rule its route enforces: practice sections
 * through `availableSections` (the hub's own predicate), Settings through
 * nothing, because its routes only require being signed in as that audience.
 * Whatever this offers, the route still enforces - this decides what is
 * *shown*, not what is permitted.
 *
 * Keywords are what people call things rather than what the product does:
 * "billing" is Bills for a patient and Invoices for a clinician.
 */

export interface Destination extends NavTarget {
  keywords: string[];
}

export type DestinationAudience = 'clinician' | 'patient';

/** Extra words that should find a page, keyed by its path. */
const PAGE_KEYWORDS: Record<string, string[]> = {
  '/dashboard': ['home', 'dashboard', 'summary'],
  '/schedule': ['doses', 'reminders', 'pills', 'timetable'],
  '/guidance': ['instructions', 'advice', 'care plan'],
  '/vitals': ['blood pressure', 'weight', 'glucose', 'heart rate', 'readings'],
  '/medications': ['medicines', 'drugs', 'prescriptions', 'pills'],
  '/health-vault': ['vault', 'documents', 'files', 'records', 'results', 'letters'],
  '/recordings': ['audio', 'visit recordings'],
  '/adherence-report': ['adherence', 'report', 'compliance'],
  '/messages': ['chat', 'inbox', 'message'],
  '/care-circle': ['sharing', 'family', 'caregivers', 'share my record', 'access'],
  '/billing': ['billing', 'bills', 'payments', 'invoices'],
  '/knowledge-base': ['learn', 'conditions', 'articles', 'help'],
  '/clinician/today': ['home', 'dashboard', 'overview', 'tasks'],
  '/clinician/schedule': ['appointments', 'calendar', 'diary'],
  '/clinician/scribe': ['scribe', 'visit notes', 'visit note', 'dictation', 'notes', 'soap', 'record visit', 'record'],
  '/clinician/voice-memos': ['voice memo', 'voice memos', 'memo', 'memos', 'dictate my notes', 'my notes', 'unfiled notes'],
  '/clinician/alerts': ['alerts', 'rules', 'thresholds', 'notifications'],
  '/clinician/patients': ['patients', 'panel', 'list', 'caseload'],
  '/clinician/patients/import': ['import', 'upload', 'csv', 'invite patients'],
  '/clinician/messages': ['chat', 'inbox', 'message'],
  '/clinician/guidance': ['instructions', 'advice', 'care plan', 'send guidance'],
  '/clinician/templates': ['note templates', 'forms'],
  '/clinician/practice': ['practice', 'clinic', 'organisation', 'team', 'admin'],
  '/clinician/invoices': ['billing', 'invoices', 'payments', 'fees'],
  '/clinician/reports': ['reports', 'analytics', 'export'],
  '/clinician/compliance': ['compliance', 'audit', 'audit log', 'baa', 'hipaa', 'access log'],
};

interface Extra {
  to: string;
  label: string;
  group: string;
  keywords: string[];
}

const PATIENT_EXTRAS: Extra[] = [
  { to: '/settings', label: 'Settings', group: 'Settings', keywords: ['preferences', 'account', 'options', 'configure'] },
  { to: '/settings?section=account', label: 'Profile', group: 'Settings', keywords: ['account', 'name', 'email', 'phone', 'avatar', 'password'] },
  { to: '/settings?section=care', label: 'Care & alerts', group: 'Settings', keywords: ['emergency contact', 'caregiver alerts', 'alerts'] },
  { to: '/settings?section=privacy', label: 'Privacy & data', group: 'Settings', keywords: ['consent', 'sharing history', 'ai history', 'audit', 'export', 'delete account', 'data'] },
  { to: '/settings?section=notifications', label: 'Notification preferences', group: 'Settings', keywords: ['reminders', 'push', 'email alerts', 'notifications'] },
  { to: '/settings?section=units', label: 'Unit preferences', group: 'Settings', keywords: ['units', 'kg', 'lbs', 'mmol', 'metric', 'imperial', 'timezone'] },
  { to: '/ai', label: 'Assistant', group: 'Learn', keywords: ['ai', 'chat', 'ask', 'conversations', 'help'] },
];

const CLINICIAN_EXTRAS: Extra[] = [
  { to: '/clinician/settings', label: 'Settings', group: 'Settings', keywords: ['preferences', 'account', 'options', 'my profile', 'configure'] },
  { to: '/clinician/settings?section=account', label: 'My profile', group: 'Settings', keywords: ['account', 'name', 'license', 'specialty', 'avatar', 'password'] },
  { to: '/clinician/settings?section=privacy', label: 'Privacy & data', group: 'Settings', keywords: ['audit trail', 'my activity', 'data'] },
  { to: '/clinician/settings?section=notifications', label: 'Notification preferences', group: 'Settings', keywords: ['notifications', 'push', 'email alerts', 'guidance alerts'] },
  { to: '/clinician/settings?section=appearance', label: 'Appearance', group: 'Settings', keywords: ['theme', 'dark mode', 'layout', 'navigation', 'preferences'] },
];

const PRACTICE_KEYWORDS: Record<string, string[]> = {
  people: ['team', 'staff', 'colleagues', 'invite', 'members', 'users', 'roles'],
  departments: ['teams', 'leads', 'wards'],
  routing: ['assign', 'route patients', 'hospital patients'],
  access: ['shared patients', 'ehr', 'integrations', 'connections'],
  details: ['address', 'branding', 'logo', 'currency', 'joining code', 'hospital code'],
  plan: ['billing', 'subscription', 'usage', 'storage', 'plan', 'pricing', 'upgrade'],
  account: ['seats', 'billing', 'add-ons', 'addons', 'partner', 'partnership', 'scribe minutes', 'clinician seat', 'staff seat'],
};

/** Shown wherever the scribe is offered but this member cannot use it. */
export const SCRIBE_LOCKED_REASON = 'Scribe needs clinical access in this practice';

/** Shown wherever the scribe is offered but the plan does not include it. */
export const SCRIBE_NOT_IN_PLAN_REASON =
  'The scribe is not part of your plan. Practice, Clinic and Enterprise include it.';

export interface QuickAction {
  id: 'start-scribe' | 'voice-memos';
  label: string;
  to: string;
  keywords: string[];
  /** Set when the member lacks the capability: shown, explained, not runnable. */
  lockedReason?: string;
}

/**
 * Verbs, as opposed to places. Offered with the capability, or - once the
 * capability answer is in - shown locked with the reason, rather than silently
 * missing. While capabilities are still loading nothing is shown, so a
 * clinician never sees a locked flash.
 */
export function buildQuickActions({
  can,
  loading = false,
  planIncluded = null,
}: {
  can: (capability: any) => boolean;
  loading?: boolean;
  /** false when the plan has no scribe; null/undefined when that is not known. */
  planIncluded?: boolean | null;
}): QuickAction[] {
  if (loading) return [];
  const hasRole = can('edit_clinical');
  const planBlocked = planIncluded === false;
  const allowed = hasRole && !planBlocked;
  const reason = hasRole ? SCRIBE_NOT_IN_PLAN_REASON : SCRIBE_LOCKED_REASON;
  return [
    {
      id: 'start-scribe',
      label: 'Start scribe',
      to: '/clinician/scribe',
      keywords: ['scribe', 'record', 'visit note', 'visit notes', 'dictate', 'dictation'],
      ...(allowed ? {} : { lockedReason: reason }),
    },
    {
      id: 'voice-memos',
      label: 'Voice memos',
      to: '/clinician/voice-memos',
      keywords: ['voice memo', 'memo', 'memos', 'dictate my notes', 'my notes'],
      ...(allowed ? {} : { lockedReason: reason }),
    },
  ];
}

export function matchQuickActions(actions: readonly QuickAction[], query: string): QuickAction[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...actions];
  return actions.filter((a) => [a.label, ...a.keywords].some((w) => w.toLowerCase().includes(q)));
}

export interface DestinationOptions {
  audience: DestinationAudience;
  /** Practice capability check; ignored for patients. */
  can?: (capability: any) => boolean;
  /** When known, adds the practice sections this member may open. */
  practice?: PracticeContext | null;
}

export function buildDestinations({ audience, can, practice }: DestinationOptions): Destination[] {
  const clinician = audience === 'clinician';
  const pages: Destination[] = navTargets(
    clinician ? CLINICIAN_PILLARS : PATIENT_PILLARS,
    clinician ? (can ?? (() => false)) : () => false,
  ).map((target) => ({ ...target, keywords: PAGE_KEYWORDS[target.to] ?? [] }));

  const extras: Extra[] = clinician ? CLINICIAN_EXTRAS : PATIENT_EXTRAS;
  const practiceSections: Destination[] =
    clinician && practice
      ? availableSections(practice).map((section) => ({
          to: section.path,
          label: section.label,
          group: 'Practice',
          keywords: PRACTICE_KEYWORDS[section.id] ?? [],
        }))
      : [];

  const seen = new Set<string>();
  return [...pages, ...extras, ...practiceSections].filter((d) => {
    if (seen.has(d.to)) return false;
    seen.add(d.to);
    return true;
  });
}

/** Path without query or hash, so a test can check it against the router. */
export function destinationPath(destination: Pick<Destination, 'to'>): string {
  return destination.to.split(/[?#]/)[0];
}

// ---------------------------------------------------------------------------
// Recent destinations
// ---------------------------------------------------------------------------

const RECENT_LIMIT = 5;
const recentKey = (userId: string) => `onecare.search.recent.${userId}`;

/**
 * Remembers paths only - never a patient, never a query - so nothing sensitive
 * is stored. Read back through the current destination list, so a role change
 * can never surface a place the member can no longer open.
 */
export function readRecentPaths(userId: string | null | undefined): string[] {
  if (!userId) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(recentKey(userId)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberPath(userId: string | null | undefined, to: string): void {
  if (!userId) return;
  try {
    const next = [to, ...readRecentPaths(userId).filter((p) => p !== to)].slice(0, RECENT_LIMIT);
    window.localStorage.setItem(recentKey(userId), JSON.stringify(next));
  } catch {
    /* storage unavailable - recents are a convenience */
  }
}

export function recentDestinations(
  destinations: readonly Destination[],
  paths: readonly string[],
): Destination[] {
  return paths
    .map((p) => destinations.find((d) => d.to === p))
    .filter((d): d is Destination => !!d);
}
