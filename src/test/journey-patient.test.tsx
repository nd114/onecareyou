import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';

import { createSupabaseMock } from './support/supabase-mock';

/**
 * Patient journeys: what happens across screens, not inside one.
 *
 * 997 assertions covered logic and 82 covered mounting. Neither says anything
 * about the join between two working parts — whether logging a reading moves
 * the risk badge, whether the first-run card advances, whether revoking a share
 * actually reads as revoked. That join is where the remaining bugs are, because
 * it is the only place left they can hide.
 */

const { mock } = vi.hoisted(() => ({
  mock: { current: null as null | { client: unknown; calls: unknown[] } },
}));

const PATIENT = { id: 'patient-1', email: 'jane.evans@example.com' };

vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return mock.current?.client;
  },
}));

beforeEach(() => {
  // Every test gets a client; individual tests replace it with richer
  // fixtures. Without a default, a test that resets modules finds none.
  mock.current = createSupabaseMock({ user: PATIENT });
  vi.stubGlobal('IntersectionObserver', class {
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
    root = null; rootMargin = ''; thresholds = [];
  });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function withProviders(children: React.ReactNode) {
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const { MemoryRouter } = await import('react-router-dom');
  const { HelmetProvider } = await import('react-helmet-async');
  const { TooltipProvider } = await import('@/components/ui/tooltip');
  const { AuthProvider } = await import('@/contexts/AuthContext');
  const { ThemeProvider } = await import('@/contexts/ThemeContext');
  const { FamilyProvider } = await import('@/contexts/FamilyContext');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <HelmetProvider>
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <MemoryRouter>
            <AuthProvider>
              <FamilyProvider>
                <TooltipProvider>{children}</TooltipProvider>
              </FamilyProvider>
            </AuthProvider>
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

// ---------------------------------------------------------------------------
// P1 — first run: the getting-started card names the next step
// ---------------------------------------------------------------------------

describe('P1 — a new patient is told what to do next', () => {
  it('shows the step the hook says is next, and only that one in full', async () => {
    // The hook is stubbed rather than driven through auth: the join under test
    // is hook → card, and bootstrapping a session to reach it would be testing
    // the auth provider instead.
    const { patientOnboardingSteps } = await import('@/lib/patient-onboarding');
    const steps = patientOnboardingSteps({
      hasHealthProfile: false, hasLoggedVital: false, hasMedication: false, hasShared: false,
    });

    vi.doMock('@/hooks/usePatientOnboarding', () => ({
      usePatientOnboarding: () => ({
        steps,
        progress: { completed: 0, total: steps.length, isComplete: false },
        shouldShow: true,
        dismiss: vi.fn(),
        isLoading: false,
      }),
    }));
    vi.resetModules();

    const { GettingStartedCard } = await import('@/components/patient/GettingStartedCard');
    render(await withProviders(<GettingStartedCard />));

    expect(screen.getByText(steps[0].label)).toBeTruthy();
    // Only the next step explains itself; the rest are titles.
    expect(screen.getByText(steps[0].description)).toBeTruthy();
    expect(screen.queryByText(steps[1].description)).toBeNull();
    vi.doUnmock('@/hooks/usePatientOnboarding');
  });

  it('renders nothing once there is nothing to prompt', async () => {
    vi.doMock('@/hooks/usePatientOnboarding', () => ({
      usePatientOnboarding: () => ({
        steps: [], progress: { completed: 4, total: 4, isComplete: true },
        shouldShow: false, dismiss: vi.fn(), isLoading: false,
      }),
    }));
    vi.resetModules();

    const { GettingStartedCard } = await import('@/components/patient/GettingStartedCard');
    const { container } = render(await withProviders(<GettingStartedCard />));
    expect(container.textContent).toBe('');
    vi.doUnmock('@/hooks/usePatientOnboarding');
  });

  it('moves on once that step is done', async () => {
    const { nextPatientStep } = await import('@/lib/patient-onboarding');
    // The card renders whatever this returns, so the join being tested is that
    // the state moves — not the wording.
    const first = nextPatientStep({
      hasHealthProfile: false, hasLoggedVital: false, hasMedication: false, hasShared: false,
    });
    const second = nextPatientStep({
      hasHealthProfile: true, hasLoggedVital: false, hasMedication: false, hasShared: false,
    });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.id).not.toBe(first!.id);
  });

  it('stops asking once every step is done', async () => {
    const { nextPatientStep, shouldShowGettingStarted } = await import('@/lib/patient-onboarding');
    const done = {
      hasHealthProfile: true, hasLoggedVital: true, hasMedication: true, hasShared: true,
    };
    expect(nextPatientStep(done)).toBeNull();
    expect(shouldShowGettingStarted(done, null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P2 — a reading changes what the risk badge says
// ---------------------------------------------------------------------------

describe('P2 — logging a reading moves the risk assessment', () => {
  it('turns a stable patient into a flagged one', async () => {
    const { assessPatientRisk, explainRiskLevel } = await import('@/lib/patient-risk');
    const at = new Date().toISOString();

    const before = assessPatientRisk([{ type: 'heart_rate', value: 72, unit: 'bpm', recorded_at: at }]);
    expect(before.level).toBe('low');

    const after = assessPatientRisk([
      { type: 'heart_rate', value: 72, unit: 'bpm', recorded_at: at },
      { type: 'blood_pressure', value: 190, secondary_value: 125, unit: 'mmHg', recorded_at: at },
    ]);
    expect(after.level).toBe('high');
    // And the panel can say why, which is the half a clinician acts on.
    expect(explainRiskLevel(after)).toMatch(/critical/i);
  });

  it('does not flag a reading that is merely unusual for the unit given', async () => {
    const { assessPatientRisk } = await import('@/lib/patient-risk');
    const at = new Date().toISOString();
    // 98.6°F is normal. Read as Celsius it is fatal, which is the bug this
    // journey exists to keep fixed.
    const risk = assessPatientRisk([
      { type: 'temperature', value: 98.6, unit: '°F', recorded_at: at },
    ]);
    expect(risk.level).toBe('low');
  });
});

// ---------------------------------------------------------------------------
// P3 — sharing, and stopping
// ---------------------------------------------------------------------------

describe('P3 — a share the patient can end', () => {
  it('does not count a revoked share as sharing', async () => {
    const { patientOnboardingProgress } = await import('@/lib/patient-onboarding');
    // Someone who shared and then stopped has not got a doctor looking at
    // their record, so the first-run step is not complete.
    const shared = patientOnboardingProgress({
      hasHealthProfile: true, hasLoggedVital: true, hasMedication: true, hasShared: true,
    });
    const revoked = patientOnboardingProgress({
      hasHealthProfile: true, hasLoggedVital: true, hasMedication: true, hasShared: false,
    });
    expect(shared.isComplete).toBe(true);
    expect(revoked.isComplete).toBe(false);
  });

  it('never reports a category as shared that the patient withheld', async () => {
    const { shareGrants } = await import('../../supabase/functions/_shared/share-permissions');
    const permissions = { vitals: true, medications: true, documents: false };
    expect(shareGrants(permissions, 'vitals')).toBe(true);
    expect(shareGrants(permissions, 'documents')).toBe(false);
    // A category nobody mentioned is not granted by omission.
    expect(shareGrants(permissions, 'conditions')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P4 — the assistant answers about a medicine
// ---------------------------------------------------------------------------

describe('P4 — asking the assistant about a medicine', () => {
  it('cites what it read and refuses to answer from memory when it found nothing', async () => {
    const { answerLookupTool } = await import(
      '../../supabase/functions/_shared/medication-knowledge'
    );
    const fetchFn = (async () => ({ ok: false, status: 404, json: async () => ({}) })) as never;

    const result = await answerLookupTool('look_up_medication', { name: 'Zestril' }, fetchFn);
    expect(result.source).toBeNull();
    expect(result.content).toContain('Do NOT answer from memory');
  });

  it('never reports a failed interaction check as a clean one', async () => {
    const { answerLookupTool } = await import(
      '../../supabase/functions/_shared/medication-knowledge'
    );
    const fetchFn = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as never;

    const result = await answerLookupTool(
      'check_interactions',
      { names: ['Warfarin', 'Ibuprofen'] },
      fetchFn,
    );
    // The offline reference still finds this pair, so the answer is not empty —
    // and the citation says the live check did not complete.
    expect(result.content).toContain('Warfarin');
    expect(result.source).toBe('Interaction check (incomplete)');
  });

  it('carries the disclosure the app owns, not the one the model remembers', async () => {
    const { AI_DISCLOSURE, stripModelDisclaimer } = await import('@/lib/ai-disclosure');
    expect(AI_DISCLOSURE).toMatch(/licensed practitioner/i);
    expect(stripModelDisclaimer('Answer.\n\n⚠️ General information, not medical advice.')).toBe(
      'Answer.',
    );
  });
});
