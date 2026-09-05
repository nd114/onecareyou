/**
 * What the contact form checks before it sends.
 *
 * The form used to lean on the browser: `required` on four inputs, `type=email`
 * on one. That gives a grey native bubble on the first empty field, one at a
 * time, in the browser's own wording — while every other form in the app marks
 * the field red and writes the reason underneath. Two error systems on one
 * site, and neither of them covers the "What is it about" select, which is a
 * Radix listbox that `required` cannot see.
 */

export interface ContactDraft {
  name: string;
  email: string;
  inquiryType: string;
  subject: string;
  message: string;
}

export type ContactField = keyof ContactDraft;

/** Tab order, so the first complaint is the topmost one. */
export const CONTACT_FIELD_ORDER: ContactField[] = [
  'name',
  'email',
  'inquiryType',
  'subject',
  'message',
];

export const CONTACT_LIMITS: Record<ContactField, number> = {
  name: 200,
  email: 320,
  inquiryType: 40,
  subject: 300,
  message: 10000,
};

// Deliberately loose: something, an @, something, a dot, something. Anything
// stricter rejects addresses that exist.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContactDraft(
  draft: ContactDraft,
  allowedTypes: readonly string[],
): Partial<Record<ContactField, string>> {
  const errors: Partial<Record<ContactField, string>> = {};

  const name = draft.name.trim();
  if (!name) errors.name = 'Tell us who you are.';
  else if (name.length > CONTACT_LIMITS.name) errors.name = 'That name is too long.';

  const email = draft.email.trim();
  if (!email) errors.email = 'We need an address to reply to.';
  else if (email.length > CONTACT_LIMITS.email) errors.email = 'That address is too long.';
  else if (!EMAIL.test(email)) errors.email = 'That does not look like an email address.';

  if (!allowedTypes.includes(draft.inquiryType)) errors.inquiryType = 'Pick what this is about.';

  const subject = draft.subject.trim();
  if (!subject) errors.subject = 'A one-line subject helps us route this.';
  else if (subject.length > CONTACT_LIMITS.subject) errors.subject = 'That subject is too long.';

  const message = draft.message.trim();
  if (!message) errors.message = 'Tell us what is going on.';
  else if (message.length > CONTACT_LIMITS.message)
    errors.message = `Keep it under ${CONTACT_LIMITS.message.toLocaleString()} characters.`;

  return errors;
}

/** The field to send focus to, or null when there is nothing to fix. */
export function firstContactError(
  errors: Partial<Record<ContactField, string>>,
): ContactField | null {
  return CONTACT_FIELD_ORDER.find((field) => errors[field]) ?? null;
}
