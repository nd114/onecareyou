import { describe, expect, it } from 'vitest';
import { describeOffboardingImpact, parseOffboardingImpact } from '@/lib/offboarding';
import { describeNotification } from '@/lib/notification-display';

const raw = {
  status: 'active',
  role: 'provider',
  is_owner: false,
  other_active_owners: 1,
  blocked_reason: null,
  open_assignments: 3,
  patients_left_unassigned: 2,
  unsigned_drafts: 1,
  unfiled_dictations: 2,
  open_tasks: 4,
  future_appointments: 1,
  pending_proposals: 1,
  lead_departments: ['Cardiology'],
};

describe('offboarding impact', () => {
  it('parses what the server returns, and survives what it does not', () => {
    const impact = parseOffboardingImpact(raw);
    expect(impact.openAssignments).toBe(3);
    expect(impact.leadDepartments).toEqual(['Cardiology']);
    expect(impact.blockedReason).toBeNull();

    const empty = parseOffboardingImpact(null);
    expect(empty.unsignedDrafts).toBe(0);
    expect(empty.leadDepartments).toEqual([]);
  });

  it('says what happens to each thing, in plain words', () => {
    const lines = describeOffboardingImpact(parseOffboardingImpact(raw));
    const text = lines.join('\n');
    expect(text).toContain('3 patient assignments will end. 2 patients will then have nobody assigned');
    expect(text).toContain('1 unsigned note will be frozen as "unsigned — author departed"');
    expect(text).toContain('Nothing is deleted');
    expect(text).toContain('2 unfiled dictations');
    expect(text).toContain('4 open tasks');
    expect(text).toContain('1 future appointment');
    expect(text).toContain('1 medication proposal');
    expect(text).toContain('They lead Cardiology');
    // The one line that is always there: what the person loses.
    expect(lines[lines.length - 1]).toMatch(/lose access .* including what they wrote here/);
  });

  it('leaves out what is not there, rather than listing zeros', () => {
    const lines = describeOffboardingImpact(
      parseOffboardingImpact({ ...raw, open_assignments: 0, unsigned_drafts: 0, unfiled_dictations: 0,
        open_tasks: 0, future_appointments: 0, pending_proposals: 0, lead_departments: [] }),
    );
    expect(lines).toHaveLength(1);
  });

  it('speaks to the person themselves when they are leaving', () => {
    const lines = describeOffboardingImpact(parseOffboardingImpact(raw), true);
    expect(lines.join('\n')).toContain('You lead Cardiology');
    expect(lines[lines.length - 1]).toMatch(/^You will lose access/);
  });

  it('carries the refusal for the only owner', () => {
    const impact = parseOffboardingImpact({ ...raw, is_owner: true, other_active_owners: 0,
      blocked_reason: 'This is the only owner. Appoint another owner first.' });
    expect(impact.blockedReason).toMatch(/another owner/);
  });
});

describe('the departed-drafts notice', () => {
  it('shows the server’s words and is closed by deciding, not by acknowledging', () => {
    const open = describeNotification({
      notification_type: 'departed_author_drafts',
      message: 'Dr L left Handover General with an unsigned note for Ada L.',
      acknowledged_at: null,
    });
    expect(open.title).toBe('Unsigned — author departed');
    expect(open.body).toContain('unsigned note for Ada L.');
    expect(open.acknowledgeable).toBe(false);

    const done = describeNotification({
      notification_type: 'departed_author_drafts',
      message: 'x',
      acknowledged_at: '2026-09-28T00:00:00Z',
    });
    expect(done.title).toBe('Draft resolved');
  });
});
