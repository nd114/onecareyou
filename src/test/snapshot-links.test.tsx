import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createSupabaseMock, type MockConfig } from './support/supabase-mock';
import {
  buildSnapshotUrl,
  describeContents,
  readSnapshotToken,
  snapshotLinkState,
} from '@/lib/snapshot-links';

/**
 * Read-only snapshot links, client side.
 *
 * The database decides what a link opens (supabase/tests/read_only_snapshot_links.test.sql).
 * What is pinned here is what only the client can get wrong: that the token
 * travels in the fragment and a POST body and nowhere else, that the viewer
 * shows nothing until the edge function says ok, that a withdrawn document is
 * marked in place rather than dropped, and that the patient's list offers
 * revoke only where there is something to revoke.
 */

const { mock } = vi.hoisted(() => ({
  mock: { current: null as null | ReturnType<typeof createSupabaseMock> },
}));

vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return mock.current?.client;
  },
}));

// A signed-in patient for the list; the viewer page never reads it, which is
// part of what is being tested (it must work with nobody signed in).
vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const TOKEN = 'A'.repeat(20) + '_-' + 'b'.repeat(21); // 43 base64url characters

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

describe('the link itself', () => {
  it('puts the token in the fragment, never the path or query', () => {
    const url = buildSnapshotUrl('https://onecare.you/', TOKEN);
    expect(url).toBe(`https://onecare.you/s#${TOKEN}`);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/s');
    expect(parsed.search).toBe('');
    expect(parsed.hash).toBe(`#${TOKEN}`);
  });

  it('reads back only a token of the right shape', () => {
    expect(readSnapshotToken(`#${TOKEN}`)).toBe(TOKEN);
    expect(readSnapshotToken('#short')).toBeNull();
    expect(readSnapshotToken(`#${TOKEN}x`)).toBeNull();
    expect(readSnapshotToken(`#${TOKEN.slice(0, 42)}/`)).toBeNull();
    expect(readSnapshotToken('')).toBeNull();
  });

  it('describes the contents in a plain sentence, documents counted', () => {
    expect(describeContents(['medications', 'vitals'], 0)).toBe('vitals and medications');
    expect(describeContents(['allergies', 'documents', 'vitals'], 1)).toBe('vitals, allergies and 1 document');
    expect(describeContents(['documents'], 3)).toBe('3 documents');
  });

  it('reports revoked before expired before locked', () => {
    const now = new Date('2026-10-01T12:00:00Z');
    const live = { expires_at: '2026-10-02T00:00:00Z', revoked_at: null, locked: false };
    expect(snapshotLinkState(live, now)).toBe('active');
    expect(snapshotLinkState({ ...live, locked: true }, now)).toBe('locked');
    expect(snapshotLinkState({ ...live, expires_at: '2026-10-01T12:00:00Z' }, now)).toBe('expired');
    expect(snapshotLinkState({ ...live, revoked_at: '2026-09-30T00:00:00Z', expires_at: '2026-09-01T00:00:00Z' }, now)).toBe('revoked');
  });
});

