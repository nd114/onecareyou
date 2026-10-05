import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const { rpc, invoke, toastError, toastSuccess } = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc, functions: { invoke } },
}));
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess, warning: vi.fn() } }));
vi.mock('@/hooks/usePractice', () => ({
  usePractice: () => ({ currentPractice: { id: 'p1', name: 'Harbour Clinic' } }),
}));

import { PracticeAccountPage } from '@/components/clinician/account/PracticeAccountPage';
import { matrixCell, MATRIX_CAPABILITIES, MATRIX_ROLES } from '@/lib/role-capability-matrix';
import { isMissingFunctionError, normaliseOverview } from '@/hooks/usePracticeAccount';
import * as account from '@/hooks/usePracticeAccount';

const overviewFixture = (over: Record<string, unknown> = {}) => ({
  practice: { id: 'p1', name: 'Harbour Clinic', tenant_type: 'practice', tier: 'pro' },
  seats: {
    clinician: { used: 2, limit: 3, addon_price_usd: 29 },
    staff: { used: 1, purchased: 2, price_usd: 9 },
  },
  patients: { used: 40, limit: 150 },
  storage: { used_gb: 1.5, limit_gb: 10 },
  scribe: {
    pool_minutes: 600,
    used_minutes: 120,
    pack_minutes_remaining: 300,
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    per_member: [
      { user_id: 'u-owner', name: 'Olivia Owner', used_minutes: 80, cap_minutes: null },
      { user_id: 'u-doc', name: 'Dan Doctor', used_minutes: 40, cap_minutes: 200 },
    ],
  },
  partner: { status: 'none', revenue_share_pct: null, referral_slug: null },
  members: [
    { user_id: 'u-owner', name: 'Olivia Owner', role: 'owner', clinical_seat: true, is_clinical: true, status: 'active' },
    { user_id: 'u-admin', name: 'Adam Admin', role: 'admin', clinical_seat: false, is_clinical: false, status: 'active' },
    { user_id: 'u-doc', name: 'Dan Doctor', role: 'provider', clinical_seat: false, is_clinical: true, status: 'active' },
    { user_id: 'u-desk', name: 'Fran Front', role: 'front_desk', clinical_seat: false, is_clinical: false, status: 'active' },
  ],
  ...over,
});

function answer(overview: unknown) {
  rpc.mockImplementation(async (fn: string) => {
    if (fn === 'practice_account_overview') return { data: overview, error: null };
    return { data: null, error: null };
  });
}

function renderPage(props: { isAdmin?: boolean; canManageBilling?: boolean } = {}, entry = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <PracticeAccountPage isAdmin={props.isAdmin ?? true} canManageBilling={props.canManageBilling ?? true} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const openTab = (name: string) => fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });

beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});
afterEach(cleanup);

describe('access', () => {
  it('draws nothing, and asks the database nothing, for a member who runs nothing', () => {
    const { container } = renderPage({ isAdmin: false, canManageBilling: false });
    expect(container).toBeEmptyDOMElement();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('gives somebody who only looks after the money the overview and the add-ons', async () => {
    answer(overviewFixture());
    renderPage({ isAdmin: false, canManageBilling: true });
    await screen.findByTestId('stat-clinician-seats');
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['Overview', 'Add-ons']);
  });

  it('gives an owner or admin every tab', async () => {
    answer(overviewFixture());
    renderPage();
    await screen.findByTestId('stat-clinician-seats');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Overview',
      'People & access',
      'Scribe',
      'Add-ons',
      'Partnership',
    ]);
  });

  it('does not put member email addresses or patient data on the page', async () => {
    answer(overviewFixture());
    const { container } = renderPage();
    await screen.findByTestId('stat-clinician-seats');
    openTab('People & access');
    await screen.findByText('Adam Admin');
    expect(container.textContent).not.toMatch(/@/);
  });
});

