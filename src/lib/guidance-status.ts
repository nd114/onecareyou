/**
 * A clinician's instruction, and what happens when they take it back.
 *
 * The bin on a guidance row ran a hard DELETE. That destroyed the instruction,
 * the patient's acknowledgement of it, the record that it was completed, and —
 * through ON DELETE CASCADE — the notification trail as well, from one click,
 * with no confirmation and nothing to undo it. Everywhere else in this app
 * ending something is an event rather than a deletion: a share is revoked and
 * kept, an appointment is cancelled and kept, a message thread survives the
 * relationship that produced it. Guidance was the exception.
 *
 * Archiving needs somewhere to remember what the row was before, and the row
 * already knows: acknowledged_at and completed_at are the events themselves.
 * The status column is a summary of them, so it can be rebuilt exactly, and no
 * new column is needed to make this reversible.
 */

export type GuidanceStatus = 'pending' | 'acknowledged' | 'completed' | 'archived';

export const ARCHIVED_STATUS = 'archived';

export interface GuidanceHistory {
  acknowledged_at?: string | null;
  completed_at?: string | null;
}

/** True for a row the clinician has withdrawn. */
export function isArchivedGuidance(row: { status?: string | null }): boolean {
  return row.status === ARCHIVED_STATUS;
}

/**
 * The status a row should carry, read from what actually happened to it.
 * Completion outranks acknowledgement: you cannot complete without seeing it,
 * and a completed instruction that came back as merely "acknowledged" would
 * ask the patient to do something they have already done.
 */
export function statusFromHistory(row: GuidanceHistory): GuidanceStatus {
  if (row.completed_at) return 'completed';
  if (row.acknowledged_at) return 'acknowledged';
  return 'pending';
}
