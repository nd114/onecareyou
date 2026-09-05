import { describe, it, expect } from 'vitest';
import { MEDICATION_TYPES, medicationTypeLabel } from '@/lib/medication-labels';
import { MEDICATION_TYPE_COLORS } from '@/types/health';

describe('medicationTypeLabel', () => {
  it('writes a stored type the way the rest of the row is written', () => {
    expect(medicationTypeLabel('prescription')).toBe('Prescription');
    expect(medicationTypeLabel('otc')).toBe('Over-the-counter');
  });

  it('never returns the bare lowercase key', () => {
    for (const { value } of MEDICATION_TYPES) {
      expect(medicationTypeLabel(value)).not.toBe(value);
    }
  });

  it('does something reasonable with a type this build does not know', () => {
    expect(medicationTypeLabel('biologic')).toBe('Biologic');
  });

  it('names a medicine whose type is missing', () => {
    expect(medicationTypeLabel(null)).toBe('Medicine');
    expect(medicationTypeLabel('  ')).toBe('Medicine');
  });
});

describe('MEDICATION_TYPES', () => {
  it('covers every type the cabinet has a colour for', () => {
    for (const key of Object.keys(MEDICATION_TYPE_COLORS)) {
      expect(MEDICATION_TYPES.some((t) => t.value === key), key).toBe(true);
    }
  });

  it('has no duplicates', () => {
    const values = MEDICATION_TYPES.map((t) => t.value);
    expect(new Set(values).size).toBe(values.length);
  });
});
