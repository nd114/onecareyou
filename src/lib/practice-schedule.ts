import { startOfDay } from 'date-fns';

/**
 * The practice diary, as opposed to one patient's.
 *
 * Appointments existed only as a tab inside a patient, so "what does my day
 * look like" had no answer short of opening every patient in turn. The rows
 * are the same FHIR appointments; what is missing is a way to read them across
 * people, which is all this does — group them into days and say which of them
 * still need something from you.
 *
 * Structural on purpose: it takes the two fields it reads, so the appointment
 * hook, a test fixture and a future caller can all pass their own shape.
 */
export interface DiaryEntry {
  start: string | null;
  status: string;
}

/** Statuses that are over, whatever the clock says. */
const CLOSED = new Set(['fulfilled', 'cancelled', 'noshow', 'entered-in-error']);

/** Statuses still waiting on someone. */
const UNCONFIRMED = new Set(['proposed', 'pending', 'waitlist']);

export type ScheduleBucket = 'today' | 'upcoming' | 'past';

export function scheduleBucket<T extends DiaryEntry>(
  entry: T,
  now: Date = new Date(),
): ScheduleBucket | null {
  if (!entry.start) return null;
  const when = new Date(entry.start);
  if (Number.isNaN(when.getTime())) return null;

  const today = startOfDay(now).getTime();
  const day = startOfDay(when).getTime();
  if (day === today) return 'today';
  return day > today ? 'upcoming' : 'past';
}

export interface DiaryDay<T> {
  /** yyyy-mm-dd in local time, stable enough to use as a React key. */
  key: string;
  date: Date;
  items: T[];
}

function dayKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * One group per day that has something in it, earliest first, and the
 * appointments inside each day in time order. Anything without a usable start
 * time is dropped rather than piled into an "unknown" day — an appointment with
 * no time is a data fault, not a slot in the diary.
 */
export function groupByDay<T extends DiaryEntry>(entries: T[]): DiaryDay<T>[] {
  const days = new Map<string, DiaryDay<T>>();

  for (const entry of entries) {
    if (!entry.start) continue;
    const when = new Date(entry.start);
    if (Number.isNaN(when.getTime())) continue;

    const start = startOfDay(when);
    const key = dayKey(start);
    const day = days.get(key) ?? { key, date: start, items: [] };
    day.items.push(entry);
    days.set(key, day);
  }

  const out = [...days.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const day of out) {
    day.items.sort((a, b) => new Date(a.start!).getTime() - new Date(b.start!).getTime());
  }
  return out;
}

export interface ScheduleCounts {
  today: number;
  upcoming: number;
  /** Proposed or waitlisted, at any date — these are the ones needing a reply. */
  unconfirmed: number;
}

/** Counts a clinician would act on, ignoring appointments already closed out. */
export function scheduleCounts<T extends DiaryEntry>(
  entries: T[],
  now: Date = new Date(),
): ScheduleCounts {
  let today = 0;
  let upcoming = 0;
  let unconfirmed = 0;

  for (const entry of entries) {
    if (UNCONFIRMED.has(entry.status)) unconfirmed += 1;
    if (CLOSED.has(entry.status)) continue;
    const bucket = scheduleBucket(entry, now);
    if (bucket === 'today') today += 1;
    else if (bucket === 'upcoming') upcoming += 1;
  }

  return { today, upcoming, unconfirmed };
}
