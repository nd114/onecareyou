import { describe, it, expect } from 'vitest';
import {
  statusFromHistory,
  isArchivedGuidance,
  ARCHIVED_STATUS,
} from '@/lib/guidance-status';

describe('statusFromHistory', () => {
  it('rebuilds the status from the events that produced it', () => {
    expect(statusFromHistory({})).toBe('pending');
    expect(statusFromHistory({ acknowledged_at: '2026-09-01T10:00:00Z' })).toBe('acknowledged');
    expect(statusFromHistory({ completed_at: '2026-09-02T10:00:00Z' })).toBe('completed');
  });

  it('does not send a completed instruction back as merely seen', () => {
    // Otherwise restoring asks the patient to do something already done.
    expect(
      statusFromHistory({
        acknowledged_at: '2026-09-01T10:00:00Z',
        completed_at: '2026-09-02T10:00:00Z',
      }),
    ).toBe('completed');
  });

  it('treats nulls as never having happened', () => {
    expect(statusFromHistory({ acknowledged_at: null, completed_at: null })).toBe('pending');
  });

  it('round-trips every state an archive could have been made from', () => {
    const states: { row: { acknowledged_at?: string | null; completed_at?: string | null }; was: string }[] = [
      { row: {}, was: 'pending' },
      { row: { acknowledged_at: '2026-09-01T10:00:00Z' }, was: 'acknowledged' },
      { row: { acknowledged_at: '2026-09-01T10:00:00Z', completed_at: '2026-09-02T10:00:00Z' }, was: 'completed' },
    ];
    for (const { row, was } of states) {
      // Archive, then restore: the row comes back as what it was.
      const archived = { ...row, status: ARCHIVED_STATUS };
      expect(isArchivedGuidance(archived)).toBe(true);
      expect(statusFromHistory(archived)).toBe(was);
    }
  });
});

describe('isArchivedGuidance', () => {
  it('is true only for the archived status', () => {
    expect(isArchivedGuidance({ status: 'archived' })).toBe(true);
    for (const status of ['pending', 'acknowledged', 'completed', null, undefined, '']) {
      expect(isArchivedGuidance({ status }), String(status)).toBe(false);
    }
  });
});
