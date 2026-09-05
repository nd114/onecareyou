import { describe, it, expect } from 'vitest';
import {
  scheduleBucket,
  groupByDay,
  scheduleCounts,
  type DiaryEntry,
} from '@/lib/practice-schedule';

// Local time throughout: a clinic's day is the day it is where the clinic is.
const NOW = new Date(2026, 8, 10, 11, 0, 0);
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 8, day, hour, minute).toISOString();

const entry = (start: string | null, status = 'booked'): DiaryEntry => ({ start, status });

describe('scheduleBucket', () => {
  it('splits the diary around today, not around now', () => {
    // 09:00 today is already past on the clock but still today's work.
    expect(scheduleBucket(entry(at(10, 9)), NOW)).toBe('today');
    expect(scheduleBucket(entry(at(10, 23, 59)), NOW)).toBe('today');
    expect(scheduleBucket(entry(at(11, 0)), NOW)).toBe('upcoming');
    expect(scheduleBucket(entry(at(9, 23)), NOW)).toBe('past');
  });

  it('has nothing to say about an appointment with no usable time', () => {
    expect(scheduleBucket(entry(null), NOW)).toBeNull();
    expect(scheduleBucket(entry('not a date'), NOW)).toBeNull();
  });
});

describe('groupByDay', () => {
  it('makes one group per day, earliest first, sorted inside', () => {
    const days = groupByDay([
      entry(at(12, 15)),
      entry(at(10, 16)),
      entry(at(10, 9)),
      entry(at(11, 8)),
    ]);
    expect(days.map((d) => d.key)).toEqual(['2026-09-10', '2026-09-11', '2026-09-12']);
    expect(days[0].items.map((i) => new Date(i.start!).getHours())).toEqual([9, 16]);
  });

  it('drops rows with no time rather than inventing a day for them', () => {
    const days = groupByDay([entry(null), entry('nonsense'), entry(at(10, 9))]);
    expect(days).toHaveLength(1);
    expect(days[0].items).toHaveLength(1);
  });

  it('is empty for an empty diary', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('scheduleCounts', () => {
  it('counts what is still live today and ahead', () => {
    const counts = scheduleCounts(
      [entry(at(10, 9)), entry(at(10, 15)), entry(at(11, 9)), entry(at(9, 9))],
      NOW,
    );
    expect(counts).toEqual({ today: 2, upcoming: 1, unconfirmed: 0 });
  });

  it('leaves out appointments that are already closed out', () => {
    const counts = scheduleCounts(
      [
        entry(at(10, 9), 'fulfilled'),
        entry(at(10, 10), 'cancelled'),
        entry(at(10, 11), 'noshow'),
        entry(at(10, 12), 'arrived'),
      ],
      NOW,
    );
    expect(counts.today).toBe(1);
  });

  it('counts anything waiting on a reply, whenever it is', () => {
    const counts = scheduleCounts(
      [entry(at(30, 9), 'proposed'), entry(at(10, 9), 'waitlist'), entry(at(10, 10), 'booked')],
      NOW,
    );
    expect(counts.unconfirmed).toBe(2);
    // …and those still show up in their own day's count.
    expect(counts.today).toBe(2);
    expect(counts.upcoming).toBe(1);
  });
});
