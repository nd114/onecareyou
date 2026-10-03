import { describe, expect, it } from 'vitest';
import {
  EXISTING_UNAFFECTED,
  isLimitError,
  limitErrorDetail,
  limitErrorKind,
  limitErrorMessage,
} from '@/lib/limit-errors';

const patientErr = {
  code: 'OC001',
  message: 'patient_limit_reached',
  details: 'scope=practice; limit=150; active=150',
  hint: 'Existing patients and records are unaffected.',
};
const seatErr = { code: 'OC002', message: 'seat_limit_reached', details: 'limit=5; in_use=5' };

describe('limit error detection', () => {
  it('recognises the named errors by SQLSTATE', () => {
    expect(limitErrorKind({ code: 'OC001', message: 'x' })).toBe('patients');
    expect(limitErrorKind({ code: 'OC002', message: 'x' })).toBe('seats');
  });
  it('recognises them by message when the code is stripped', () => {
    expect(limitErrorKind(new Error('patient_limit_reached'))).toBe('patients');
    expect(limitErrorKind({ message: 'ERROR: seat_limit_reached' })).toBe('seats');
  });
  it('ignores everything else', () => {
    expect(limitErrorKind({ code: '42501', message: 'permission denied' })).toBeNull();
    expect(limitErrorKind(null)).toBeNull();
    expect(limitErrorKind('boom')).toBeNull();
    expect(isLimitError(new Error('network down'))).toBe(false);
    expect(isLimitError(patientErr)).toBe(true);
  });
});

describe('limitErrorDetail', () => {
  it('reads the numbers out of DETAIL', () => {
    expect(limitErrorDetail(patientErr)).toEqual({ scope: 'practice', limit: 150, used: 150 });
    expect(limitErrorDetail(seatErr)).toMatchObject({ limit: 5, used: 5 });
  });
  it('returns nothing usable when there is no detail', () => {
    expect(limitErrorDetail({ code: 'OC001' })).toEqual({});
  });
});

describe('limitErrorMessage', () => {
  it('is null for errors that are not limits, so callers fall through', () => {
    expect(limitErrorMessage(new Error('x'))).toBeNull();
  });
  it('tells a clinician about the plan and that existing patients are unaffected', () => {
    const m = limitErrorMessage(patientErr, 'clinician')!;
    expect(m).toContain('Your practice has reached the patient limit of 150 patients');
    expect(m).toContain('Existing patients and records are unaffected');
    expect(m).toContain(EXISTING_UNAFFECTED);
  });
  it('speaks of the individual when the scope is the clinician', () => {
    const m = limitErrorMessage({ ...patientErr, details: 'scope=clinician; limit=1; active=1' })!;
    expect(m).toContain('You have reached the patient limit of 1 patient on');
  });
  it('does not hand a patient the clinician billing', () => {
    const m = limitErrorMessage(patientErr, 'patient')!;
    expect(m).not.toMatch(/upgrade|limit of/i);
    expect(m).toContain('your records are unaffected');
  });
  it('words seat errors for the owner and the invitee', () => {
    expect(limitErrorMessage(seatErr, 'owner')).toContain('all the team seats of 5 seats');
    expect(limitErrorMessage(seatErr, 'owner')).toContain('Existing members and their access are unaffected');
    expect(limitErrorMessage(seatErr, 'invitee')).toContain('no free team seat');
  });
});
