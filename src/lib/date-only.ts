/**
 * Date-only helpers.
 *
 * Postgres `date` columns (date_of_birth, etc.) come back as "YYYY-MM-DD".
 * `new Date("1967-03-14")` is parsed as UTC midnight, so anyone west of UTC
 * renders it as the previous day. These helpers keep calendar dates anchored
 * to local time so the value shown always matches the value entered.
 */

/** Parse a "YYYY-MM-DD" string as a local-time date (no timezone shift). */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    const fallback = new Date(value);
    return isNaN(fallback.getTime()) ? null : fallback;
  }
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

/** Format a date-only string for display, e.g. "March 14, 1967". */
export function formatDateOnly(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' },
): string | null {
  const date = parseDateOnly(value);
  return date ? date.toLocaleDateString(undefined, options) : null;
}

/** Whole years between a date-only string and today, in local time. */
export function ageFromDateOnly(value: string | null | undefined): number | null {
  const dob = parseDateOnly(value);
  if (!dob) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age;
}
