import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, waitFor, fireEvent } from '@testing-library/react';

// The two dialogs the rail can open reach for auth and react-query on mount.
// This suite is about the rail's own decisions — which jumps it offers, and
// whether the actions survive an environment with no IntersectionObserver —
// so they stand in as buttons rather than dragging the app shell in.
vi.mock('@/components/clinician/CreateTaskDialog', () => ({
  CreateTaskDialog: ({ open }: { open: boolean }) => (open ? <div>Task dialog</div> : null),
}));
vi.mock('@/components/clinician/ReferralDialog', () => ({
  ReferralDialog: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

import { PatientActionRail } from '@/components/clinician/PatientActionRail';

afterEach(cleanup);

/**
 * The rail carries the patient's name down a fifteen-tab chart. Two things have
 * to hold whatever the environment does: the actions must work without an
 * IntersectionObserver, and a non-clinical member must not be offered a jump to
 * a tab they cannot open.
 */
function mount(props: Partial<React.ComponentProps<typeof PatientActionRail>> = {}) {
  const onJump = vi.fn();
  render(
    <PatientActionRail
      patientName="Adaeze Okonkwo"
      patientUserId="patient-1"
      isClinicalStaff
      onJump={onJump}
      guidanceAction={<button type="button">Send guidance</button>}
      alertAction={<button type="button">Set alert</button>}
      {...props}
    />,
  );
  return { onJump };
}

describe('PatientActionRail', () => {
  it('always renders the actions, whatever the identity strip is doing', () => {
    mount();
    expect(screen.getByText('Send guidance')).toBeTruthy();
    expect(screen.getByText('Set alert')).toBeTruthy();
    // jsdom has no IntersectionObserver, so the strip never reveals — the
    // actions must not have been made to depend on it.
    expect(screen.getByText('Adaeze Okonkwo')).toBeTruthy();
  });

  it('opens the tab a jump names', async () => {
    const { onJump } = mount();

    // Radix opens the menu on keyboard activation, which is the path a
    // clinician on a keyboard takes anyway.
    fireEvent.keyDown(screen.getByLabelText('More patient actions'), { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('Message')).toBeTruthy());
    fireEvent.click(screen.getByText('Message'));

    expect(onJump).toHaveBeenCalledWith('messages');
  });

  it('does not offer clinical tabs to non-clinical staff', async () => {
    mount({ isClinicalStaff: false });

    // Radix opens the menu on keyboard activation, which is the path a
    // clinician on a keyboard takes anyway.
    fireEvent.keyDown(screen.getByLabelText('More patient actions'), { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('Message')).toBeTruthy());

    // Front desk can reach messages; notes and encounters are not theirs and
    // the tabs are not rendered for them either.
    expect(screen.queryByText('My notes')).toBeNull();
    expect(screen.queryByText('Start encounter')).toBeNull();
    // Nor the two that start clinical work.
    expect(screen.queryByText('Add task')).toBeNull();
    expect(screen.queryByText('Refer')).toBeNull();
  });

  it('offers a clinician the actions that start something', async () => {
    mount();

    fireEvent.keyDown(screen.getByLabelText('More patient actions'), { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('Add task')).toBeTruthy());

    expect(screen.getByText('Start encounter')).toBeTruthy();
    expect(screen.getByText('Refer')).toBeTruthy();
  });
});
