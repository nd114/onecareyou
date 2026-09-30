import { formatDay } from '@/lib/format-date';
import { CAREGIVERS_ENABLED } from '@/lib/features';
import { CAREGIVER_CONTACTS_PATH } from '@/lib/clinician-disclosure';

/**
 * Whether a patient can write in a conversation, and what to tell them when
 * they cannot.
 *
 * The composer used to stay open after a share ended, expired, or the
 * hospital took a clinician off the patient's care, and whatever the patient
 * wrote was read by nobody. The database now refuses those messages
 * (20261010090000); `my_message_counterparties()` reports the same answer the
 * policy gives, and this turns it into the sentence the patient sees instead
 * of a composer, with the obvious next step.
 *
 * A hospital thread is the hospital's (20261010070000): its notices name the
 * hospital, and once its clinician has gone the conversation is titled with
 * the hospital's name rather than theirs (20261010100000). The sentences used
 * to be written as if the other side were always a clinician, which told a
 * patient to "share with Dr X again" when the share was with a hospital and
 * Dr X no longer worked there.
 */

export type ThreadReason =
  | 'open'
  | 'covered'
  | 'sharing_stopped'
  | 'share_expired'
  | 'not_a_clinician'
  | 'practice_paused'
  | 'clinician_left'
  | 'not_on_care_team'
  | 'no_connection';

/** For a hospital thread, where its clinician stands at that hospital now. */
export type ClinicianStatus = 'active' | 'left' | 'non_clinical';

export interface ContinuingClinician {
  userId: string;
  name: string;
}

export interface MessageCounterparty {
  clinicianUserId: string;
  clinicianName: string;
  practiceId: string | null;
  practiceName: string | null;
  canSend: boolean;
  reason: ThreadReason;
  endedAt: string | null;
  endedByPatient: boolean;
  continuesWith: ContinuingClinician[];
  /** Null for a private thread. */
  clinicianStatus: ClinicianStatus | null;
}

export interface ThreadNoticeAction {
  label: string;
  /** A page to go to. */
  to?: string;
  /** Or another conversation on this screen to open. */
  clinicianUserId?: string;
}

export interface ThreadNotice {
  text: string;
  action?: ThreadNoticeAction;
}

const KNOWN_REASONS: ThreadReason[] = [
  'open', 'covered', 'sharing_stopped', 'share_expired', 'not_a_clinician',
  'practice_paused', 'clinician_left', 'not_on_care_team', 'no_connection',
];

const KNOWN_STATUSES: ClinicianStatus[] = ['active', 'left', 'non_clinical'];

const CANT_SEND = "Messages can't be sent in this conversation.";