describe('states', () => {
  it('shows a spinner while the overview loads', () => {
    rpc.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId('account-loading')).toBeInTheDocument();
  });

  it('says the overview is not available yet when the function is not in the database', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.practice_account_overview' },
    });
    renderPage();
    expect(await screen.findByTestId('account-unavailable')).toHaveTextContent('not available yet');
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('offers a retry when the call fails for any other reason', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '57014', message: 'timeout' } });
    renderPage();
    expect(await screen.findByTestId('account-error', {}, { timeout: 5000 })).toBeInTheDocument();
    answer(overviewFixture());
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('stat-clinician-seats')).toBeInTheDocument();
  });

  it('tells a missing function from a failed one', () => {
    expect(isMissingFunctionError({ code: 'PGRST202' })).toBe(true);
    expect(isMissingFunctionError({ code: '42883' })).toBe(true);
    expect(isMissingFunctionError({ code: '57014', message: 'timeout' })).toBe(false);
  });

  it('treats an empty answer as unavailable rather than as zeros', () => {
    expect(normaliseOverview(null)).toBeNull();
    expect(normaliseOverview({})).toBeNull();
  });
});

describe('overview tab', () => {
  it('shows seats, patients, storage and the scribe pool against their allowances', async () => {
    answer(overviewFixture());
    renderPage();
    expect(await screen.findByTestId('stat-clinician-seats')).toHaveTextContent('2 / 3');
    expect(screen.getByTestId('stat-staff-seats')).toHaveTextContent('1 / 2');
    expect(screen.getByTestId('stat-patients')).toHaveTextContent('40 / 150');
    expect(screen.getByTestId('stat-storage')).toHaveTextContent('1.5 GB / 10 GB');
    expect(screen.getByTestId('stat-scribe')).toHaveTextContent('120 min / 600 min');
    expect(screen.getByText(/Only new additions are blocked/)).toBeInTheDocument();
    expect(screen.queryByTestId('limit-banner-seats')).toBeNull();
  });

  it('uses the shared limit banner, with its reassurance, when over the limit', async () => {
    answer(
      overviewFixture({
        seats: { clinician: { used: 4, limit: 3, addon_price_usd: 29 }, staff: { used: 1, purchased: 2, price_usd: 9 } },
        patients: { used: 160, limit: 150 },
      }),
    );
    renderPage();
    const seats = await screen.findByTestId('limit-banner-seats');
    expect(seats).toHaveTextContent('Existing members and their access are unaffected');
    expect(screen.getByTestId('limit-banner-patients')).toHaveTextContent(
      'Existing patients and records are unaffected',
    );
  });
});