async function wrap(ui: React.ReactNode) {
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const { MemoryRouter } = await import('react-router-dom');
  const { HelmetProvider } = await import('react-helmet-async');
  const { AuthProvider } = await import('@/contexts/AuthContext');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <HelmetProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AuthProvider>{ui}</AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

const OK_SNAPSHOT = {
  status: 'ok',
  sharer_first_name: 'Ada',
  created_at: '2026-09-28T10:00:00Z',
  expires_at: '2026-10-05T10:00:00Z',
  categories: ['medications', 'documents'],
  snapshot: { medications: [{ name: 'Salbutamol', dosage: '100mcg', frequency: 'as needed' }] },
  documents: [
    { id: 'd1', title: 'Chest X-ray', document_date: '2026-09-01', available: true },
    { id: 'd2', title: 'Discharge letter', document_date: '2026-08-01', available: false },
  ],
};

async function renderViewer(functions: MockConfig['functions'], hash = `#${TOKEN}`) {
  window.location.hash = hash;
  mock.current = createSupabaseMock({ user: null, functions });
  const { default: SnapshotViewer } = await import('@/pages/SnapshotViewer');
  render(await wrap(<SnapshotViewer />));
}

describe('the viewer page', () => {
  it('sends the token in the POST body and shows the snapshot, branded and read-only', async () => {
    await renderViewer({ 'view-snapshot-link': { data: OK_SNAPSHOT, error: null } });

    expect(await screen.findByText('Shared by Ada via OneCare')).toBeTruthy();
    expect(screen.getByText(/Read-only/)).toBeTruthy();
    expect(screen.getByText('Salbutamol')).toBeTruthy();
    // Categories that were not chosen get no heading at all.
    expect(screen.queryByText('Vitals')).toBeNull();
    expect(screen.queryByText('Allergies')).toBeNull();

    const invokes = mock.current!.calls.filter((c) => c.kind === 'invoke');
    expect(invokes).toHaveLength(1);
    expect(invokes[0]).toMatchObject({ target: 'view-snapshot-link', payload: { token: TOKEN } });
  });

  it('marks a withdrawn document in its place, with nothing to open', async () => {
    await renderViewer({ 'view-snapshot-link': { data: OK_SNAPSHOT, error: null } });
    await screen.findByText('Discharge letter');
    expect(screen.getByText(/No longer available/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Open' })).toHaveLength(1);
  });

  it('shows nothing of the record until the passcode is accepted', async () => {
    const seen: unknown[] = [];
    await renderViewer({
      'view-snapshot-link': (body) => {
        seen.push(body);
        const b = body as { passcode?: string };
        return b.passcode === '123456'
          ? { data: OK_SNAPSHOT, error: null }
          : { data: { status: b.passcode ? 'passcode_wrong' : 'passcode_required', sharer_first_name: 'Ada' }, error: null };
      },
    });

    expect(await screen.findByText('Enter the passcode')).toBeTruthy();
    expect(screen.queryByText('Salbutamol')).toBeNull();

    fireEvent.change(screen.getByLabelText('Passcode'), { target: { value: '111111' } });
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(await screen.findByText('That passcode is not right.')).toBeTruthy();
    expect(screen.queryByText('Salbutamol')).toBeNull();

    fireEvent.change(screen.getByLabelText('Passcode'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(await screen.findByText('Salbutamol')).toBeTruthy();
  });

  it.each([
    ['revoked', /stopped sharing/],
    ['expired', /has expired/],
    ['not_found', /does not work/],
    ['locked', /too many wrong passcodes/],
  ])('says plainly when the link is %s', async (status, text) => {
    await renderViewer({ 'view-snapshot-link': { data: { status }, error: null } });
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.queryByText(/Shared by/)).toBeNull();
  });

  it('does not call the server at all without a well-formed token', async () => {
    await renderViewer({ 'view-snapshot-link': { data: OK_SNAPSHOT, error: null } }, '#nope');
    expect(await screen.findByText(/does not work/)).toBeTruthy();
    expect(mock.current!.calls.filter((c) => c.kind === 'invoke')).toHaveLength(0);
  });
});

describe("the patient's list of links", () => {
  beforeEach(() => {
    mock.current = createSupabaseMock({
      rpcs: {
        list_my_snapshot_links: {
          data: [
            {
              id: 'live', label: 'For Mum', categories: ['vitals'], document_count: 0,
              created_at: '2026-09-27T10:00:00Z', expires_at: '2099-01-01T00:00:00Z', revoked_at: null,
              has_passcode: true, locked: false, view_count: 3, last_viewed_at: '2026-09-28T09:00:00Z',
            },
            {
              id: 'gone', label: 'For the dentist', categories: ['medications'], document_count: 0,
              created_at: '2026-09-01T10:00:00Z', expires_at: '2099-01-01T00:00:00Z', revoked_at: '2026-09-02T10:00:00Z',
              has_passcode: false, locked: false, view_count: 0, last_viewed_at: null,
            },
          ],
          error: null,
        },
        revoke_snapshot_link: { data: '2026-09-28T12:00:00Z', error: null },
      },
    });
  });

  it('shows views and offers revoke only on a live link, confirmed first', async () => {
    const { SnapshotLinksCard } = await import('@/components/patient/SnapshotLinksCard');
    render(await wrap(<SnapshotLinksCard />));

    expect(await screen.findByText('For Mum')).toBeTruthy();
    expect(screen.getByText(/Opened 3 times/)).toBeTruthy();
    expect(screen.getByText('Revoked')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Revoke the link: For the dentist/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Revoke the link: For Mum/ }));
    expect(mock.current!.calls.some((c) => c.target === 'revoke_snapshot_link')).toBe(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke link' }));
    await waitFor(() =>
      expect(mock.current!.calls).toContainEqual(
        expect.objectContaining({ kind: 'rpc', target: 'revoke_snapshot_link', payload: { _link_id: 'live' } }),
      ),
    );
  });
});
