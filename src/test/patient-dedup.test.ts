import { describe, it, expect } from 'vitest';
import { findDuplicateCandidates } from '@/lib/patient-dedup';

const existing = [
  { id: '1', patient_name: 'Amara Green', patient_email: 'amara@example.com', patient_phone: '+1 (555) 010-2030', date_of_birth: '1980-04-02' },
  { id: '2', patient_name: 'John Smith', patient_email: null, patient_phone: null, date_of_birth: '1975-01-01' },
];

describe('findDuplicateCandidates', () => {
  it('matches on email regardless of case/spacing', () => {
    const m = findDuplicateCandidates({ patient_name: 'Different Name', patient_email: ' AMARA@example.com ' }, existing);
    expect(m[0]?.record.id).toBe('1');
    expect(m[0]?.reason).toBe('email');
  });

  it('matches on phone ignoring formatting and country code', () => {
    const m = findDuplicateCandidates({ patient_name: 'Someone Else', patient_phone: '5550102030' }, existing);
    expect(m[0]?.reason).toBe('phone');
  });

  it('matches on name + dob', () => {
    const m = findDuplicateCandidates({ patient_name: 'john smith', date_of_birth: '1975-01-01' }, existing);
    expect(m[0]?.reason).toBe('name_dob');
  });

  it('does not match same name with different dob', () => {
    const m = findDuplicateCandidates({ patient_name: 'John Smith', date_of_birth: '1990-09-09' }, existing);
    expect(m).toHaveLength(0);
  });

  it('returns nothing for empty input', () => {
    expect(findDuplicateCandidates({ patient_name: '' }, existing)).toHaveLength(0);
  });
});
