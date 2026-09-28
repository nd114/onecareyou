import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * The Practice screens (usePractice) and every `can(...)` gate
 * (useClinicianCapabilities) must name the same workspace. 1890df3 and 84c5e90
 * made them share the stored choice; these cases are the ones where they still
 * resolved it differently, because usePractice took practices in whatever order
 * the query returned, while the capability hook took every membership, earliest
 * first.
 *
 * Inactive practices are workspaces too: the database keeps their staff's
 * access, so they are offered (marked Inactive), honoured when chosen, and never
 * the default while an active practice exists.
 */

type Row = Record<string, unknown>;
let db: Record<string, Row[]> = {};
/** Tables whose reads come back as an error. */
let failing = new Set<string>();

function builder(table: string) {
  let rows = [...(db[table] ?? [])];
  const error = failing.has(table) ? { message: `${table} unavailable` } : null;
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (column: string, value: unknown) => {
      rows = rows.filter((row) => !(column in row) || row[column] === value);
      return b;
    },
    in: (column: string, values: unknown[]) => {
      rows = rows.filter((row) => values.includes(row[column]));
      return b;
    },
    order: (column: string, options?: { ascending?: boolean }) => {
      const direction = options?.ascending === false ? -1 : 1;
      rows = [...rows].sort(
        (x, y) => (String(x[column]) < String(y[column]) ? -1 : String(x[column]) > String(y[column]) ? 1 : 0) * direction,
      );
      return b;
    },
    or: () => b,
    is: () => b,
    maybeSingle: () => Promise.resolve({ data: error ? null : rows[0] ?? null, error }),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: error ? null : rows, error }).then(resolve, reject),
  };
  return b;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => builder(table),
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === 'has_practice_capability') {
        const member = (db.practice_members ?? []).find(
          (row) => row.practice_id === args._practice_id && row.status === 'active',
        );
        // Only an owner manages the team; enough to tell the two roles apart.
        const granted = args._capability === 'manage_team' ? member?.role === 'owner' : !!member;
        return Promise.resolve({ data: granted, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    },
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'u1@example.com' } }),
}));

import { usePractice } from '@/hooks/usePractice';
import { useClinicianCapabilities } from '@/hooks/useClinicianCapabilities';
import { WorkspaceSelector } from '@/components/clinician/WorkspaceSelector';

function practice(id: string, isActive: boolean): Row {
  return { id, name: id, is_active: isActive };
}

function membership(practiceId: string, role: string, createdAt: string): Row {
  return { id: `m-${practiceId}`, user_id: 'u1', practice_id: practiceId, role, status: 'active', created_at: createdAt };
}

async function resolveBoth() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => ({ screens: usePractice(), gates: useClinicianCapabilities() }),
    { wrapper },
  );
  await waitFor(() => {
    expect(result.current.screens.currentPractice).not.toBeNull();
    expect(result.current.gates.loading).toBe(false);
    expect(result.current.gates.practiceId).not.toBeNull();
  });
  return result.current;
}

