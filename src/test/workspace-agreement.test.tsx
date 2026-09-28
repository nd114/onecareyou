import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * The Practice screens (usePractice) and every `can(...)` gate
 * (useClinicianCapabilities) must name the same workspace. 1890df3 and 84c5e90
 * made them share the stored choice; these cases are the ones where they still
 * resolved it differently, because usePractice only offers active practices and
 * takes them in whatever order the query returned, while the capability hook
 * took every active membership, earliest first.
 */

type Row = Record<string, unknown>;
let db: Record<string, Row[]> = {};

function builder(table: string) {
  let rows = [...(db[table] ?? [])];
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
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve, reject),
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
    db = {
      clinician_profiles: [{ id: 'cp1', user_id: 'u1' }],
    };
  });

  it('skips a retired practice rather than answering for it', async () => {
    // The earliest membership is in a practice that has since been retired.
    // usePractice no longer offers it and shows the hospital; the gates kept
    // answering as its owner.
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

  it('does not keep answering for a chosen practice after it is retired', async () => {
    localStorage.setItem('onecare:workspace:u1', 'retired');
    db.practices = [practice('hospital', true), practice('retired', false)];
    db.practice_members = [
      membership('hospital', 'clinician', '2026-02-01'),
      membership('retired', 'owner', '2026-01-01'),
    ];

    const { screens, gates } = await resolveBoth();
    expect(screens.currentPractice?.id).toBe('hospital');
    expect(gates.practiceId).toBe('hospital');
    expect(gates.can('manage_team')).toBe(false);
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
