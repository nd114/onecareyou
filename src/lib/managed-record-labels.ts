/**
 * Words for a managed record's two states.
 *
 * Both were being rendered by underscore-replacement — `clinician_managed`
 * became "clinician managed", which is a token wearing a label's clothes. And
 * the invitation badge had a binary fallback: "Invited" for exactly `invited`,
 * "Accepted" for everything else. `invitation_status` has no CHECK constraint
 * behind it, so anything an import or a later migration writes would have been
 * presented to a clinician as consent the patient had given.
 *
 * A consent state nobody recognises is not consent. It says so.
 */

export type DataSharingModel = 'clinician_managed' | 'collaborative' | 'view_only';
export type InvitationStatus = 'not_invited' | 'invited' | 'accepted' | 'declined';

const SHARING_MODEL_LABELS: Record<DataSharingModel, string> = {
  clinician_managed: 'You keep this record',
  collaborative: 'Shared with the patient',
  view_only: 'Patient can view',
};

const INVITATION_LABELS: Record<InvitationStatus, string> = {
  not_invited: 'Not invited',
  invited: 'Invited',
  accepted: 'Accepted',
  declined: 'Declined',
};

export function describeSharingModel(model?: string | null): string {
  if (!model) return 'Sharing not set';
  return SHARING_MODEL_LABELS[model as DataSharingModel] ?? 'Sharing not set';
}

export function describeInvitationStatus(status?: string | null): string {
  if (!status) return 'Invitation unknown';
  return INVITATION_LABELS[status as InvitationStatus] ?? 'Invitation unknown';
}

/** Whether the patient has actually agreed. Never true for a status we do not know. */
export function patientHasAccepted(status?: string | null): boolean {
  return status === 'accepted';
}
