import { VITAL_CONFIG, type VitalType } from "@/types/health";
import { isReadingOutsideRange, normaliseReading } from "@/lib/patient-risk";

/**
 * Summary statistics for a patient's readings of one vital.
 *
 * Pulled out of useVitals and given tests because the inline version had four
 * bugs, all of them visible on the patient's own screen:
 *
 *   - a temperature logged in °F was compared against a Celsius band, so 98.6
 *     always read as out of range
 *   - glucose in mmol/L was compared against mg/dL, so 5.5 always did too
 *   - a blood pressure was judged on its systolic half alone, so 118/95 —
 *     hypertensive — counted as in range
 *   - average, min and max were computed across mixed units, so a patient who
 *     logged in both kg and lbs got the mean of two different things
 *
 * The band is still VITAL_CONFIG's, which is the patient's *target* range rather
 * than the clinician's action threshold. That part is deliberate and is a
 * product choice: on the patient's own screen "in range" sensibly means "where
 * I am trying to be", and the clinician's surfaces use the clinical thresholds
 * in patient-risk.ts. Blood pressure is the exception — there is no useful
 * target reading of a diastolic of 95 — so it goes through
 * isReadingOutsideRange, which reads both halves.
 */

export interface VitalReading {
  value: number;
  secondary_value?: number | null;
  unit?: string | null;
  recorded_at: string;
}

export interface VitalStats {
  average: number;
  min: number;
  max: number;
  count: number;
  /** Percentage change from first to last reading, in canonical units. */
  trend: number;
  inRange: number;
  outOfRange: number;
  /** The unit every number above is expressed in. */
  unit: string;
}

/**
 * Statistics for a history of readings, oldest first.
 *
 * Returns null for an empty history rather than a row of zeroes, because "no
 * readings" and "all zero" mean different things and a card should show
 * different things for them.
 */
export function summariseVital(
  type: VitalType,
  history: VitalReading[],
): VitalStats | null {
  if (history.length === 0) return null;

  const config = VITAL_CONFIG[type];
  if (!config) return null;

  // Convert once, up front. Everything after this is in the canonical unit, so
  // a patient who logged in °F and °C in the same week gets one comparable set.
  const values = history.map((r) => normaliseReading(type, r.value, r.unit ?? config.unit));

  const total = values.reduce((a, b) => a + b, 0);
  const first = values[0];
  const last = values[values.length - 1];

  const outOfRange = history.filter((reading, index) =>
    isOutside(type, values[index], reading),
  ).length;

  return {
    average: round(total / values.length),
    min: round(Math.min(...values)),
    max: round(Math.max(...values)),
    count: history.length,
    // A trend from zero is a division by zero, and Infinity on a dashboard
    // helps nobody.
    trend: history.length >= 2 && first !== 0 ? round(((last - first) / first) * 100) : 0,
    inRange: history.length - outOfRange,
    outOfRange,
    unit: config.unit,
  };
}

/**
 * Is one reading outside its band?
 *
 * Blood pressure defers to the clinical check, which reads both halves. A
 * diastolic of 95 with a systolic of 118 is hypertensive, and calling it in
 * range because the systolic looked fine is the failure this exists to prevent.
 */
function isOutside(type: VitalType, canonicalValue: number, reading: VitalReading): boolean {
  if (type === "blood_pressure") {
    return isReadingOutsideRange(
      type,
      reading.value,
      reading.secondary_value ?? null,
      reading.unit ?? "mmHg",
    );
  }

  const config = VITAL_CONFIG[type];
  return canonicalValue < config.normalMin || canonicalValue > config.normalMax;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
