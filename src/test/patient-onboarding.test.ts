import { describe, it, expect } from 'vitest';
import {
  patientOnboardingSteps,
  nextPatientStep,
  patientOnboardingProgress,
  shouldShowGettingStarted,
  type PatientOnboardingFacts,
} from '@/lib/patient-onboarding';

const nothing: PatientOnboardingFacts = {
  hasHealthProfile: false,
  hasLoggedVital: false,
  hasMedication: false,
  hasShared: false,
};
const everything: PatientOnboardingFacts = {
  hasHealthProfile: true,
  hasLoggedVital: true,
  hasMedication: true,
  hasShared: true,
};

describe('patientOnboardingSteps', () => {
  it('offers four steps, in the order they make sense', () => {
    const steps = patientOnboardingSteps(nothing);
    expect(steps.map((s) => s.id)).toEqual([
      'hasHealthProfile',
      'hasLoggedVital',
      'hasMedication',
      'hasShared',
    ]);
  });

  it('sends every step somewhere real', () => {
    for (const step of patientOnboardingSteps(nothing)) {
      expect(step.href.startsWith('/'), step.id).toBe(true);
      expect(step.actionLabel.length, step.id).toBeGreaterThan(0);
      expect(step.description.length, step.id).toBeGreaterThan(0);
    }
  });

  it('marks off what has been done', () => {
    const steps = patientOnboardingSteps({ ...nothing, hasLoggedVital: true });
    expect(steps.find((s) => s.id === 'hasLoggedVital')!.completed).toBe(true);
    expect(steps.find((s) => s.id === 'hasMedication')!.completed).toBe(false);
  });
});

describe('nextPatientStep', () => {
  it('is the first thing still outstanding', () => {
    expect(nextPatientStep(nothing)!.id).toBe('hasHealthProfile');
    expect(nextPatientStep({ ...nothing, hasHealthProfile: true })!.id).toBe('hasLoggedVital');
  });

  it('skips ahead over anything already done', () => {
    expect(
      nextPatientStep({ ...everything, hasShared: false })!.id,
    ).toBe('hasShared');
  });

  it('is nothing once there is nothing left', () => {
    expect(nextPatientStep(everything)).toBeNull();
  });
});

describe('patientOnboardingProgress', () => {
  it('counts', () => {
    expect(patientOnboardingProgress(nothing)).toEqual({ completed: 0, total: 4, isComplete: false });
    expect(patientOnboardingProgress(everything)).toEqual({ completed: 4, total: 4, isComplete: true });
  });
});

describe('shouldShowGettingStarted', () => {
  it('shows while there is something to do', () => {
    expect(shouldShowGettingStarted(nothing, null)).toBe(true);
    expect(shouldShowGettingStarted({ ...nothing, hasHealthProfile: true }, null)).toBe(true);
  });

  it('goes away once everything is done, without being dismissed', () => {
    expect(shouldShowGettingStarted(everything, null)).toBe(false);
  });

  it('goes away when it is put away, even with steps outstanding', () => {
    // A checklist that will not leave is nagging rather than helping.
    expect(shouldShowGettingStarted(nothing, '2026-09-01T10:00:00Z')).toBe(false);
  });

  it('treats undefined as never dismissed', () => {
    expect(shouldShowGettingStarted(nothing, undefined)).toBe(true);
  });
});
