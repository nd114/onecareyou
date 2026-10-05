import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EXISTING_UNAFFECTED } from '@/lib/limit-errors';

const { hook } = vi.hoisted(() => ({
  hook: { current: { entitlements: null, ready: false } as { entitlements: unknown; ready: boolean } },
}));
vi.mock('@/hooks/useEntitlements', () => ({ useEntitlements: () => hook.current }));

import { EntitlementBanner, LimitBanner, limitBannerCopy, limitBannerState } from '@/components/LimitBanner';
import { PatientLimitBanner, upgradeHintFor } from '@/components/clinician/PatientLimitBanner';
import { CLINICIAN_TIER_INFO } from '@/hooks/useClinicianSubscription';

const ent = (over: Record<string, unknown> = {}) => ({
  tier: 'solo',
  patientLimit: 150,
  patientCount: 10,
  seatLimit: 1,
  seatCount: 1,
  practiceId: null,
  ...over,
});

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('limitBannerState', () => {
  it('is ok when unlimited or when no plan limit applies', () => {
    expect(limitBannerState(5000, null)).toBe('ok');
    expect(limitBannerState(1, 0)).toBe('ok');
  });
  it('steps from ok to near, at and over', () => {
    expect(limitBannerState(79, 100)).toBe('ok');
    expect(limitBannerState(80, 100)).toBe('near');
    expect(limitBannerState(100, 100)).toBe('at');
    expect(limitBannerState(101, 100)).toBe('over');
  });
});

describe('limitBannerCopy', () => {
  it('always says existing patients and records are unaffected once blocked', () => {
    expect(limitBannerCopy('patients', 'at', 25, 25).body).toContain('Existing patients and records are unaffected');
    expect(limitBannerCopy('patients', 'over', 30, 25).body).toContain('Existing patients and records are unaffected');
    expect(limitBannerCopy('patients', 'over', 30, 25).body).toContain('30 of 25');
  });
  it('words seats for members', () => {
    expect(limitBannerCopy('seats', 'at', 5, 5).body).toContain('Existing members and their access are unaffected');
  });
  it('near counts what is left', () => {
    expect(limitBannerCopy('patients', 'near', 24, 25).body).toBe('Only 1 patient remaining.');
  });
});

describe('LimitBanner', () => {
  afterEach(cleanup);
  it('draws nothing when comfortably within the limit or unlimited', () => {
    const a = wrap(<LimitBanner kind="patients" used={3} limit={25} />);
    expect(a.container.firstChild).toBeNull();
    cleanup();
    const b = wrap(<LimitBanner kind="patients" used={9999} limit={null} />);
    expect(b.container.firstChild).toBeNull();
  });
  it('is an alert and carries the reassurance when at the limit', () => {
    wrap(<LimitBanner kind="patients" used={25} limit={25} upgradeHint="Upgrade to Individual for up to 150 patients." />);
    const el = screen.getByTestId('limit-banner-patients');
    expect(el).toHaveAttribute('role', 'alert');
    expect(el).toHaveAttribute('data-state', 'at');
    expect(el).toHaveTextContent(EXISTING_UNAFFECTED);
    expect(el).toHaveTextContent('Upgrade to Individual for up to 150 patients.');
  });
  it('is a status, not an alert, when merely near', () => {
    wrap(<LimitBanner kind="patients" used={21} limit={25} />);
    expect(screen.getByTestId('limit-banner-patients')).toHaveAttribute('role', 'status');
  });
});

describe('EntitlementBanner and PatientLimitBanner', () => {
  beforeEach(() => {
    hook.current = { entitlements: null, ready: false };
  });
  afterEach(cleanup);

  it('draw nothing until the answer is in, so a default is never shown as fact', () => {
    wrap(<EntitlementBanner kind="patients" />);
    wrap(<PatientLimitBanner patientCount={999} />);
    expect(screen.queryByTestId('limit-banner-patients')).toBeNull();
  });

  it('read the limit from entitlements, with the page count for patients', () => {
    hook.current = { entitlements: ent({ patientLimit: 25, tier: 'community' }), ready: true };
    wrap(<PatientLimitBanner patientCount={25} />);
    const el = screen.getByTestId('limit-banner-patients');
    expect(el).toHaveTextContent('25 / 25');
    expect(el).toHaveTextContent(upgradeHintFor('community')!);
  });

  it('a changed limit in the table changes the banner with no code change', () => {
    hook.current = { entitlements: ent({ patientLimit: 40 }), ready: true };
    wrap(<EntitlementBanner kind="patients" used={40} />);
    expect(screen.getByTestId('limit-banner-patients')).toHaveTextContent('40 / 40');
  });

  it('seat banner appears only for the practice it describes', () => {
    hook.current = { entitlements: ent({ seatLimit: 5, seatCount: 5, practiceId: 'p1' }), ready: true };
    wrap(<EntitlementBanner kind="seats" practiceId="other" />);
    expect(screen.queryByTestId('limit-banner-seats')).toBeNull();
    cleanup();
    wrap(<EntitlementBanner kind="seats" practiceId="p1" />);
    expect(screen.getByTestId('limit-banner-seats')).toHaveTextContent('5 / 5');
  });

  it('unlimited tiers show nothing', () => {
    hook.current = { entitlements: ent({ tier: 'enterprise', patientLimit: null, patientCount: 5000 }), ready: true };
    wrap(<PatientLimitBanner patientCount={5000} />);
    expect(screen.queryByTestId('limit-banner-patients')).toBeNull();
  });
});

describe('upgradeHintFor', () => {
  it('names the next plan from the pricing figures', () => {
    expect(upgradeHintFor('trial')).toContain(CLINICIAN_TIER_INFO.solo.name);
    expect(upgradeHintFor('solo')).toContain('1,000');
    expect(upgradeHintFor('pro')).toContain(CLINICIAN_TIER_INFO.clinic.name);
    expect(upgradeHintFor('pro')).toContain('3,500');
    expect(upgradeHintFor('clinic')).toContain(CLINICIAN_TIER_INFO.enterprise.name);
    expect(upgradeHintFor('clinic')).toContain('5,000');
    expect(upgradeHintFor('enterprise')).toBeNull();
  });
});
