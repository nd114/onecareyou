import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import {
  threadNotice,
  toMessageCounterparty,
  type MessageCounterparty,
} from '@/lib/message-thread-status';

/**
 * No message into the void, as the patient sees it.
 *
 * The composer stayed open after a share ended, expired, or a hospital took a
 * clinician off the patient's care, and what the patient wrote was read by
 * nobody. The database now refuses those messages; the screen must close the
 * composer, say why, and offer the next step — and must keep it open, with an
 * explanation, when a departed clinician's hospital thread is covered.
 */

const base: MessageCounterparty = {
  clinicianUserId: 'dr-1',
  clinicianName: 'Dr Ada Obi',
  practiceId: null,
  practiceName: null,
  canSend: false,
  reason: 'open',
  endedAt: null,
  endedByPatient: false,
  continuesWith: [],
};

describe('threadNotice', () => {
  it('says nothing for an open private thread', () => {
    expect(threadNotice({ ...base, canSend: true })).toBeNull();
  });

  it('tells a patient they stopped sharing, on which day, and offers to reconnect', () => {
    const n = threadNotice({
      ...base, reason: 'sharing_stopped', endedByPatient: true, endedAt: '2026-09-03T10:00:00Z',
    })!;
    expect(n.text).toBe(
      "You stopped sharing with Dr Ada Obi on Sep 3, 2026. Messages can't be sent in this conversation.",
    );
    expect(n.action).toEqual({ label: 'Share with Dr Ada Obi again', to: '/care-circle' });
  });

  it('does not claim the patient ended a share someone else ended', () => {
    const n = threadNotice({ ...base, reason: 'sharing_stopped', endedAt: '2026-09-03T10:00:00Z' })!;
    expect(n.text.startsWith('Sharing with Dr Ada Obi ended on Sep 3, 2026.')).toBe(true);
  });

  it('names the hospital when the patient stopped sharing with it', () => {
    const n = threadNotice({
      ...base, practiceId: 'h-1', practiceName: 'Lagos Island Hospital', reason: 'sharing_stopped', endedByPatient: true,
    })!;
    expect(n.text).toBe("You stopped sharing with Lagos Island Hospital. Messages can't be sent in this conversation.");
    expect(n.action?.to).toBe('/care-circle');
  });

  it('says a share expired, with the date', () => {
    const n = threadNotice({ ...base, reason: 'share_expired', endedAt: '2026-08-01T12:00:00Z' })!;
    expect(n.text).toContain('expired on Aug 1, 2026');
  });

  it('keeps a covered hospital thread open and says who reads it', () => {
    const n = threadNotice({
      ...base,
      canSend: true,
      reason: 'covered',
      practiceId: 'h-1',
      practiceName: 'Lagos Island Hospital',
      continuesWith: [{ userId: 'dr-2', name: 'Dr Bo Ade' }, { userId: 'dr-3', name: 'Dr Cy Eze' }],
    })!;
    expect(n.text).toBe(
      'Dr Ada Obi has left Lagos Island Hospital. Messages here are read by the team looking after you there, including Dr Bo Ade and Dr Cy Eze.',
    );
    expect(n.action).toEqual({ label: 'Message Dr Bo Ade', clinicianUserId: 'dr-2' });
  });

  it('says so when a clinician left and nobody has taken over', () => {
    const n = threadNotice({ ...base, reason: 'clinician_left', practiceId: 'h-1', practiceName: 'Lagos Island Hospital' })!;
    expect(n.text).toContain('Dr Ada Obi has left Lagos Island Hospital, and nobody there has taken over your care yet.');
    expect(n.action).toBeUndefined();
  });

  it('points to who the care continues with when a clinician is taken off it', () => {
    const n = threadNotice({
      ...base, reason: 'not_on_care_team', practiceId: 'h-1', practiceName: 'Lagos Island Hospital',
      continuesWith: [{ userId: 'dr-2', name: 'Dr Bo Ade' }],
    })!;
    expect(n.text).toBe(
      "Dr Ada Obi is no longer on your care team at Lagos Island Hospital. Your care there continues with Dr Bo Ade. Messages can't be sent in this conversation.",
    );
    expect(n.action?.clinicianUserId).toBe('dr-2');
  });

  it('sends a caregiver on a clinician link to alert contacts', () => {
    const n = threadNotice({ ...base, clinicianName: 'Carol', reason: 'not_a_clinician' })!;
    expect(n.text).toContain("Carol doesn't have a clinician account");
    expect(n.action?.to).toBe('/settings#alerts');
  });
});

