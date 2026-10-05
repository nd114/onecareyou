import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { caps, ent } = vi.hoisted(() => ({
  caps: { can: ((_: string) => true) as (c: string) => boolean, loading: false },
  ent: { value: null as null | { tier: string; scribeIncluded: boolean }, isLoading: false },
}));

vi.mock('@/hooks/useClinicianCapabilities', () => ({ useClinicianCapabilities: () => caps }));
vi.mock('@/hooks/useEntitlements', () => ({
  useEntitlements: () => ({ entitlements: ent.value, isLoading: ent.isLoading }),
}));

import { PlusUpgradePrompt } from '@/components/PlusUpgradePrompt';
import { ScribeNotInPlanNotice } from '@/components/clinician/ScribeNotInPlanNotice';
import { useScribeAccess } from '@/hooks/useScribeAccess';
import { scribePlanIncluded } from '@/hooks/useScribePlan';
import { CLINICIAN_FEATURE_TIERS, hasFeatureAccess } from '@/hooks/useClinicianSubscription';
import { buildQuickActions, SCRIBE_LOCKED_REASON, SCRIBE_NOT_IN_PLAN_REASON } from '@/lib/destinations';
import { edgeFunctionError } from '@/lib/edge-function-error';

beforeEach(() => {
  caps.can = () => true;
  caps.loading = false;
  ent.value = { tier: 'pro', scribeIncluded: true };
  ent.isLoading = false;
});

describe('Plus upgrade prompt', () => {
  it('names the feature and links to /pricing', () => {
    render(
      <MemoryRouter>
        <PlusUpgradePrompt feature="The AI assistant" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/The AI assistant is a Plus feature/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /OneCare Plus/i })).toHaveAttribute('href', '/pricing');
  });
});

describe('the scribe tier map', () => {
  it('drops solo from ambient_scribe and keeps the others', () => {
    expect(hasFeatureAccess('solo', 'ambient_scribe')).toBe(false);
    expect(hasFeatureAccess('community', 'ambient_scribe')).toBe(false);
    for (const t of ['trial', 'pro', 'clinic', 'enterprise']) expect(hasFeatureAccess(t, 'ambient_scribe')).toBe(true);
  });
  it('leaves assistant_actions (the clinician assistant, not the scribe) alone', () => {
    expect(CLINICIAN_FEATURE_TIERS.assistant_actions).toContain('solo');
  });
});

describe('scribePlanIncluded', () => {
  it('is null when unknown, so an unreadable plan never locks anyone out', () => {
    expect(scribePlanIncluded(null)).toBeNull();
  });
  it('is false for Individual and true for Practice', () => {
    expect(scribePlanIncluded({ tier: 'solo', scribeIncluded: false })).toBe(false);
    expect(scribePlanIncluded({ tier: 'pro', scribeIncluded: true })).toBe(true);
  });
  it('a Practice seat lifts a lower personal profile', () => {
    expect(scribePlanIncluded({ tier: 'pro', scribeIncluded: false })).toBe(true);
  });
});

describe('useScribeAccess with the plan', () => {
  it('allows a plan that includes the scribe', () => {
    const { result } = renderHook(() => useScribeAccess());
    expect(result.current).toMatchObject({ allowed: true, locked: false, planBlocked: false });
  });

  it('locks Individual with the not-in-plan reason, flagged as a plan block', () => {
    ent.value = { tier: 'solo', scribeIncluded: false };
    const { result } = renderHook(() => useScribeAccess());
    expect(result.current).toMatchObject({
      allowed: false,
      locked: true,
      planBlocked: true,
      reason: SCRIBE_NOT_IN_PLAN_REASON,
    });
  });

  it('keeps the role reason when the member lacks clinical access, even on a good plan', () => {
    caps.can = () => false;
    const { result } = renderHook(() => useScribeAccess());
    expect(result.current).toMatchObject({ allowed: false, locked: true, planBlocked: false, reason: SCRIBE_LOCKED_REASON });
  });

  it('shows nothing while the plan is still loading (no locked flash)', () => {
    ent.value = null;
    ent.isLoading = true;
    const { result } = renderHook(() => useScribeAccess());
    expect(result.current).toMatchObject({ loading: true, allowed: false, locked: false });
  });

  it('does not lock when entitlements failed to load (the server decides)', () => {
    ent.value = null;
    const { result } = renderHook(() => useScribeAccess());
    expect(result.current).toMatchObject({ allowed: true, locked: false });
  });
});

describe('quick actions', () => {
  it('lock with the plan reason when the plan has no scribe', () => {
    const a = buildQuickActions({ can: () => true, planIncluded: false });
    expect(a[0].lockedReason).toBe(SCRIBE_NOT_IN_PLAN_REASON);
    expect(a[1].lockedReason).toBe(SCRIBE_NOT_IN_PLAN_REASON);
  });
  it('are unchanged when the plan is included or unknown', () => {
    expect(buildQuickActions({ can: () => true, planIncluded: true })[0].lockedReason).toBeUndefined();
    expect(buildQuickActions({ can: () => true })[0].lockedReason).toBeUndefined();
  });
});

describe('not-in-plan notice', () => {
  it('explains and links to plans', () => {
    render(
      <MemoryRouter>
        <ScribeNotInPlanNotice />
      </MemoryRouter>,
    );
    expect(screen.getByText(SCRIBE_NOT_IN_PLAN_REASON)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /see plans/i })).toHaveAttribute('href', '/clinician/pricing');
  });
});

describe('edgeFunctionError and plan codes', () => {
  const failing = (status: number, body: unknown) => ({ context: new Response(JSON.stringify(body), { status }) });

  it('returns the readable message and the code for a plan refusal', async () => {
    const r = await edgeFunctionError(failing(403, { error: 'plus_required', message: 'Part of Plus.' }));
    expect(r).toMatchObject({ message: 'Part of Plus.', status: 403, code: 'plus_required' });
  });
  it('carries scribe_not_in_plan and plan_check_failed too', async () => {
    expect((await edgeFunctionError(failing(403, { error: 'scribe_not_in_plan', message: 'No scribe.' }))).code).toBe(
      'scribe_not_in_plan',
    );
    expect((await edgeFunctionError(failing(503, { error: 'plan_check_failed', message: 'Try again.' }))).code).toBe(
      'plan_check_failed',
    );
  });
  it('still returns ordinary sentences as before, with no code', async () => {
    const r = await edgeFunctionError(failing(403, { error: 'AI consent required.' }));
    expect(r).toMatchObject({ message: 'AI consent required.' });
    expect(r.code).toBeUndefined();
  });
});
