import { describe, it, expect } from 'vitest';
import { vitalStatus } from '@/lib/vital-status';

const glucose = { min: 70, max: 100 };

describe('vitalStatus', () => {
  it('places a reading against its band', () => {
    expect(vitalStatus(85, glucose, true)).toBe('normal');
    expect(vitalStatus(60, glucose, true)).toBe('low');
    expect(vitalStatus(140, glucose, true)).toBe('high');
  });

  it('treats the edges of the band as normal', () => {
    expect(vitalStatus(70, glucose, true)).toBe('normal');
    expect(vitalStatus(100, glucose, true)).toBe('normal');
  });

  it('says nothing about a measurement never taken', () => {
    // The bug this exists to prevent: a card with a dash for the value and a
    // green "normal" next to it.
    expect(vitalStatus(null, glucose, true)).toBeNull();
    expect(vitalStatus(undefined, glucose, true)).toBeNull();
    expect(vitalStatus(NaN, glucose, true)).toBeNull();
  });

  it('says nothing where there is no normal band', () => {
    expect(vitalStatus(78, { min: 0, max: 999 }, false)).toBeNull();
  });

  it('does not treat zero as missing', () => {
    expect(vitalStatus(0, glucose, true)).toBe('low');
  });
});
