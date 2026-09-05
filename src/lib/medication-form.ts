import { MEDICATION_FREQUENCIES, type MedicationType } from '@/types/health';

/**
 * Whether an "add medication" form is ready to save.
 *
 * The form marked Type and Frequency with an asterisk and put `required` on
 * the text inputs, but Type and Frequency are shadcn Selects — Radix
 * components, not native `<select>` elements — so `required` never applied to
 * them and neither did the browser's own check. The form submitted with both
 * empty, and the handler then did this:
 *
 *     type: formData.type || 'prescription',
 *     frequency: formData.frequency,
 *
 * A blank type became "prescription", which is a clinical claim nobody made.
 * And a blank frequency was stored as an empty string.
 *
 * That second one is the harm. Frequency is what picks the dose times, so a
 * medication saved without it has no schedule, generates no reminders, and
 * sits in the list looking complete while never once telling the patient to
 * take it. Somebody who adds a new medicine and trusts the app to remind them
 * is exactly the person this fails.
 *
 * Pure, so the rules can be tested without rendering a form.
 */

export interface MedicationDraft {
  name: string;
  type: MedicationType | '';
  dosage: string;
  frequency: string;
  times_of_day: string[];
}

/** Keyed by field so the message can sit against the control it is about. */
export type MedicationFormErrors = Partial<Record<keyof MedicationDraft, string>>;

const FREQUENCY_VALUES = new Set(MEDICATION_FREQUENCIES.map((f) => f.value));

export function validateMedicationDraft(draft: MedicationDraft): MedicationFormErrors {
  const errors: MedicationFormErrors = {};

  if (!draft.name.trim()) {
    errors.name = 'What is the medicine called?';
  }

  if (!draft.type) {
    // Not defaulted. "Prescription" is a claim about who told them to take it.
    errors.type = 'Choose a type — a medicine you were prescribed and one you bought are different things.';
  }

  if (!draft.dosage.trim()) {
    errors.dosage = 'How much do you take? For example 500mg, or one tablet.';
  }

  if (!draft.frequency) {
    errors.frequency = 'How often do you take it? Without this there are no reminders.';
  } else if (!FREQUENCY_VALUES.has(draft.frequency)) {
    errors.frequency = 'That is not a schedule we can set reminders for.';
  }

  // A frequency with no times is the same silent failure by another route.
  const expected = MEDICATION_FREQUENCIES.find((f) => f.value === draft.frequency);
  if (expected && expected.timesPerDay > 0) {
    const times = draft.times_of_day.filter((t) => /^\d{2}:\d{2}$/.test(t));
    if (times.length === 0) {
      errors.times_of_day = 'Set at least one time, or no reminder can be sent.';
    }
  }

  return errors;
}

export function isMedicationDraftValid(draft: MedicationDraft): boolean {
  return Object.keys(validateMedicationDraft(draft)).length === 0;
}

/**
 * The first field with a problem, so focus can go there.
 *
 * In form order rather than object order: sending somebody to the last error
 * on the page when the first one is at the top is its own small cruelty.
 */
export const MEDICATION_FIELD_ORDER: (keyof MedicationDraft)[] = [
  'name',
  'type',
  'dosage',
  'frequency',
  'times_of_day',
];

export function firstMedicationError(errors: MedicationFormErrors): keyof MedicationDraft | null {
  return MEDICATION_FIELD_ORDER.find((field) => errors[field]) ?? null;
}