/** "Dr A", "Dr A and Dr B", "Dr A, Dr B and Dr C". */
function listNames(people: ContinuingClinician[]): string {
  const names = people.map((p) => p.name);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function onDate(iso: string | null): string {
  return iso ? ` on ${formatDay(iso)}` : '';
}

function messageFirst(people: ContinuingClinician[]): ThreadNoticeAction | undefined {
  const first = people[0];
  return first ? { label: `Message ${first.name}`, clinicianUserId: first.userId } : undefined;
}

/** A hospital thread: the conversation belongs to the hospital. */
function isHospital(c: MessageCounterparty): boolean {
  return !!c.practiceId;
}

/** A hospital thread whose clinician no longer sees patients there. */
function clinicianGone(c: MessageCounterparty): boolean {
  return isHospital(c) && (c.clinicianStatus === 'left' || c.clinicianStatus === 'non_clinical');
}

/** "Dr X has left", or "Dr X no longer sees patients at", said of a hospital. */
function whereTheyWent(c: MessageCounterparty, name: string, place: string): string {
  return c.clinicianStatus === 'non_clinical'
    ? `${name} no longer sees patients at ${place}`
    : `${name} has left ${place}`;
}

/**
 * What the conversation is called in the list and above the thread. A
 * hospital thread whose clinician has gone is the hospital's conversation now,
 * so it carries the hospital's name, not the name of someone who is not there.
 */
export function conversationTitle(c: MessageCounterparty): string {
  if (clinicianGone(c) && c.practiceName) return c.practiceName;
  return c.clinicianName || 'Your clinician';
}

/** The line under the title: who the conversation began with, or where. */
export function conversationSubtitle(c: MessageCounterparty): string | undefined {
  if (clinicianGone(c) && c.practiceName) return `Began with ${c.clinicianName}`;
  if (isHospital(c) && c.practiceName) return c.practiceName;
  return undefined;
}

/**
 * What to show above (covered) or instead of (every closed reason) the
 * composer. Null when there is nothing to say.
 */
export function threadNotice(c: MessageCounterparty): ThreadNotice | null {
  const name = c.clinicianName || 'this clinician';
  const place = c.practiceName || 'the hospital';
  const hospital = isHospital(c);

  switch (c.reason) {
    case 'open':
      return null;

    case 'covered': {
      const team = c.continuesWith.length
        ? `, including ${listNames(c.continuesWith)}`
        : '';
      return {
        text: `${whereTheyWent(c, name, place)}. Messages here are read by the team looking after you at ${place}${team}.`,
        action: messageFirst(c.continuesWith),
      };
    }

    case 'sharing_stopped': {
      // The share that ended is with the hospital, not with whoever wrote.
      const who = hospital ? place : name;
      const lead = c.endedByPatient
        ? `You stopped sharing with ${who}${onDate(c.endedAt)}.`
        : `Sharing with ${who} ended${onDate(c.endedAt)}.`;
      return {
        text: `${lead} ${CANT_SEND}`,
        action: { label: `Share with ${who} again`, to: '/care-circle' },
      };
    }

    case 'share_expired':
      return {
        text: `Your share with ${name} expired${onDate(c.endedAt)}. ${CANT_SEND}`,
        action: { label: `Share with ${name} again`, to: '/care-circle' },
      };

    case 'not_a_clinician':
      // Pointing to alert contacts only while caregivers are offered at all.
      return CAREGIVERS_ENABLED
        ? {
            text: `${name} doesn't have a clinician account, so nobody can read messages sent here. To keep someone who cares for you in the loop, add them as an alert contact instead.`,
            action: { label: 'Add someone who cares for you', to: CAREGIVER_CONTACTS_PATH },
          }
        : {
            text: `${name} doesn't have a clinician account, so nobody can read messages sent here. ${CANT_SEND}`,
          };

    case 'practice_paused':
      return {
        text: `${place} has paused its access to your record, so ${CANT_SEND.charAt(0).toLowerCase()}${CANT_SEND.slice(1)} Please contact ${place} directly if you need them.`,
      };

    case 'clinician_left':
      // Nobody at the hospital would read it. Say that about the hospital.
      return {
        text: `${place} has no one assigned to your care right now, so ${CANT_SEND.charAt(0).toLowerCase()}${CANT_SEND.slice(1)} ${whereTheyWent(c, name, place)}. Please contact ${place} directly if you need them.`,
      };

    case 'not_on_care_team': {
      if (c.continuesWith.length) {
        return {
          text: `${name} is no longer on your care team at ${place}. Your care there continues with ${listNames(c.continuesWith)}. ${CANT_SEND}`,
          action: messageFirst(c.continuesWith),
        };
      }
      return {
        text: `${name} is no longer on your care team at ${place}, and ${place} has no one else assigned to your care right now. ${CANT_SEND} Please contact ${place} directly if you need them.`,
      };
    }

    case 'no_connection':
    default:
      return {
        text: `You're no longer connected with ${hospital ? place : name}. ${CANT_SEND}`,
        action: { label: 'Open Care Circle', to: '/care-circle' },
      };
  }
}

/** Shapes a row of `my_message_counterparties()`; unknown reasons read as closed. */
export function toMessageCounterparty(row: Record<string, unknown>): MessageCounterparty {
  const reason = KNOWN_REASONS.includes(row.reason as ThreadReason)
    ? (row.reason as ThreadReason)
    : 'no_connection';
  const continuing = Array.isArray(row.continues_with) ? (row.continues_with as Record<string, unknown>[]) : [];
  return {
    clinicianUserId: String(row.clinician_user_id),
    clinicianName: (row.clinician_name as string) || 'Your clinician',
    practiceId: (row.practice_id as string) ?? null,
    practiceName: (row.practice_name as string) ?? null,
    // Closed unless the server said open: a missing answer must not reopen a
    // composer whose messages would go unread.
    canSend: row.can_send === true,
    reason,
    endedAt: (row.ended_at as string) ?? null,
    endedByPatient: row.ended_by_patient === true,
    continuesWith: continuing
      .filter((p) => typeof p?.user_id === 'string')
      .map((p) => ({ userId: p.user_id as string, name: (p.name as string) || 'A clinician' })),
    clinicianStatus: KNOWN_STATUSES.includes(row.clinician_status as ClinicianStatus)
      ? (row.clinician_status as ClinicianStatus)
      : null,
  };
}
