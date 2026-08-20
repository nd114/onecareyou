import { useMemo } from 'react';
import { useShareEvents } from '@/hooks/useProviderShares';
import { useMyInstitutionShares } from '@/hooks/usePracticeShares';

/**
 * One chronological record of who the patient let in, and when they stopped.
 *
 * The two sharing pathways keep their history in different shapes. Private
 * doctor shares write an append-only row to share_events on every change.
 * Hospital connections have no equivalent — share_events is keyed to
 * provider_shares — so their history has to be read off the practice_shares row
 * itself: connected_at, and revoked_at when it ended.
 *
 * That asymmetry is invisible to the patient and should stay invisible. They
 * asked one question — "who has had my record, and what did they get?" — and it
 * should not matter which pathway the answer came from.
 */

export type SharingHistoryKind = 'doctor' | 'hospital';

export interface SharingHistoryEntry {
  id: string;
  at: string;
  kind: SharingHistoryKind;
  /** What happened, in the patient's words. */
  label: string;
  /** Who it concerned. */
  who: string;
  /** Why, when a reason was given. */
  reason?: string | null;
  /** What was being shared at that moment, where it is recorded. */
  shared?: string[] | null;
}

const EVENT_LABELS: Record<string, string> = {
  connected: 'You shared with',
  claimed: 'They joined OneCare',
  permissions_changed: 'You changed what you share with',
  paused: 'You paused sharing with',
  resumed: 'You resumed sharing with',
  revoked: 'You stopped sharing with',
  reshared: 'You shared again with',
  expired: 'Sharing expired for',
};

const PERMISSION_LABELS: Record<string, string> = {
  vitals: 'Vitals',
  meds: 'Medications',
  medications: 'Medications',
  adherence: 'Adherence',
  profile: 'Health profile',
  documents: 'Health Vault',
  conditions: 'Conditions',
  allergies: 'Allergies',
};

function describePermissions(permissions: unknown): string[] | null {
  if (!permissions || typeof permissions !== 'object') return null;
  const granted = Object.entries(permissions as Record<string, unknown>)
    .filter(([, v]) => v === true)
    .map(([k]) => PERMISSION_LABELS[k] ?? k);
  return granted.length ? granted : null;
}

export function useSharingHistory() {
  const { data: shareEvents = [], isLoading: loadingEvents } = useShareEvents();
  const { shares: institutionShares, isLoading: loadingInstitutions } = useMyInstitutionShares();

  const entries = useMemo<SharingHistoryEntry[]>(() => {
    const out: SharingHistoryEntry[] = [];

    for (const event of shareEvents) {
      const details = (event.details ?? {}) as Record<string, unknown>;
      out.push({
        id: `event-${event.id}`,
        at: event.created_at,
        kind: 'doctor',
        label: EVENT_LABELS[event.event_type] ?? event.event_type,
        who: event.provider_label || 'a doctor',
        reason: event.reason,
        shared:
          describePermissions(details.permissions_at_revocation) ??
          describePermissions(details.permissions),
      });
    }

    // Hospitals: the row is the history. Two entries at most per connection —
    // when it started, and when it ended.
    for (const share of institutionShares) {
      const name = share.institution?.name ?? 'a hospital';
      if (share.connected_at) {
        out.push({
          id: `practice-${share.id}-connected`,
          at: share.connected_at,
          kind: 'hospital',
          label: 'You connected to',
          who: name,
          shared: describePermissions(share.permissions),
        });
      }
      if (share.revoked_at) {
        out.push({
          id: `practice-${share.id}-revoked`,
          at: share.revoked_at,
          kind: 'hospital',
          label: 'You disconnected from',
          who: name,
          reason: share.revoke_reason ?? null,
        });
      }
    }

    return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [shareEvents, institutionShares]);

  return { entries, isLoading: loadingEvents || loadingInstitutions };
}
