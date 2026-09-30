import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createSupabaseMock } from './support/supabase-mock';
import { CAREGIVER_CONTACTS_PATH, CLINICIAN_VERIFICATION_NOTICE } from '@/lib/clinician-disclosure';

/**
 * Care Circle offered the clinician share link "for your doctor, pharmacist,
 * or caregiver". Whoever claimed it became the patient's clinician to every
 * policy: guidance, "From your clinician" documents, medication proposals,
 * alert rules. The invite is now for clinicians only and says OneCare does not
 * verify them.
 *
 * Caregivers (missed-dose alert contacts) are paused by the founder's decision
 * behind one switch, CAREGIVERS_ENABLED. Off, nothing on the page offers to add
 * one; on, family and caregivers are sent to alert contacts, never the
 * clinician link.
 */

const { mock, flags } = vi.hoisted(() => ({
  mock: { current: null as null | { client: unknown } },
  flags: { caregivers: false },
}));

vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return mock.current?.client;
  },
}));

vi.mock('@/lib/features', () => ({
  get CAREGIVERS_ENABLED() {
    return flags.caregivers;
  },
}));

beforeEach(() => {
  flags.caregivers = false;
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

async function openInvite() {
  fireEvent.click(screen.getAllByRole('button', { name: /invite a clinician/i })[0]);
  return screen.findByRole('dialog');
}

describe('Care Circle keeps clinicians and caregivers apart', () => {
  it('the disclosure is one plain sentence', () => {
    expect(CLINICIAN_VERIFICATION_NOTICE.match(/[.!?](\s|$)/g)?.length).toBe(1);
    expect(CLINICIAN_VERIFICATION_NOTICE).toContain("doesn't verify clinicians' credentials");
  });

  it('invites a clinician, not a caregiver, and says clinicians are not verified', async () => {
    await renderCareCircle();
    const dialog = await openInvite();
    expect(within(dialog).getByText('Invite a clinician')).toBeTruthy();
    expect(within(dialog).getByText(CLINICIAN_VERIFICATION_NOTICE)).toBeTruthy();
    // The link is never offered as a caregiver's.
    expect(dialog.textContent).not.toMatch(/pharmacist, or caregiver/i);
  });
});

describe('Caregivers are paused', () => {
  it('ships switched off', async () => {
    const real = await vi.importActual<typeof import('@/lib/features')>('@/lib/features');
    expect(real.CAREGIVERS_ENABLED).toBe(false);
  });

  it('offers no way to add a caregiver, on the page or in the invite', async () => {
    await renderCareCircle();
    const dialog = await openInvite();
    expect(within(dialog).queryByRole('link', { name: 'Add someone who cares for you' })).toBeNull();
    expect(dialog.textContent).not.toMatch(/caregiver/i);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByText('Add someone who cares for you')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Add a caregiver' })).toBeNull();
    // The clinician invite stays.
    expect(screen.getAllByRole('button', { name: /invite a clinician/i }).length).toBeGreaterThan(0);
  });

  it('switched on, sends family and caregivers to alert contacts', async () => {
    flags.caregivers = true;
    await renderCareCircle();
    const dialog = await openInvite();
    const toCaregivers = within(dialog).getByRole('link', { name: 'Add someone who cares for you' });
    expect(toCaregivers.getAttribute('href')).toBe(CAREGIVER_CONTACTS_PATH);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('link', { name: 'Add a caregiver' }).getAttribute('href')).toBe(CAREGIVER_CONTACTS_PATH);
  });

  it('keeps the missed-dose alert switch out of notification settings while paused', async () => {
    const { categoriesFor } = await import('../../supabase/functions/_shared/notification-catalogue');
    // The catalogue reads the shipped switch itself, so this is the real answer.
    expect(categoriesFor('patient').map((c) => c.key)).not.toContain('care_circle_missed_doses');
    expect(categoriesFor('patient').map((c) => c.key)).toContain('medication_reminders');
  });
});
