/**
 * How one row of the clinician notification table reads in the bell.
 *
 * The table carries two kinds of notice. Guidance notices point at a guidance
 * row and are worded here from its title and the patient's name. Share-ended
 * and routing notices carry their own message, written by the database at the
 * moment of the event; they must be shown as written, because by the time the
 * bell opens the recipient may no longer be able to look the patient up at all,
 * and a fallback such as "Update from Patient" would hide what happened.
 */

export type NotificationType =
  | 'acknowledged'
  | 'completed'
  | 'expired'
  | 'dismissed'
  | 'share_ended'
  | 'routed_outside_department'
  | 'departed_author_drafts';

export interface NotificationForDisplay {
  notification_type: string;
  message?: string | null;
  acknowledged_at?: string | null;
  guidance?: { title: string } | null;
  patient_profile?: { name: string | null } | null;
}

export interface NotificationDisplay {
  title: string;
  body: string;
  /** Whether the Acknowledge action applies. The server decides who may use it. */
  acknowledgeable: boolean;
  /** Where clicking the notice should take the reader, if anywhere. */
  href: string | null;
}

/** Types whose words come from the database rather than from this file. */
export const SELF_DESCRIBING_TYPES: readonly string[] = [
  'share_ended',
  'routed_outside_department',
  'departed_author_drafts',
];

export function describeNotification(n: NotificationForDisplay): NotificationDisplay {
  const name = n.patient_profile?.name || 'Patient';
  switch (n.notification_type) {
    case 'share_ended':
      return {
        title: 'Stopped sharing',
        body: n.message || 'A patient stopped sharing. No further updates will be transmitted.',
        acknowledgeable: false,
        // Deliberately nowhere: the patient's record is no longer open to them.
        href: null,
      };
    case 'routed_outside_department':
      return {
        title: n.acknowledged_at ? 'Routing acknowledged' : 'Routing outside a department',
        body: n.message || 'A department lead routed a patient outside their department.',
        acknowledgeable: !n.acknowledged_at,
        href: '/practice',
      };
    case 'departed_author_drafts':
      // Closed by deciding about the draft, not by an Acknowledge button: the
      // notice is the handover, and it stays open until someone takes it.
      return {
        title: n.acknowledged_at ? 'Draft resolved' : 'Unsigned — author departed',
        body: n.message || 'A colleague left the practice with unfinished work for one of your patients.',
        acknowledgeable: false,
        href: '/clinician/practice/routing',
      };
    case 'completed':
      return { title: n.guidance?.title || 'Guidance Update', body: `${name} completed your guidance`, acknowledgeable: false, href: '/clinician/patients' };
    case 'acknowledged':
      return { title: n.guidance?.title || 'Guidance Update', body: `${name} acknowledged your guidance`, acknowledgeable: false, href: '/clinician/patients' };
    case 'expired':
      return { title: n.guidance?.title || 'Guidance Update', body: `Guidance for ${name} has expired`, acknowledgeable: false, href: '/clinician/patients' };
    case 'dismissed':
      return { title: n.guidance?.title || 'Guidance Update', body: `${name} dismissed your guidance`, acknowledgeable: false, href: '/clinician/patients' };
    default:
      return { title: n.guidance?.title || 'Update', body: n.message || `Update from ${name}`, acknowledgeable: false, href: null };
  }
}