describe('the workspace on screen is the workspace the gates answer for', () => {
  beforeEach(() => {
    localStorage.clear();
    failing = new Set();
    db = {
      clinician_profiles: [{ id: 'cp1', user_id: 'u1' }],
    };
  });

  it('defaults to an active practice over an older inactive one, on screen and in the gates', async () => {
    // The earliest membership is in a practice that has since been made
    // inactive. With nothing chosen, both default to the live hospital; the
    // gates once kept answering as the inactive practice's owner.
    db.practices = [practice('retired', false), practice('hospital', true)];
    db.practice_members = [
      membership('retired', 'owner', '2026-01-01'),
      membership('hospital', 'clinician', '2026-02-01'),
    ];

    const { screens, gates } = await resolveBoth();
    expect(screens.currentPractice?.id).toBe('hospital');
    expect(gates.practiceId).toBe('hospital');
    expect(gates.can('manage_team')).toBe(false);
  });

  it('offers an inactive practice in the switcher, after the active ones', async () => {
    db.practices = [practice('retired', false), practice('hospital', true)];
    db.practice_members = [
      membership('retired', 'owner', '2026-01-01'),
      membership('hospital', 'clinician', '2026-02-01'),
    ];

    const { screens } = await resolveBoth();
    expect(screens.practices.map((p) => [p.id, p.is_active])).toEqual([
      ['hospital', true],
      ['retired', false],
    ]);
  });

  it('answers for an inactive practice once it is chosen, with the rights the database gives there', async () => {
    // Staff of an inactive practice keep access in the database
    // (has_practice_capability does not look at is_active), so choosing it is
    // a real workspace: the screens show it and the gates answer as its owner.
    localStorage.setItem('onecare:workspace:u1', 'retired');
    db.practices = [practice('hospital', true), practice('retired', false)];
    db.practice_members = [
      membership('hospital', 'clinician', '2026-02-01'),
      membership('retired', 'owner', '2026-01-01'),
    ];

    const { screens, gates } = await resolveBoth();
    expect(screens.currentPractice?.id).toBe('retired');
    expect(screens.currentPractice?.is_active).toBe(false);
    expect(gates.practiceId).toBe('retired');
    expect(gates.role).toBe('owner');
    expect(gates.can('manage_team')).toBe(true);
  });

  it('gives an account whose only practice is inactive that practice’s role, not the solo grant', async () => {
    // A front-desk member with a clinician profile. Were the membership
    // ignored, the solo branch would hand them every capability.
    db.practices = [practice('retired', false)];
    db.practice_members = [membership('retired', 'front_desk', '2026-01-01')];

    const { screens, gates } = await resolveBoth();
    expect(screens.currentPractice?.id).toBe('retired');
    expect(gates.practiceId).toBe('retired');
    expect(gates.can('manage_team')).toBe(false);
  });

  it('answers no to everything when the practices cannot be read', async () => {
    failing = new Set(['practices']);
    db.practices = [practice('hospital', true)];
    db.practice_members = [membership('hospital', 'owner', '2026-01-01')];

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useClinicianCapabilities(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.practiceId).toBeNull();
    expect(result.current.can('manage_team')).toBe(false);
    expect(result.current.can('view_phi')).toBe(false);
  });

  it('agrees on the default with nothing chosen, whatever order rows arrive in', async () => {
    // Two live workspaces, nothing chosen. The capability hook takes the
    // earliest membership; usePractice took the first practice row returned,
    // which is not ordered by anything.
    db.practices = [practice('hospital', true), practice('own-practice', true)];
    db.practice_members = [
      membership('hospital', 'clinician', '2026-02-01'),
      membership('own-practice', 'owner', '2026-01-01'),
    ];

    const { screens, gates } = await resolveBoth();
    expect(screens.currentPractice?.id).toBe(gates.practiceId);
    expect(screens.currentMembership?.practice_id).toBe(gates.practiceId);
  });
});

describe('the header workspace switcher', () => {
  beforeEach(() => {
    localStorage.clear();
    failing = new Set();
    db = {
      clinician_profiles: [{ id: 'cp1', user_id: 'u1' }],
      practices: [practice('Old Clinic', false), practice('City Hospital', true)],
      practice_members: [
        membership('Old Clinic', 'owner', '2026-01-01'),
        membership('City Hospital', 'clinician', '2026-02-01'),
      ],
    };
  });

  function renderSwitcher() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <WorkspaceSelector />
      </QueryClientProvider>,
    );
  }

  it('marks the current workspace Inactive when an inactive practice is chosen', async () => {
    localStorage.setItem('onecare:workspace:u1', 'Old Clinic');
    renderSwitcher();
    const trigger = await screen.findByRole('combobox', { name: 'Choose workspace' });
    await waitFor(() => expect(trigger).toHaveTextContent('Old Clinic'));
    expect(trigger).toHaveTextContent('Inactive');
  });

  it('shows no Inactive mark on an active workspace', async () => {
    renderSwitcher();
    const trigger = await screen.findByRole('combobox', { name: 'Choose workspace' });
    await waitFor(() => expect(trigger).toHaveTextContent('City Hospital'));
    expect(trigger).not.toHaveTextContent('Inactive');
  });

  it('still appears, marked, when the only workspace is inactive', async () => {
    db.practices = [practice('Old Clinic', false)];
    db.practice_members = [membership('Old Clinic', 'owner', '2026-01-01')];
    renderSwitcher();
    const trigger = await screen.findByRole('combobox', { name: 'Choose workspace' });
    await waitFor(() => expect(trigger).toHaveTextContent('Inactive'));
  });
});
