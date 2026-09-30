import { describe, it, expect } from 'vitest';
import { describeWithdrawal, isWithdrawnGuidance, ARCHIVED_STATUS } from '@/lib/guidance-status';

describe('isWithdrawnGuidance', () => {
  it('is true for a recorded withdrawal and for the archived status', () => {
    expect(isWithdrawnGuidance({ withdrawn_at: '2026-09-01T10:00:00Z', status: ARCHIVED_STATUS })).toBe(true);
    expect(isWithdrawnGuidance({ status: 'archived' })).toBe(true);
    expect(isWithdrawnGuidance({ withdrawn_at: '2026-09-01T10:00:00Z' })).toBe(true);
  });

  it('is false for anything still standing', () => {
    for (const status of ['pending', 'acknowledged', 'completed', null, undefined, '']) {
      expect(isWithdrawnGuidance({ status, withdrawn_at: null }), String(status)).toBe(false);
    }
  });
});

describe('describeWithdrawal', () => {
  it('says who, when and why', () => {
    const line = describeWithdrawal(
      { withdrawn_at: '2026-09-03T10:00:00Z', withdrawal_reason: 'Meant for another patient.' },
      'Dr Okafor',
    );
    expect(line).toBe('Withdrawn by Dr Okafor on 3 Sep 2026: Meant for another patient.');
  });

  it('says a reason is missing rather than showing nothing', () => {
    const line = describeWithdrawal({ withdrawn_at: '2026-09-03T10:00:00Z', withdrawal_reason: null }, 'Dr Okafor');
    expect(line).toContain('no reason was recorded');
  });

  it('falls back to "your clinician" when the name is unknown', () => {
    expect(describeWithdrawal({ withdrawal_reason: 'Wrong dose' }, null)).toBe('Withdrawn by your clinician: Wrong dose');
  });
});
