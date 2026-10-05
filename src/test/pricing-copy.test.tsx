import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { createSupabaseMock } from './support/supabase-mock';
import {
  FREE_FEATURES,
  PREMIUM_FEATURES,
  LANDING_FREE_FEATURES,
  LANDING_PREMIUM_FEATURES,
  PRICING_ROADMAP,
  STAFF_SEAT_PRICE,
} from '@/lib/pricing-constants';
import { CLINICIAN_TIER_INFO } from '@/hooks/useClinicianSubscription';

/**
 * The pricing copy, as a reader sees it. Display figures only: what each plan
 * is allowed to do is enforced elsewhere and is not asserted here.
 */

const { mock } = vi.hoisted(() => ({
  mock: { current: null as null | { client: unknown } },
}));

vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return mock.current?.client;
  },
}));

beforeEach(() => {
  mock.current = createSupabaseMock();
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
    root = null;
    rootMargin = '';
    thresholds = [];
  });
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Element.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function pageText(entry: string): Promise<string> {
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const { MemoryRouter } = await import('react-router-dom');
  const { HelmetProvider } = await import('react-helmet-async');
  const { TooltipProvider } = await import('@/components/ui/tooltip');
  const { AuthProvider } = await import('@/contexts/AuthContext');
  const { ThemeProvider } = await import('@/contexts/ThemeContext');
  const { FamilyProvider } = await import('@/contexts/FamilyContext');
  const Pricing = (await import('@/pages/Pricing')).default;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(
    <HelmetProvider>
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <MemoryRouter initialEntries={[entry]}>
            <AuthProvider>
              <FamilyProvider>
                <TooltipProvider>
                  <Pricing />
                </TooltipProvider>
              </FamilyProvider>
            </AuthProvider>
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </HelmetProvider>,
  );
  return (container.textContent ?? '').replace(/\s+/g, ' ');
}

/** The table row whose first cell starts with `label`, as the cells' text. */
async function rowCells(entry: string, label: string): Promise<string[]> {
  await pageText(entry);
  const row = Array.from(document.querySelectorAll('tr')).find((tr) =>
    (tr.querySelector('th,td')?.textContent ?? '').trim().startsWith(label),
  );
  expect(row, `no comparison row starting "${label}"`).toBeTruthy();
  return Array.from(row!.querySelectorAll('th,td')).map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim());
}

