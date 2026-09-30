/**
 * A clinician's instruction, and what happens when they take it back.
 *
 * Guidance is permanent once sent (20261010160000_guidance_and_evidence_are_kept):
 * the patient may have acted on it before acknowledging anything, so nobody
 * deletes it and nobody rewrites it. A clinician who issued it in error
 * withdraws it with a reason. The row keeps what was said and gains who took
 * it back, when and why; the patient is told; and a withdrawal is final.
 *
 * This replaces an "archive" that could be restored and carried no reason. A
 * patient who acted on an instruction, saw it disappear and then saw it come
 * back had no way to tell what their clinician had actually meant.
 */
import { format } from 'date-fns';

export type GuidanceStatus = 'pending' | 'acknowledged' | 'completed' | 'archived';

/** The status a withdrawn row carries; the withdrawal itself is in withdrawn_at. */
export const ARCHIVED_STATUS = 'archived';

export interface GuidanceWithdrawal {
  status?: string | null;
  withdrawn_at?: string | null;
  withdrawal_reason?: string | null;
}

/** True for a row the clinician has withdrawn. */
export function isWithdrawnGuidance(row: GuidanceWithdrawal): boolean {
  return !!row.withdrawn_at || row.status === ARCHIVED_STATUS;
}

/**
 * The line shown wherever a withdrawn instruction appears, to either party:
 * "Withdrawn by Dr Okafor on 3 Oct 2026: meant for another patient". Rows
 * archived before reasons were kept say so rather than showing nothing.
 */
export function describeWithdrawal(row: GuidanceWithdrawal, byName?: string | null): string {
  const who = byName?.trim() ? byName.trim() : 'your clinician';
  const when = row.withdrawn_at ? ` on ${format(new Date(row.withdrawn_at), 'd MMM yyyy')}` : '';
  const why = row.withdrawal_reason?.trim()
    ? row.withdrawal_reason.trim()
    : 'no reason was recorded (withdrawn before reasons were kept)';
  return `Withdrawn by ${who}${when}: ${why}`;
}
