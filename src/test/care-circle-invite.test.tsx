import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createSupabaseMock } from './support/supabase-mock';
import { CAREGIVER_CONTACTS_PATH, CLINICIAN_VERIFICATION_NOTICE } from '@/lib/clinician-disclosure';

/**
 * Care Circle offered the clinician share link "for your doctor, pharmacist,
 * or caregiver". Whoever claimed it became the patient's clinician to every
 * policy: guidance, "From your clinician" documents, medication proposals,
 * alert rules. The invite is now for clinicians only, says OneCare does not
 * verify them, and sends family and caregivers to alert contacts instead.
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
  mock.current = createSupabaseMock({ user: { id: 'patient-1', email: 'p@example.com' } });
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

async function renderCareCircle() {
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const { MemoryRouter } = await import('react-router-dom');
  const { HelmetProvider } = await import('react-helmet-async');
  const { TooltipProvider } = await import('@/components/ui/tooltip');
  const { AuthProvider } = await import('@/contexts/AuthContext');
  const { ThemeProvider } = await import('@/contexts/ThemeContext');
  const { FamilyProvider } = await import('@/contexts/FamilyContext');
  const { default: CareCircle } = await import('@/pages/CareCircle');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <HelmetProvider>
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <MemoryRouter>
            <AuthProvider>
              <FamilyProvider>
                <TooltipProvider>
                  <CareCircle />
                </TooltipProvider>
              </FamilyProvider>
            </AuthProvider>
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

describe('Care Circle keeps clinicians and caregivers apart', () => {
  it('the disclosure is one plain sentence', () => {
    expect(CLINICIAN_VERIFICATION_NOTICE.match(/[.!?](\s|$)/g)?.length).toBe(1);
    expect(CLINICIAN_VERIFICATION_NOTICE).toContain("doesn't verify clinicians' credentials");
  });

  it('invites a clinician, not a caregiver, and says clinicians are not verified', async () => {
    await renderCareCircle();
    fireEvent.click(screen.getAllByRole('button', { name: /invite a clinician/i })[0]);
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText('Invite a clinician')).toBeTruthy();
    expect(within(dialog).getByText(CLINICIAN_VERIFICATION_NOTICE)).toBeTruthy();
    // The link is never offered as a caregiver's.
    expect(dialog.textContent).not.toMatch(/pharmacist, or caregiver/i);
    const toCaregivers = within(dialog).getByRole('link', { name: 'Add someone who cares for you' });
    expect(toCaregivers.getAttribute('href')).toBe(CAREGIVER_CONTACTS_PATH);
  });

  it('offers caregivers their own way in on the page', async () => {
    await renderCareCircle();
    expect(await screen.findByText('Add someone who cares for you')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Add a caregiver' }).getAttribute('href')).toBe(CAREGIVER_CONTACTS_PATH);
  });
});