describe('clinician pricing page', () => {
  it('shows the Clinic plan at $649', async () => {
    const text = await pageText('/pricing?audience=clinicians');
    expect(text).toContain('Clinic');
    expect(text).toContain('$649');
  });

  it('shows the staff seat price and says none are included', async () => {
    const text = await pageText('/pricing?audience=clinicians');
    expect(text).toContain(`$${STAFF_SEAT_PRICE}`);
    expect(text).toMatch(/none included/i);
  });

  it('has the ladder at the decided prices', () => {
    expect(CLINICIAN_TIER_INFO.community.price).toBe(0);
    expect(CLINICIAN_TIER_INFO.solo.price).toBe(99);
    expect(CLINICIAN_TIER_INFO.pro.price).toBe(299);
    expect(CLINICIAN_TIER_INFO.clinic.price).toBe(649);
    expect(CLINICIAN_TIER_INFO.enterprise.price).toBe(2500);
  });

  it('gives Individual no scribe, in the card and in the comparison table', async () => {
    const solo = CLINICIAN_TIER_INFO.solo.features.join(' | ');
    expect(solo).not.toMatch(/scribe minutes? (included|a month)|\d[\d,]* (scribe )?min/i);
    expect(solo).toMatch(/no ambient scribe/i);

    // Community, Individual, Practice, Clinic, Enterprise (after the label).
    const cells = await rowCells('/pricing?audience=clinicians', 'Ambient scribe');
    expect(cells[1]).toMatch(/^No$/);
    expect(cells[2]).toMatch(/^No$/);
    expect(cells[3]).toContain('900');
    expect(cells[4]).toContain('3,000');
    expect(cells[5]).toContain('15,000');
  });

  it('never calls the scribe allowance unlimited or included without a figure', async () => {
    const text = await pageText('/pricing?audience=clinicians');
    expect(text).not.toMatch(/unlimited scribe|scribe[^.]{0,40}unlimited/i);
  });

  it('keeps the over-a-limit reassurance and the add-more footnote', async () => {
    const text = await pageText('/pricing?audience=clinicians');
    expect(text).toContain('Owners can add them any time from their account');
    expect(text).toContain('you can still see and use everything you already have');
  });

  it('says priority support starts at Clinic', async () => {
    expect(CLINICIAN_TIER_INFO.pro.features.join(' ')).not.toMatch(/priority support/i);
    expect(CLINICIAN_TIER_INFO.clinic.features.join(' ')).toMatch(/priority support/i);
  });

  it('does not mention a revenue share percentage', async () => {
    const text = await pageText('/pricing?audience=clinicians');
    expect(text).not.toMatch(/revenue[- ]?shar/i);
    expect(text).not.toMatch(/profit[- ]?shar/i);
    // No percentage figure beside a partnership or share.
    expect(text).not.toMatch(/\d+\s?%\s+(of|share|revenue)/i);
    expect(text).not.toMatch(/(share|partnership)[^.]{0,60}\d+\s?%/i);
  });

  it('has a quiet partnership line that points at the contact page', async () => {
    const text = await pageText('/pricing?audience=clinicians');
    expect(text).toMatch(/partnership agreement/i);
    const link = Array.from(document.querySelectorAll('a')).find((a) => /talk to us/i.test(a.textContent ?? '') && a.getAttribute('href') === '/contact');
    expect(link).toBeTruthy();
  });

  it('lists the seat add-ons as live and the family plan as coming, with no date or price', () => {
    const seats = PRICING_ROADMAP.find((r) => r.label === 'Seats and staff seats');
    expect(seats?.when).toBe('Available');
    const family = PRICING_ROADMAP.find((r) => r.label === 'Family plan');
    expect(family).toBeTruthy();
    expect(family!.when).toBe('Later');
    expect(`${family!.detail} ${family!.when}`).not.toMatch(/\$|\d/);
  });
});

describe('patient pricing page', () => {
  it('has no 3-medication or 3-document cap anywhere', async () => {
    const text = await pageText('/pricing');
    expect(text).not.toMatch(/\b(3|three) (medications|documents)\b/i);
    expect(text).not.toMatch(/up to 3\b/i);
    const lists = [FREE_FEATURES, PREMIUM_FEATURES, LANDING_FREE_FEATURES, LANDING_PREMIUM_FEATURES]
      .flat()
      .join(' | ');
    expect(lists).not.toMatch(/\b(3|three) (medications|documents)\b/i);
  });

  it('says Free has unlimited medications and documents and 2 GB', () => {
    expect(FREE_FEATURES).toContain('Unlimited medications');
    expect(FREE_FEATURES).toContain('Unlimited documents');
    expect(FREE_FEATURES).toContain('2 GB document storage');
  });

  it('does not advertise the AI assistant on the Free plan', () => {
    expect(FREE_FEATURES.join(' ')).not.toMatch(/\bAI\b/);
    expect(LANDING_FREE_FEATURES.join(' ')).not.toMatch(/\bAI\b/);
  });

  it('calls the paid plan Plus, not Premium, at $9.99', async () => {
    const text = await pageText('/pricing');
    expect(text).toContain('Plus');
    expect(text).not.toMatch(/Premium/);
    // The page opens on annual billing: $99.90 a year, shown as $8.33 a month.
    expect(text).toMatch(/99\.9|8\.33/);
    // Plus carries its own 10 GB, not Free's 2 GB as well.
    const plusCard = text.slice(text.indexOf('PlusDeeper'));
    expect(plusCard.slice(0, plusCard.indexOf('Get Started'))).not.toContain('2 GB');
  });
});
