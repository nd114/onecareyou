import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import {
  conversationSubtitle,
  conversationTitle,
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
 *
 * A hospital thread is the hospital's. Its notices used to be worded as if the
 * other side were always a clinician ("Share with Dr X again" for a share that
 * was with a hospital); they now name the hospital, and a thread whose
 * clinician has gone is titled with the hospital's name.
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
  clinicianStatus: null,
};

const hospital: MessageCounterparty = {
  ...base,
  practiceId: 'h-1',
  practiceName: 'St Elsewhere General',
  clinicianStatus: 'active',
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

  it('names the hospital, not the clinician, when the patient stopped sharing with it', () => {
    const n = threadNotice({
      ...hospital, reason: 'sharing_stopped', endedByPatient: true, endedAt: '2026-09-03T10:00:00Z',
    })!;
    expect(n.text).toBe(
      "You stopped sharing with St Elsewhere General on Sep 3, 2026. Messages can't be sent in this conversation.",
    );
    expect(n.action).toEqual({ label: 'Share with St Elsewhere General again', to: '/care-circle' });
    expect(n.text).not.toContain('Dr Ada Obi');
  });

  it('says a share expired, with the date', () => {
    const n = threadNotice({ ...base, reason: 'share_expired', endedAt: '2026-08-01T12:00:00Z' })!;
    expect(n.text).toContain('expired on Aug 1, 2026');
  });

  it('keeps a covered hospital thread open and says who reads it', () => {
    const n = threadNotice({
      ...hospital,
      practiceName: 'Lagos Island Hospital',
      clinicianStatus: 'left',
      canSend: true,
      reason: 'covered',
      continuesWith: [{ userId: 'dr-2', name: 'Dr Bo Ade' }, { userId: 'dr-3', name: 'Dr Cy Eze' }],
    })!;
    expect(n.text).toBe(
      'Dr Ada Obi has left Lagos Island Hospital. Messages here are read by the team looking after you at Lagos Island Hospital, including Dr Bo Ade and Dr Cy Eze.',
    );
    expect(n.action).toEqual({ label: 'Message Dr Bo Ade', clinicianUserId: 'dr-2' });
  });

  it('does not say a clinician moved to a non-clinical role has left', () => {
    const n = threadNotice({ ...hospital, reason: 'covered', canSend: true, clinicianStatus: 'non_clinical' })!;
    expect(n.text.startsWith('Dr Ada Obi no longer sees patients at St Elsewhere General.')).toBe(true);
    expect(n.text).not.toContain('has left');
  });

  it('speaks as the hospital when a clinician left and nobody covers the patient', () => {
    const n = threadNotice({ ...hospital, reason: 'clinician_left', clinicianStatus: 'left' })!;
    expect(n.text.startsWith(
      "St Elsewhere General has no one assigned to your care right now, so messages can't be sent in this conversation.",
    )).toBe(true);
    expect(n.text).toContain('Please contact St Elsewhere General directly');
    expect(n.action).toBeUndefined();
  });

  it('says when the hospital has paused its access, and to contact it', () => {
    const n = threadNotice({ ...hospital, reason: 'practice_paused' })!;
    expect(n.text.startsWith('St Elsewhere General has paused its access to your record')).toBe(true);
    expect(n.text).toContain('Please contact St Elsewhere General directly');
  });

  it('points to who the care continues with when a clinician is taken off it', () => {
    const n = threadNotice({
      ...hospital, reason: 'not_on_care_team', practiceName: 'Lagos Island Hospital',
      continuesWith: [{ userId: 'dr-2', name: 'Dr Bo Ade' }],
    })!;
    expect(n.text).toBe(
      "Dr Ada Obi is no longer on your care team at Lagos Island Hospital. Your care there continues with Dr Bo Ade. Messages can't be sent in this conversation.",
    );
    expect(n.action?.clinicianUserId).toBe('dr-2');
  });

  it('says so when the hospital has taken the clinician off the care and nobody else is on it', () => {
    const n = threadNotice({ ...hospital, reason: 'not_on_care_team' })!;
    expect(n.text).toContain('St Elsewhere General has no one else assigned to your care right now');
  });

  it('names the hospital when there is no connection with it', () => {
    const n = threadNotice({ ...hospital, reason: 'no_connection' })!;
    expect(n.text.startsWith("You're no longer connected with St Elsewhere General.")).toBe(true);
  });

  it('does not offer caregiver alert contacts while caregivers are paused', () => {
    const n = threadNotice({ ...base, clinicianName: 'Carol', reason: 'not_a_clinician' })!;
    expect(n.text).toContain("Carol doesn't have a clinician account");
    expect(n.text).not.toMatch(/alert contact|cares for you/i);
    expect(n.action).toBeUndefined();
  });
});

