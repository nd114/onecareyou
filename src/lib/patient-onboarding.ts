/**
 * What a patient should do first, and what they have already done.
 *
 * The clinician side has had a checklist on Today since launch. Patients had
 * nothing: /onboarding asks for a profile and then drops you on a dashboard
 * that assumes you know what the product is for. The four steps below are the
 * ones that turn an empty account into a useful record — and the last is the
 * whole point of the thing, so it is never hidden behind the others.
 *
 * Pure, so the order and the wording can be tested without a database.
 */

export interface PatientOnboardingFacts {
  /** Health basics: conditions, allergies, an emergency contact. */
  hasHealthProfile: boolean;
  hasLoggedVital: boolean;
  hasMedication: boolean;
  /** Shared their record with at least one clinician or hospital. */
  hasShared: boolean;
}

export interface PatientOnboardingStep {
  id: keyof PatientOnboardingFacts;
  label: string;
  description: string;
  href: string;
  actionLabel: string;
  completed: boolean;
}

const STEPS: Omit<PatientOnboardingStep, 'completed'>[] = [
  {
    id: 'hasHealthProfile',
    label: 'Add your health basics',
    description:
      'Conditions, allergies and who to call in an emergency. This is what a clinician needs first.',
    href: '/onboarding',
    actionLabel: 'Fill this in',
  },
  {
    id: 'hasLoggedVital',
    label: 'Log a reading',
    description: 'A blood pressure, a weight, a blood sugar — whatever you already measure.',
    href: '/vitals',
    actionLabel: 'Log a reading',
  },
  {
    id: 'hasMedication',
    label: 'Add a medicine you take',
    description: 'You get reminders, and anyone you share with can see what you are on.',
    href: '/medications/add',
    actionLabel: 'Add a medicine',
  },
  {
    id: 'hasShared',
    label: 'Share with your doctor',
    description:
      'Choose exactly what they can see, and end it whenever you want. Nothing is shared until you say so.',
    href: '/care-circle',
    actionLabel: 'Open Care Circle',
  },
];

export function patientOnboardingSteps(facts: PatientOnboardingFacts): PatientOnboardingStep[] {
  return STEPS.map((step) => ({ ...step, completed: !!facts[step.id] }));
}

/** The one to nudge: the first thing still outstanding, or nothing at all. */
export function nextPatientStep(
  facts: PatientOnboardingFacts,
): PatientOnboardingStep | null {
  return patientOnboardingSteps(facts).find((s) => !s.completed) ?? null;
}

export function patientOnboardingProgress(facts: PatientOnboardingFacts): {
  completed: number;
  total: number;
  isComplete: boolean;
} {
  const steps = patientOnboardingSteps(facts);
  const completed = steps.filter((s) => s.completed).length;
  return { completed, total: steps.length, isComplete: completed === steps.length };
}

/**
 * Whether to show the card at all.
 *
 * Away once they have done everything, and away once they have put it away —
 * a checklist that will not leave is nagging rather than helping.
 */
export function shouldShowGettingStarted(
  facts: PatientOnboardingFacts,
  dismissedAt: string | null | undefined,
): boolean {
  if (dismissedAt) return false;
  return !patientOnboardingProgress(facts).isComplete;
}
