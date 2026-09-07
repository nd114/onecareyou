/**
 * What OneCare can notify someone about, and how.
 *
 * The rule that produced this file: **a category exists here only if something
 * actually sends it.** The settings screen before this offered "email
 * notifications" and "weekly adherence report". No sender read the first, and
 * nothing sent the second — it gated an in-app report. Both were controls over
 * mail that did not exist, which is the same failure as a switch nothing reads.
 * So every entry below names its producer, and adding one without a producer is
 * the mistake this comment exists to prevent.
 *
 * Two other decisions worth stating:
 *
 * **Mandatory categories are shown, not hidden.** A patient cannot switch off
 * the email confirming their account, and a clinician should not be able to
 * silence a threshold breach by accident. Hiding those makes the list look
 * shorter and leaves the person wondering why mail still arrives. They appear,
 * marked, with the reason.
 *
 * **One accessor decides.** `notification_allowed()` in the database is what
 * every sender calls. A preference each sender remembers to check independently
 * is exactly how the old one came to be honoured by none of them.
 *
 * Imports nothing, so it runs in Deno (the senders) and in the browser test
 * suite.
 */

export type NotificationChannel = "email" | "push" | "in_app";

/** Which kind of account a category is offered to. */
export type NotificationAudience = "patient" | "clinician";

export interface NotificationCategory {
  key: string;
  audience: NotificationAudience[];
  /** Channels this category can actually be delivered on today. */
  channels: NotificationChannel[];
  /** On unless the person turns it off. */
  defaultEnabled: boolean;
  /**
   * Cannot be turned off. Reserved for messages a person needs in order to use
   * or keep their account, and for clinical safety.
   */
  mandatory?: boolean;
  label: string;
  description: string;
  /** Why it cannot be switched off. Shown next to a mandatory category. */
  mandatoryReason?: string;
  /** The code that sends it. Keeps this file honest. */
  producer: string;
}

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  {
    key: "medication_reminders",
    audience: ["patient"],
    channels: ["push"],
    defaultEnabled: true,
    label: "Medicine reminders",
    description: "A reminder on this device when a dose is due.",
    producer: "useMedicationReminders (browser notification)",
  },
  {
    key: "care_circle_missed_doses",
    audience: ["patient"],
    channels: ["email"],
    defaultEnabled: true,
    label: "Missed dose alerts to your care circle",
    description:
      "An email to the people you have named, when doses are missed. Turning this off stops those emails.",
    producer: "check-care-alerts",
  },
  {
    key: "adherence_report",
    audience: ["patient"],
    channels: ["in_app"],
    defaultEnabled: true,
    label: "Adherence report",
    description: "The dose-taking summary on your adherence page.",
    producer: "useAdherenceReport (in-app only — nothing is emailed)",
  },
  {
    key: "patient_vital_alert",
    audience: ["clinician"],
    channels: ["email"],
    defaultEnabled: true,
    mandatory: true,
    label: "Patient threshold alerts",
    description:
      "An email when a patient's reading breaches an alert rule you set.",
    mandatoryReason:
      "You set these thresholds because the reading matters. A rule that can be muted somewhere else is a rule you cannot rely on.",
    producer: "check-vital-alerts",
  },
  {
    key: "practice_activity",
    audience: ["clinician"],
    channels: ["in_app"],
    defaultEnabled: true,
    label: "Practice activity",
    description: "Tasks, referrals and team notes, in the app.",
    producer: "clinician_notifications",
  },
  {
    key: "account_security",
    audience: ["patient", "clinician"],
    channels: ["email"],
    defaultEnabled: true,
    mandatory: true,
    label: "Account and security",
    description:
      "Sign-in confirmations, invitations, and anything about the security of your account.",
    mandatoryReason:
      "These are how you keep control of the account. They are not marketing and there is no version of this you would want switched off.",
    producer: "send-welcome-email, notify-practice-invite, notify-tenant-owner-invite",
  },
] as const;

export function categoriesFor(audience: NotificationAudience): NotificationCategory[] {
  return NOTIFICATION_CATEGORIES.filter((c) => c.audience.includes(audience));
}

export function findCategory(key: string): NotificationCategory | undefined {
  return NOTIFICATION_CATEGORIES.find((c) => c.key === key);
}

/**
 * Whether a notification may be sent, given whatever the person has stored.
 *
 * The client mirror of the database function, so the settings screen and the
 * senders answer the same way. Unknown category or unsupported channel is a
 * refusal rather than a default-allow: a sender asking about something this
 * file does not describe is a bug, and sending anyway would hide it.
 */
export function notificationAllowed(
  categoryKey: string,
  channel: NotificationChannel,
  stored: { enabled: boolean } | null | undefined,
): boolean {
  const category = findCategory(categoryKey);
  if (!category) return false;
  if (!category.channels.includes(channel)) return false;
  if (category.mandatory) return true;
  return stored ? stored.enabled : category.defaultEnabled;
}
