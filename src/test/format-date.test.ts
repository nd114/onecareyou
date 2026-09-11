import { describe, it, expect } from 'vitest';
import { formatDay, formatDayTime, formatTime, formatWhen, localTimeToISOString, localTimeOfDay } from '@/lib/format-date';

const iso = '2026-09-03T15:47:42.000Z';
// Built from parts so the test does not depend on the runner's zone.
const local = new Date(2026, 8, 3, 15, 47, 42);

describe('formatDay', () => {
  it('names the month, so there is nothing to misread', () => {
    expect(formatDay(local)).toBe('Sep 3, 2026');
  });

  it('never renders the ambiguous numeric form', () => {
    expect(formatDay(local)).not.toMatch(/^\d+\/\d+\/\d+$/);
  });

  it('takes a string, a timestamp or a Date', () => {
    expect(formatDay(local.toISOString())).toBe('Sep 3, 2026');
    expect(formatDay(local.getTime())).toBe('Sep 3, 2026');
  });

  it('shows a dash rather than throwing on nothing usable', () => {
    for (const bad of [null, undefined, '', 'not a date', NaN]) {
      expect(formatDay(bad as never)).toBe('—');
    }
  });
});

describe('formatDayTime', () => {
  it('gives the day and the time, without seconds', () => {
    expect(formatDayTime(local)).toBe('Sep 3, 2026 at 3:47 PM');
  });

  it('has no seconds anywhere in it', () => {
    expect(formatDayTime(local)).not.toContain('42');
  });
});

describe('formatTime', () => {
  it('is just the clock', () => {
    expect(formatTime(local)).toBe('3:47 PM');
  });
});

describe('formatWhen', () => {
  const now = new Date(2026, 8, 10, 12, 0, 0);
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it('counts up through the units', () => {
    expect(formatWhen(ago(30_000), now)).toBe('just now');
    expect(formatWhen(ago(12 * 60_000), now)).toBe('12m ago');
    expect(formatWhen(ago(5 * 3_600_000), now)).toBe('5h ago');
    expect(formatWhen(ago(3 * 86_400_000), now)).toBe('3d ago');
  });

  it('switches to the date once the count stops helping', () => {
    expect(formatWhen(ago(8 * 86_400_000), now)).toBe('Sep 2, 2026');
  });

  it('does not say a future date happened a negative time ago', () => {
    const later = new Date(now.getTime() + 3 * 86_400_000);
    expect(formatWhen(later, now)).toBe('Sep 13, 2026');
  });

  it('shows a dash for nothing usable', () => {
    expect(formatWhen(null, now)).toBe('—');
  });
});

describe('the ISO strings the database returns', () => {
  it('parses without complaint', () => {
    expect(formatDay(iso)).toMatch(/^Sep [23], 2026$/);
  });
});

describe('localTimeToISOString', () => {
  it('round-trips the wall-clock time regardless of the runner\'s zone', () => {
    // The property that matters: whatever "HH:mm" goes in comes back out.
    // A naive `${date}T${time}:00` string does not have this property once a
    // `timestamptz` column re-labels it in the database's own zone — this
    // helper is what stands between a patient's typed time and that drift.
    for (const time of ['00:05', '08:00', '13:30', '23:55']) {
      const iso = localTimeToISOString('2026-09-10', time);
      expect(localTimeOfDay(iso)).toBe(time);
    }
  });

  it('produces a real instant, not an unlabeled local-looking string', () => {
    const iso = localTimeToISOString('2026-09-10', '08:00');
    // toISOString() always carries 'Z' — this is a genuine instant, so every
    // later reader (Postgres, another timezone, format()) agrees on when it is.
    expect(iso.endsWith('Z')).toBe(true);
    expect(Number.isNaN(new Date(iso).getTime())).toBe(false);
  });
});

describe('localTimeOfDay', () => {
  it('shows nothing usable as null rather than throwing', () => {
    for (const bad of [null, undefined, '', 'not a date']) {
      expect(localTimeOfDay(bad as never)).toBeNull();
    }
  });
});

import { formatAlertType } from '@/lib/alert-labels';

describe('formatAlertType', () => {
  it('writes the stored type the way a person would', () => {
    expect(formatAlertType('threshold_breach')).toBe('Threshold Breach');
    expect(formatAlertType('missed_doses')).toBe('Missed Doses');
  });

  it('never returns a lowercase fragment', () => {
    expect(formatAlertType('threshold_breach')).not.toBe('threshold breach');
  });

  it('names an alert that arrived without a type', () => {
    for (const empty of [null, undefined, '', '   ', '__']) {
      expect(formatAlertType(empty as never)).toBe('Patient alert');
    }
  });

  it('tolerates spaces and doubled separators', () => {
    expect(formatAlertType('threshold  breach')).toBe('Threshold Breach');
    expect(formatAlertType('threshold__breach')).toBe('Threshold Breach');
  });
});
