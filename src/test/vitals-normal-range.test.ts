import { describe, it, expect } from 'vitest';
import { hasNormalRange, VITAL_CONFIG } from '@/types/health';

describe('hasNormalRange', () => {
  it('says no for weight, which has no normal band without knowing the person', () => {
    expect(hasNormalRange('weight')).toBe(false);
  });

  it('says yes for the measurements that do have one', () => {
    for (const type of ['blood_pressure', 'heart_rate', 'blood_glucose', 'temperature', 'oxygen_saturation']) {
      expect(hasNormalRange(type), type).toBe(true);
    }
  });

  it('resolves aliases before answering', () => {
    // Imported records use legacy keys; "glucose" is the same measurement.
    expect(hasNormalRange('glucose')).toBe(true);
  });

  it('claims no band for a type it has never heard of', () => {
    // The fallback config is 0–0, which is the absence of a band rather than a
    // band from zero to zero. Read as real, it classified every value above
    // zero as "high" — an imported BMI of 22 showed in red.
    expect(hasNormalRange('something_new')).toBe(false);
    expect(hasNormalRange('bmi')).toBe(false);
    expect(hasNormalRange('respiratory_rate')).toBe(false);
  });

  it('never leaves an open-ended vital with a band a screen could print', () => {
    for (const [type, config] of Object.entries(VITAL_CONFIG)) {
      if (!hasNormalRange(type)) continue;
      expect(config.normalMax, type).toBeGreaterThan(config.normalMin);
      // 0–999 is the sentinel for "no band"; a type claiming a real band
      // must not be using it.
      expect(`${config.normalMin}-${config.normalMax}`, type).not.toBe('0-999');
    }
  });
});

import { vitalPlaceholder } from '@/lib/vital-placeholder';

describe('vitalPlaceholder', () => {
  const kg = { min: 0, max: 999, unit: 'kg' };
  const bpm = { min: 60, max: 100, unit: 'bpm' };

  it('uses the normal band as the example where there is one', () => {
    expect(vitalPlaceholder('heart_rate', false, bpm)).toBe('e.g., 60-100');
  });

  it('never offers the sentinel as an example', () => {
    expect(vitalPlaceholder('weight', false, kg)).toBe('Value in kg');
  });

  it('asks for the systolic half first on a blood pressure', () => {
    expect(vitalPlaceholder('blood_pressure', true, { min: 90, max: 120, unit: 'mmHg' })).toBe(
      'Systolic (e.g., 120)',
    );
  });

  it('still says something useful with no unit to hand', () => {
    expect(vitalPlaceholder('weight', false, { min: 0, max: 999, unit: '' })).toBe('Value');
  });
});
