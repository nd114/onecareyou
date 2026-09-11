import { format } from 'date-fns';

/**
 * One way to write a date.
 *
 * The app had three: date-fns "Sep 3, 2026" in the Vault, the browser's
 * toLocaleDateString "3/1/2026" in Care Circle, and toLocaleString
 * "9/5/2026, 3:47:42 AM" on the clinician's task list — seconds and all. The
 * numeric ones also read differently depending on where the reader is: 3/1
 * is the third of January in most of the world and the first of March in the
 * United States, which is not a difference to leave to chance on a medication
 * start date.
 *
 * These always render the month by name, so there is nothing to misread, and
 * they never throw on a missing or unparseable value — a row with a bad date
 * should show a dash, not a blank page.
 */

const NO_DATE = '—';

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Sep 3, 2026" */
export function formatDay(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, 'MMM d, yyyy') : NO_DATE;
}

/** "Sep 3, 2026 at 3:47 PM" — no seconds; nobody is timing anything. */
export function formatDayTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "MMM d, yyyy 'at' h:mm a") : NO_DATE;
}

/** "3:47 PM" */
export function formatTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, 'h:mm a') : NO_DATE;
}

/**
 * How long ago, for things that just happened, falling back to the date once
 * "6d ago" stops being easier to read than the day itself.
 */
export function formatWhen(
  value: string | number | Date | null | undefined,
  now: Date = new Date(),
): string {
  const d = toDate(value);
  if (!d) return NO_DATE;

  const diff = now.getTime() - d.getTime();
  if (diff < 0) return formatDay(d); // Scheduled, not elapsed.

  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDay(d);
}

/**
 * A dose time, as a correct instant rather than a string that looks like one.
 *
 * `\`${date}T${time}:00\`` has no offset, so a `timestamptz` column stores it
 * in the database session's timezone (UTC on Supabase) rather than the
 * patient's. A patient at UTC+1 asking for "08:00" gets a dose that is
 * actually due at 07:00 their time — an hour early or late on every reminder
 * and every adherence count, and the drift is the offset, so it is worse the
 * further the patient is from UTC.
 *
 * `date` and `time` are read as wall-clock numbers and handed to the local
 * `Date` constructor, which resolves them in whatever timezone is actually
 * running this code — the patient's own device. That is the instant that was
 * meant, and `toISOString()` is then unambiguous everywhere else it is read.
 */
export function localTimeToISOString(dateStr: string, time: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0, 0).toISOString();
}

/** The inverse: a stored instant, read back as "HH:mm" in this device's local time. */
export function localTimeOfDay(value: string | number | Date | null | undefined): string | null {
  const d = toDate(value);
  return d ? format(d, 'HH:mm') : null;
}