describe('people and access tab', () => {
  const hospitalFixture = () =>
    overviewFixture({ practice: { id: 'p1', name: 'Harbour Hospital', tenant_type: 'hospital', tier: 'enterprise' } });

  async function openPeople(overview: unknown = hospitalFixture()) {
    answer(overview);
    renderPage();
    await screen.findByTestId('stat-clinician-seats');
    openTab('People & access');
    await screen.findByText('Adam Admin');
  }

  it('lists members with a role label and a reason for clinical access', async () => {
    await openPeople();
    const owner = screen.getByTestId('member-u-owner');
    expect(owner).toHaveTextContent('Owner');
    expect(owner).toHaveTextContent('Takes a clinician seat');
    const admin = screen.getByTestId('member-u-admin');
    expect(admin).toHaveTextContent('Administrator');
    expect(admin).toHaveTextContent('no clinical records');
    expect(screen.getByTestId('member-u-doc')).toHaveTextContent('Clinical role');
    expect(screen.getByTestId('member-u-desk')).toHaveTextContent('Non-clinical role');
    expect(screen.getByText(/Clinician seats 2 of 3/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Invite or manage people/ })).toHaveAttribute(
      'href',
      '/clinician/practice/people',
    );
  });

  it('offers the seat switch to owners and admins only', async () => {
    await openPeople();
    expect(screen.getAllByRole('switch')).toHaveLength(2);
    expect(within(screen.getByTestId('member-u-doc')).queryByRole('switch')).toBeNull();
  });

  it('turns clinical access on straight away, without a confirmation', async () => {
    await openPeople();
    fireEvent.click(screen.getByRole('switch', { name: /Adam Admin/ }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_member_clinical_seat', {
        _practice_id: 'p1',
        _user_id: 'u-admin',
        _on: true,
      }),
    );
  });

  it('asks before turning it off, and says access to records ends at once', async () => {
    await openPeople();
    fireEvent.click(screen.getByRole('switch', { name: /Olivia Owner/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('lose access to clinical records immediately');
    expect(rpc).not.toHaveBeenCalledWith('set_member_clinical_seat', expect.anything());

    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn off clinical access' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_member_clinical_seat', {
        _practice_id: 'p1',
        _user_id: 'u-owner',
        _on: false,
      }),
    );
  });

  it('changes nothing when the confirmation is dismissed', async () => {
    await openPeople();
    fireEvent.click(screen.getByRole('switch', { name: /Olivia Owner/ }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep access' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(rpc).not.toHaveBeenCalledWith('set_member_clinical_seat', expect.anything());
  });

  it('explains a full set of clinician seats instead of a raw error', async () => {
    await openPeople();
    rpc.mockImplementation(async (fn: string) =>
      fn === 'set_member_clinical_seat'
        ? { data: null, error: { code: 'OC002', message: 'seat_limit_reached' } }
        : { data: hospitalFixture(), error: null },
    );
    fireEvent.click(screen.getByRole('switch', { name: /Adam Admin/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toBe(account.SEAT_LIMIT_MESSAGE);
    expect(toastError.mock.calls[0][0]).toContain('Existing members and their access are unaffected');
  });

  it('shows a read-only role matrix, with owners and admins on a clinician seat for records', async () => {
    await openPeople();
    const matrix = screen.getByTestId('role-matrix');
    expect(matrix.querySelector('[data-cell="view_phi:owner:seat"]')).not.toBeNull();
    expect(matrix.querySelector('[data-cell="view_phi:admin:seat"]')).not.toBeNull();
    expect(matrix.querySelector('[data-cell="view_phi:nurse:yes"]')).not.toBeNull();
    expect(matrix.querySelector('[data-cell="manage_billing:billing:yes"]')).not.toBeNull();
    expect(within(matrix).queryByRole('switch')).toBeNull();
    expect(within(matrix).queryByRole('checkbox')).toBeNull();
    expect(screen.getByText(/do not see\s+clinical records unless they take a clinical seat/)).toBeInTheDocument();
  });

  it('keeps owners and admins clinical by role, with no seat switch, outside a hospital', async () => {
    await openPeople(
      overviewFixture({
        members: [
          { user_id: 'u-owner', name: 'Olivia Owner', role: 'owner', clinical_seat: true, is_clinical: true, status: 'active' },
          { user_id: 'u-admin', name: 'Adam Admin', role: 'admin', clinical_seat: true, is_clinical: true, status: 'active' },
          { user_id: 'u-desk', name: 'Fran Front', role: 'front_desk', clinical_seat: false, is_clinical: false, status: 'active' },
        ],
      }),
    );
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.getByTestId('member-u-admin')).toHaveTextContent('Clinical role');
    const matrix = screen.getByTestId('role-matrix');
    expect(matrix.querySelector('[data-cell="view_phi:owner:yes"]')).not.toBeNull();
    expect(matrix.querySelector('[data-cell="view_phi:admin:seat"]')).toBeNull();
    expect(screen.queryByText(/unless they take a clinical seat/)).toBeNull();
  });
});

describe('role capability matrix', () => {
  it('covers every capability the database function answers', () => {
    expect(MATRIX_CAPABILITIES.map((c) => c.key).sort()).toEqual(
      [
        'view_phi', 'edit_clinical', 'send_guidance', 'message_patients', 'manage_billing', 'manage_team',
        'manage_ehr', 'manage_settings', 'invite_patients', 'export_data', 'bulk_message', 'view_audit',
        'assign_patients',
      ].sort(),
    );
    expect(MATRIX_ROLES.length).toBeGreaterThan(5);
  });

  it('follows the documented defaults', () => {
    expect(matrixCell('front_desk', 'view_phi')).toBe('yes');
    expect(matrixCell('front_desk', 'edit_clinical')).toBe('no');
    expect(matrixCell('nurse', 'send_guidance')).toBe('yes');
    expect(matrixCell('sub_admin', 'view_audit')).toBe('yes');
    expect(matrixCell('provider', 'manage_team')).toBe('no');
    expect(matrixCell('staff', 'view_phi')).toBe('no');
    expect(matrixCell('owner', 'manage_team')).toBe('yes');
    expect(matrixCell('owner', 'edit_clinical', true)).toBe('seat');
    expect(matrixCell('owner', 'edit_clinical')).toBe('yes');
    expect(matrixCell('admin', 'view_phi')).toBe('yes');
  });
});

describe('scribe tab', () => {
  async function openScribe() {
    answer(overviewFixture());
    renderPage();
    await screen.findByTestId('stat-clinician-seats');
    openTab('Scribe');
    await screen.findByTestId('scribe-pool-figures');
  }

  it('shows the pool, pack minutes remaining, and who used what', async () => {
    await openScribe();
    expect(screen.getByTestId('scribe-pool-figures')).toHaveTextContent('120 min of 600 min used');
    expect(screen.getByTestId('scribe-pack-remaining')).toHaveTextContent('300 min');
    expect(screen.getByText(/shared by the whole practice; you decide how to divide them/)).toBeInTheDocument();
    expect(screen.getByTestId('scribe-row-u-doc')).toHaveTextContent('40 min');
  });

  it('saves a per-person cap, and clears one with an empty box', async () => {
    await openScribe();
    const input = screen.getByLabelText('Scribe cap in minutes for Olivia Owner');
    fireEvent.change(input, { target: { value: '150' } });
    fireEvent.click(within(screen.getByTestId('scribe-row-u-owner')).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_scribe_member_cap', {
        _practice_id: 'p1',
        _user_id: 'u-owner',
        _cap_minutes: 150,
      }),
    );

    const docInput = screen.getByLabelText('Scribe cap in minutes for Dan Doctor');
    expect(docInput).toHaveValue(200);
    fireEvent.change(docInput, { target: { value: '' } });
    fireEvent.click(within(screen.getByTestId('scribe-row-u-doc')).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_scribe_member_cap', {
        _practice_id: 'p1',
        _user_id: 'u-doc',
        _cap_minutes: null,
      }),
    );
  });

  it('refuses a negative or fractional cap', async () => {
    await openScribe();
    fireEvent.change(screen.getByLabelText('Scribe cap in minutes for Olivia Owner'), { target: { value: '-5' } });
    expect(within(screen.getByTestId('scribe-row-u-owner')).getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Scribe cap in minutes for Olivia Owner'), { target: { value: '1.5' } });
    expect(within(screen.getByTestId('scribe-row-u-owner')).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('starts a pack checkout from the scribe tab', async () => {
    await openScribe();
    invoke.mockResolvedValue({ data: { url: 'https://checkout.example/pack' }, error: null });
    const redirect = vi.spyOn(account, 'redirectToCheckout').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: /Buy a minutes pack/ }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('create-addon-checkout', {
        body: { practice_id: 'p1', kind: 'scribe_pack', quantity: 1 },
      }),
    );
    redirect.mockRestore();
  });
});

describe('add-ons tab', () => {
  async function openAddons() {
    answer(overviewFixture());
    renderPage();
    await screen.findByTestId('stat-clinician-seats');
    openTab('Add-ons');
    await screen.findByTestId('addon-clinician_seat');
  }

  it('shows each add-on with the price from the overview, and the support note', async () => {
    await openAddons();
    expect(screen.getByTestId('addon-clinician_seat')).toHaveTextContent('$29 per seat');
    expect(screen.getByTestId('addon-staff_seat')).toHaveTextContent('$9 per seat');
    expect(screen.getByTestId('addon-staff_seat')).toHaveTextContent('Every staff member needs a seat');
    expect(screen.getByTestId('addon-scribe_pack')).toBeInTheDocument();
    expect(screen.getByText(/Priority support applies to Clinic and above/)).toBeInTheDocument();
  });

  it('sends the chosen quantity and goes to the checkout the server returns', async () => {
    await openAddons();
    // Cast to the module's own export: the page calls it through the hook module.
    const redirect = vi.spyOn(account, 'redirectToCheckout').mockImplementation(() => {});
    invoke.mockResolvedValue({ data: { url: 'https://checkout.example/seats' }, error: null });
    fireEvent.change(within(screen.getByTestId('addon-staff_seat')).getByLabelText('Seats'), {
      target: { value: '3' },
    });
    fireEvent.click(within(screen.getByTestId('addon-staff_seat')).getByRole('button', { name: /Add staff seats/ }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('create-addon-checkout', {
        body: { practice_id: 'p1', kind: 'staff_seat', quantity: 3 },
      }),
    );
    redirect.mockRestore();
  });

  it('says add-ons are coming, with a contact link, when the server has no price set up', async () => {
    await openAddons();
    invoke.mockResolvedValue({ data: { error: 'addon_not_configured' }, error: null });
    fireEvent.click(screen.getByRole('button', { name: /Add clinician seats/ }));
    const note = await screen.findByTestId('addon-not-configured');
    expect(note).toHaveTextContent('Add-ons will be available shortly; contact us');
    expect(within(note).getByRole('link')).toHaveAttribute('href', expect.stringMatching(/^mailto:/));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('treats a not-configured refusal sent as an HTTP error the same way', async () => {
    await openAddons();
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        context: { status: 400, text: async () => JSON.stringify({ error: 'addon_not_configured' }) },
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Add staff seats/ }));
    expect(await screen.findByTestId('addon-not-configured')).toBeInTheDocument();
  });

  it('reports other failures plainly', async () => {
    await openAddons();
    invoke.mockResolvedValue({ data: { error: 'Payment provider unavailable' }, error: null });
    fireEvent.click(screen.getByRole('button', { name: /Add staff seats/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Payment provider unavailable'));
    expect(screen.queryByTestId('addon-not-configured')).toBeNull();
  });
});

describe('partnership tab', () => {
  async function openPartnership(partner?: Record<string, unknown>) {
    answer(overviewFixture(partner ? { partner } : {}));
    renderPage();
    await screen.findByTestId('stat-clinician-seats');
    openTab('Partnership');
  }

  it('explains the programme and submits a request', async () => {
    await openPartnership();
    expect(await screen.findByText(/separate agreement/)).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Request partnership' });
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByLabelText('How should we contact you?'), { target: { value: 'Pat, pat@hospital.org' } });
    fireEvent.change(screen.getByLabelText('Tell us about your institution'), { target: { value: 'A hospital group' } });
    expect(send).toBeEnabled();
    fireEvent.click(send);
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('request_partnership', {
        _practice_id: 'p1',
        _contact: 'Pat, pat@hospital.org',
        _message: 'A hospital group',
      }),
    );
  });

  it('shows a requested status instead of the form', async () => {
    await openPartnership({ status: 'requested', revenue_share_pct: null, referral_slug: null });
    expect(await screen.findByTestId('partner-requested')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request partnership' })).toBeNull();
  });

  it('shows the revenue share and referral slug when active, and says the link comes from the team', async () => {
    await openPartnership({ status: 'active', revenue_share_pct: 15, referral_slug: 'harbour-health' });
    const active = await screen.findByTestId('partner-active');
    expect(active).toHaveTextContent('15%');
    expect(active).toHaveTextContent('harbour-health');
    expect(active).toHaveTextContent('shared by our team once the agreement is signed');
    expect(within(active).queryByRole('link')).toBeNull();
  });
});
