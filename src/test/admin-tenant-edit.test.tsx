import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * The edit dialog opened with Active switched on whatever the tenant was, so
 * saving any edit to a suspended tenant reactivated it. These cases hold the
 * dialog to the tenant's own state and the tenant list to showing it.
 */

const updateTenant = vi.fn().mockResolvedValue(undefined);

vi.mock('@/hooks/useAdminOps', () => ({
  useAdminOps: () => ({
    updateTenant,
    isUpdating: false,
    inviteOwner: vi.fn(),
    isInviting: false,
    setTenantSlug: vi.fn(),
    isSavingSlug: false,
  }),
}));

let tenants: unknown[] = [];
vi.mock('@/hooks/useAdminTenants', () => ({
  useAdminTenants: () => ({ tenants, isLoading: false }),
}));

vi.mock('@/components/admin/CreateTenantDialog', () => ({ CreateTenantDialog: () => null }));

import { AdminTenantRowActions } from '@/components/admin/AdminTenantRowActions';
import { AdminTenantsCard } from '@/components/admin/AdminTenantsCard';
import type { AdminTenantRow } from '@/hooks/useAdminTenants';

function tenant(isActive: boolean | undefined): AdminTenantRow {
  return {
    id: 't1',
    name: 'Suspended Clinic',
    slug: null,
    tenant_type: 'practice',
    city: null,
    country: null,
    subscription_tier: 'solo',
    revenue_share_pct: 0,
    storage_limit_gb: 25,
    storage_bytes: 0,
    member_count: 1,
    active_share_count: 0,
    created_at: '2026-01-01',
    is_active: isActive as boolean,
  };
}

async function openAndSave() {
  fireEvent.click(screen.getByRole('button', { name: 'Edit tenant' }));
  const dialog = await screen.findByRole('dialog');
  const toggle = dialog.querySelector('[role="switch"]') as HTMLElement;
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(updateTenant).toHaveBeenCalled());
  return { toggle, sent: updateTenant.mock.calls[0][0] };
}

describe('editing a tenant', () => {
  beforeEach(() => updateTenant.mockClear());

  it('opens a suspended tenant as inactive, and saving leaves it suspended', async () => {
    render(<AdminTenantRowActions tenant={tenant(false)} />);
    const { toggle, sent } = await openAndSave();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(sent.is_active).not.toBe(true);
  });

  it('sends a change of state only when the switch was moved', async () => {
    render(<AdminTenantRowActions tenant={tenant(false)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit tenant' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(dialog.querySelector('[role="switch"]') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateTenant).toHaveBeenCalled());
    expect(updateTenant.mock.calls[0][0].is_active).toBe(true);
  });

  it('does not reactivate anything when the state is missing from the row', async () => {
    render(<AdminTenantRowActions tenant={tenant(undefined)} />);
    const { sent } = await openAndSave();
    expect(sent.is_active).toBeUndefined();
  });
});

describe('the tenant list', () => {
  it('marks a suspended tenant Inactive and a live one not', () => {
    tenants = [
      { ...tenant(false), id: 'a', name: 'Suspended Clinic' },
      { ...tenant(true), id: 'b', name: 'Live Hospital' },
    ];
    render(
      <MemoryRouter>
        <AdminTenantsCard />
      </MemoryRouter>,
    );
    const suspendedRow = screen.getByText('Suspended Clinic').closest('div.rounded-lg') as HTMLElement;
    const liveRow = screen.getByText('Live Hospital').closest('div.rounded-lg') as HTMLElement;
    expect(suspendedRow).toHaveTextContent('Inactive');
    expect(liveRow).not.toHaveTextContent('Inactive');
  });
});