describe('conversationTitle', () => {
  it('titles a hospital thread whose clinician has gone with the hospital', () => {
    expect(conversationTitle({ ...hospital, clinicianStatus: 'left' })).toBe('St Elsewhere General');
    expect(conversationTitle({ ...hospital, clinicianStatus: 'non_clinical' })).toBe('St Elsewhere General');
    expect(conversationSubtitle({ ...hospital, clinicianStatus: 'left' })).toBe('Began with Dr Ada Obi');
  });

  it("keeps the clinician's name while they are still there, with the hospital beneath", () => {
    expect(conversationTitle(hospital)).toBe('Dr Ada Obi');
    expect(conversationSubtitle(hospital)).toBe('St Elsewhere General');
  });

  it("a private thread is the clinician's", () => {
    expect(conversationTitle(base)).toBe('Dr Ada Obi');
    expect(conversationSubtitle(base)).toBeUndefined();
  });
});

describe('toMessageCounterparty', () => {
  it('reads a server row', () => {
    const c = toMessageCounterparty({
      clinician_user_id: 'dr-1', clinician_name: 'Dr Ada Obi', practice_id: 'h-1', practice_name: 'LIH',
      can_send: true, reason: 'covered', ended_at: null, ended_by_patient: false,
      continues_with: [{ user_id: 'dr-2', name: 'Dr Bo Ade' }], clinician_status: 'left',
    });
    expect(c.canSend).toBe(true);
    expect(c.reason).toBe('covered');
    expect(c.clinicianStatus).toBe('left');
    expect(c.continuesWith).toEqual([{ userId: 'dr-2', name: 'Dr Bo Ade' }]);
  });

  it('treats anything but an explicit yes as closed, and an unknown reason as no connection', () => {
    const c = toMessageCounterparty({ clinician_user_id: 'dr-1', reason: 'something_new', clinician_status: 'odd' });
    expect(c.canSend).toBe(false);
    expect(c.reason).toBe('no_connection');
    expect(c.clinicianStatus).toBeNull();
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

  it('offers to share with the hospital again, not with its clinician', async () => {
    counterparties.rows = [
      { ...hospital, reason: 'sharing_stopped', endedByPatient: true, endedAt: '2026-09-03T10:00:00Z' },
    ];
    await renderMessages();
    expect(await screen.findByText(/You stopped sharing with St Elsewhere General on Sep 3, 2026/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Share with St Elsewhere General again' }).getAttribute('href')).toBe('/care-circle');
  });

  it('keeps the composer for a covered hospital thread, calls it the hospital, and can switch to the team', async () => {
    counterparties.rows = [
      {
        ...hospital, practiceName: 'Lagos Island Hospital', clinicianStatus: 'left', canSend: true, reason: 'covered',
        continuesWith: [{ userId: 'dr-2', name: 'Dr Bo Ade' }],
      },
      { ...hospital, practiceName: 'Lagos Island Hospital', clinicianUserId: 'dr-2', clinicianName: 'Dr Bo Ade',
        canSend: true, reason: 'open' },
    ];
    await renderMessages();
    expect(await screen.findByText(/Dr Ada Obi has left Lagos Island Hospital/)).toBeTruthy();
    // The departed clinician's thread is the hospital's now, and is called so.
    expect(screen.getByPlaceholderText(/^Message Lagos Island Hospital/)).toBeTruthy();
    expect(screen.getByText('Began with Dr Ada Obi')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Message Dr Bo Ade' }));
    expect(screen.queryByText(/has left Lagos Island Hospital/)).toBeNull();
  });
});