describe('toMessageCounterparty', () => {
  it('reads a server row', () => {
    const c = toMessageCounterparty({
      clinician_user_id: 'dr-1', clinician_name: 'Dr Ada Obi', practice_id: 'h-1', practice_name: 'LIH',
      can_send: true, reason: 'covered', ended_at: null, ended_by_patient: false,
      continues_with: [{ user_id: 'dr-2', name: 'Dr Bo Ade' }],
    });
    expect(c.canSend).toBe(true);
    expect(c.reason).toBe('covered');
    expect(c.continuesWith).toEqual([{ userId: 'dr-2', name: 'Dr Bo Ade' }]);
  });

  it('treats anything but an explicit yes as closed, and an unknown reason as no connection', () => {
    const c = toMessageCounterparty({ clinician_user_id: 'dr-1', reason: 'something_new' });
    expect(c.canSend).toBe(false);
    expect(c.reason).toBe('no_connection');
    expect(threadNotice(c)?.text).toContain("Messages can't be sent");
  });
});

// ---------------------------------------------------------------------------
// The Messages page: the composer follows the server's answer
// ---------------------------------------------------------------------------

const counterparties = vi.hoisted(() => ({ rows: [] as unknown[] }));
const sent = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock('@/hooks/useMessages', () => ({
  useMessageCounterparties: () => ({ data: counterparties.rows, isLoading: false }),
  useMessageThreads: () => ({ data: [] }),
  useMessages: () => ({
    messages: [],
    isLoading: false,
    send: { mutate: sent.mutate, mutateAsync: sent.mutate, isPending: false },
    markRead: { mutate: vi.fn() },
    unreadCount: 0,
  }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'patient-1' } }) }));
vi.mock('@/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/components/layout/SectionTabs', () => ({ SectionTabs: () => null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}), send: () => {} }),
    removeChannel: () => {},
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
  },
}));

afterEach(() => cleanup());

async function renderMessages() {
  const { default: Messages } = await import('@/pages/Messages');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const client = new QueryClient();
  render(
    <HelmetProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Messages />
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

describe('Messages page', () => {
  it('shows why a thread is closed instead of a composer, with the next step', async () => {
    counterparties.rows = [
      {
        ...base, reason: 'sharing_stopped', endedByPatient: true, endedAt: '2026-09-03T10:00:00Z',
      },
    ];
    await renderMessages();
    expect(await screen.findByText(/You stopped sharing with Dr Ada Obi on Sep 3, 2026/)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/^Message Dr/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Share with Dr Ada Obi again' }).getAttribute('href')).toBe('/care-circle');
  });

  it('keeps the composer for a covered hospital thread, says who reads it, and can switch to them', async () => {
    counterparties.rows = [
      {
        ...base, canSend: true, reason: 'covered', practiceId: 'h-1', practiceName: 'Lagos Island Hospital',
        continuesWith: [{ userId: 'dr-2', name: 'Dr Bo Ade' }],
      },
      { ...base, clinicianUserId: 'dr-2', clinicianName: 'Dr Bo Ade', canSend: true, reason: 'open',
        practiceId: 'h-1', practiceName: 'Lagos Island Hospital' },
    ];
    await renderMessages();
    expect(await screen.findByText(/Dr Ada Obi has left Lagos Island Hospital/)).toBeTruthy();
    expect(screen.getByPlaceholderText(/^Message Dr Ada Obi/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Message Dr Bo Ade' }));
    expect(screen.queryByText(/has left Lagos Island Hospital/)).toBeNull();
  });
});
