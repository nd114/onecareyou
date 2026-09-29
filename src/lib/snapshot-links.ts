/**
 * Read-only snapshot links: what the patient can put in one, how long it
 * lives, and how the link is written.
 *
 * The database is the authority on every one of these (see
 * supabase/migrations/20261010060000_read_only_snapshot_links.sql); this file
 * exists so the words on the screen say what the database will actually do.
 */

/**
 * The share vocabulary, less the two that make no sense frozen for a
 * stranger: `profile` is the whole profile row, and `adherence` is a
 * judgement about the patient rather than their record.
 */
export const SNAPSHOT_CATEGORIES = [
  { key: 'vitals', label: 'Vitals', desc: 'Your readings from the last 90 days' },
  { key: 'medications', label: 'Medications', desc: 'Medicines you are currently taking' },
  { key: 'conditions', label: 'Conditions', desc: 'Your list of health conditions' },
  { key: 'allergies', label: 'Allergies', desc: 'Your list of allergies' },
  { key: 'documents', label: 'Documents', desc: 'Only the documents you pick below' },
] as const;

export type SnapshotCategory = (typeof SNAPSHOT_CATEGORIES)[number]['key'];

export const EXPIRY_OPTIONS = [
  { hours: 24, label: '24 hours' },
  { hours: 24 * 7, label: '7 days' },
  { hours: 24 * 30, label: '30 days' },
] as const;

export const MAX_SNAPSHOT_DOCUMENTS = 20;

/**
 * The token goes after `#`, never in the path or query: browsers do not send
 * the fragment to any server, so it cannot land in a hosting log, a proxy log
 * or a Referer header.
 */
export function buildSnapshotUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/s#${token}`;
}

/** The token from `location.hash`, or null when it is not the right shape. */
export function readSnapshotToken(hash: string): string | null {
  const t = hash.replace(/^#/, '').trim();
  return /^[A-Za-z0-9_-]{43}$/.test(t) ? t : null;
}

export function categoryLabel(key: string): string {
  return SNAPSHOT_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

/** "vitals, medications and 2 documents" — the plain sentence shown before creating. */
export function describeContents(categories: readonly string[], documentCount: number): string {
  const parts = SNAPSHOT_CATEGORIES.filter((c) => categories.includes(c.key)).map((c) =>
    c.key === 'documents'
      ? `${documentCount} document${documentCount === 1 ? '' : 's'}`
      : c.label.toLowerCase(),
  );
  if (parts.length === 0) return 'nothing';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export interface SnapshotLinkSummary {
  expires_at: string;
  revoked_at: string | null;
  locked: boolean;
}

export type SnapshotLinkState = 'active' | 'expired' | 'revoked' | 'locked';

export function snapshotLinkState(link: SnapshotLinkSummary, now: Date = new Date()): SnapshotLinkState {
  if (link.revoked_at) return 'revoked';
  if (new Date(link.expires_at).getTime() <= now.getTime()) return 'expired';
  if (link.locked) return 'locked';
  return 'active';
}

/** Why the viewer is seeing nothing, in words for somebody with no account. */
export const VIEWER_MESSAGES: Record<string, string> = {
  not_found: 'This link does not work. Check that you copied all of it, or ask the person who sent it for a new one.',
  revoked: 'The person who shared this has stopped sharing it.',
  expired: 'This link has expired. Ask the person who sent it for a new one if you still need it.',
  locked: 'This link was locked after too many wrong passcodes. Ask the person who sent it for a new one.',
  rate_limited: 'This link has been opened many times recently. Please try again later.',
};
