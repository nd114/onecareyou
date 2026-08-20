/**
 * How much of the prescribed medicine was actually taken.
 *
 * The sum was `taken / every scheduled entry in the window`, which quietly
 * counts doses that have not happened yet as doses not taken. On a seven-day
 * window with two doses a day, a patient who has taken every single dose reads
 * as 12/14 — 86% — at nine in the morning on the last day, because tonight's
 * two tablets are already in the denominator. It climbs back to 100% only after
 * they are swallowed.
 *
 * That number is not cosmetic. It is on the patient's own report, it is in the
 * export they send their clinician, and it feeds the risk assessment, which
 * raises a finding below 80% — so a perfectly adherent patient drifts toward
 * being flagged by the clock rather than by anything they did.
 *
 * A dose counts once it is due. Anything still in the future is not yet an
 * outcome, and is left out of both halves of the fraction.
 */

export type DoseStatus = "taken" | "skipped" | "pending" | string;

export interface DoseEntry {
  status: DoseStatus;
  scheduled_time: string;
  medication_id?: string | null;
}

export interface AdherenceSummary {
  /** Percentage of due doses taken, 0–100. Null when nothing was due yet. */
  rate: number | null;
  taken: number;
  skipped: number;
  /** Due, still pending: nobody recorded it either way. */
  missed: number;
  /** Doses that have come due — the denominator. */
  due: number;
  /** Scheduled but not yet due. Reported so a surface can say so. */
  upcoming: number;
}

/** Has this dose come due? Anything unparseable is treated as not yet due. */
export function isDue(entry: DoseEntry, now: Date): boolean {
  const at = new Date(entry.scheduled_time);
  if (Number.isNaN(at.getTime())) return false;
  return at <= now;
}

export function summariseAdherence(
  entries: DoseEntry[],
  now: Date = new Date(),
): AdherenceSummary {
  let taken = 0;
  let skipped = 0;
  let missed = 0;
  let upcoming = 0;

  for (const entry of entries) {
    if (!isDue(entry, now)) {
      upcoming += 1;
      continue;
    }
    if (entry.status === "taken") taken += 1;
    else if (entry.status === "skipped") skipped += 1;
    else missed += 1;
  }

  const due = taken + skipped + missed;
  return {
    rate: due > 0 ? Math.round((taken / due) * 100) : null,
    taken,
    skipped,
    missed,
    due,
    upcoming,
  };
}

/**
 * The same sum for one day.
 *
 * Today is the case that matters: without it the day's bar starts at zero every
 * morning and fills as the doses are taken, which reads as a patient who keeps
 * failing and recovering rather than one who is doing fine so far.
 */
export function summariseDay(
  entries: DoseEntry[],
  day: Date,
  now: Date = new Date(),
): AdherenceSummary {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const ofDay = entries.filter((e) => {
    const at = new Date(e.scheduled_time);
    return !Number.isNaN(at.getTime()) && at >= start && at < end;
  });

  return summariseAdherence(ofDay, now);
}
