import { describe, it, expect } from 'vitest';
import { summariseVitalsForExport } from '@/lib/vitals-export';
import type { VitalRecord } from '@/hooks/useVitals';

let n = 0;
function reading(over: Partial<VitalRecord>): VitalRecord {
  n += 1;
  return {
    id: `v-${n}`,
    user_id: 'u1',
    type: 'temperature',
    value: 37,
    secondary_value: null,
    unit: '\u00b0C',
    recorded_at: '2026-09-01T10:00:00.000Z',
    created_at: '2026-09-01T10:00:00.000Z',
    notes: null,
    ...over,
  } as VitalRecord;
}

describe('summariseVitalsForExport', () => {
  it('converts to one unit before averaging', () => {
    // The same temperature recorded twice, once in each unit. Averaged raw
    // this produced 67.8 \u00b0C on a document a patient may hand to a clinician.
    const [temp] = summariseVitalsForExport([
      reading({ value: 98.6, unit: '\u00b0F' }),
      reading({ value: 37, unit: '\u00b0C' }),
    ]);
    expect(Number(temp.average)).toBeCloseTo(37, 1);
    expect(Number(temp.average)).toBeLessThan(45);
  });

  it('reports min and max in the same unit as the average', () => {
    const [temp] = summariseVitalsForExport([
      reading({ value: 100.4, unit: '\u00b0F' }),
      reading({ value: 36.5, unit: '\u00b0C' }),
    ]);
    expect(temp.min).toBeCloseTo(36.5, 1);
    expect(temp.max).toBeCloseTo(38, 1);
  });

  it('does the same for glucose, the other unit that comes two ways', () => {
    const [g] = summariseVitalsForExport([
      reading({ type: 'glucose', value: 5.5, unit: 'mmol/L' }),
      reading({ type: 'glucose', value: 99, unit: 'mg/dL' }),
    ]);
    expect(Number(g.average)).toBeGreaterThan(90);
    expect(Number(g.average)).toBeLessThan(110);
  });

  it('survives a reading of a type this build has no config for', () => {
    // Exactly what the EHR webhook used to write. This threw on config.label
    // and took the whole export with it.
    expect(() =>
      summariseVitalsForExport([reading({ type: 'bmi' as never, value: 22, unit: 'kg/m\u00b2' })]),
    ).not.toThrow();
    const [bmi] = summariseVitalsForExport([
      reading({ type: 'bmi' as never, value: 22, unit: 'kg/m\u00b2' }),
    ]);
    expect(bmi.type).toBeTruthy();
    expect(bmi.count).toBe(1);
  });

  it('groups by type and counts each', () => {
    const stats = summariseVitalsForExport([
      reading({ type: 'heart_rate', value: 70, unit: 'bpm' }),
      reading({ type: 'heart_rate', value: 80, unit: 'bpm' }),
      reading({ type: 'weight', value: 70, unit: 'kg' }),
    ]);
    expect(stats).toHaveLength(2);
    expect(stats.find((s) => s.type === 'Heart Rate')!.count).toBe(2);
    expect(Number(stats.find((s) => s.type === 'Heart Rate')!.average)).toBe(75);
  });

  it('has nothing to summarise for no readings', () => {
    expect(summariseVitalsForExport([])).toEqual([]);
  });
});
