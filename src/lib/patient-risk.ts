/**
 * What is worrying about this patient, and why.
 *
 * This was inline in PatientRiskIndicator, which made four clinical mistakes
 * invisible because nothing could test them:
 *
 *   1. Blood pressure was scored on `value` alone — the systolic. `secondary_value`
 *      was declared on the interface and never read, so 120/110 scored as normal.
 *   2. Ranges were compared against raw numbers with no regard for the unit. A
 *      temperature recorded as 98.6°F was read as 98.6°C and reported as critical.
 *   3. Any 15% movement was a risk factor, including movement toward health, so a
 *      glucose falling from 250 to 180 was flagged as a warning.
 *   4. A factor said "High blood_pressure: 145 mmHg" and stopped. No reference
 *      range, no date — nothing a clinician could weigh or defend.
 *
 * Kept as a pure function on purpose: this is the part that has to be right.
 */

export interface RiskVital {
  type: string;
  value: number;
  secondary_value?: number | null;
  unit: string;
  recorded_at: string;
}

export type RiskSeverity = "low" | "medium" | "high";
export type RiskLevel = "low" | "medium" | "high";

export interface RiskFactor {
  type: string;
  severity: RiskSeverity;
  /** The finding, in one line. */
  headline: string;
  /** Why it counts: the range it sits outside, and when it was taken. */
  detail: string;
}

export interface RiskAssessment {
  level: RiskLevel;
  factors: RiskFactor[];
  highCount: number;
  mediumCount: number;
}

interface Band {
  label: string;
  unit: string;
  low: number;
  high: number;
  criticalLow?: number;
  criticalHigh?: number;
}

/** Normal and critical bands, in the canonical unit for each measurement. */
const BANDS: Record<string, Band> = {
  systolic: { label: "Systolic blood pressure", unit: "mmHg", low: 90, high: 140, criticalLow: 80, criticalHigh: 180 },
  diastolic: { label: "Diastolic blood pressure", unit: "mmHg", low: 60, high: 90, criticalLow: 50, criticalHigh: 120 },
  heart_rate: { label: "Heart rate", unit: "bpm", low: 60, high: 100, criticalLow: 40, criticalHigh: 150 },
  glucose: { label: "Blood glucose", unit: "mg/dL", low: 70, high: 140, criticalLow: 54, criticalHigh: 250 },
  oxygen_saturation: { label: "Oxygen saturation", unit: "%", low: 95, high: 100, criticalLow: 90 },
  temperature: { label: "Temperature", unit: "°C", low: 36.1, high: 37.2, criticalLow: 35, criticalHigh: 39 },
  hba1c: { label: "HbA1c", unit: "%", low: 4, high: 5.7, criticalHigh: 9 },
};

/** Names the same measurement arrives under, depending on who wrote the row. */
const TYPE_ALIASES: Record<string, string> = {
  blood_glucose: "glucose",
  blood_sugar: "glucose",
  spo2: "oxygen_saturation",
  pulse: "heart_rate",
  bp: "blood_pressure",
};

function canonicalType(type: string): string {
  return TYPE_ALIASES[type] ?? type;
}

/**
 * Put a reading into the unit its band is written in.
 *
 * Both conversions key on the value as well as the unit string, because the unit
 * is free text a human typed and is often absent or wrong. The value ranges are
 * chosen so the two scales cannot overlap in a living person: no one has a
 * temperature of 45°C, and no one has a blood glucose of 30 mg/dL and is filling
 * in an app.
 */
export function normaliseReading(type: string, value: number, unit: string): number {
  const u = (unit ?? "").toLowerCase();

  if (type === "temperature") {
    const isFahrenheit = /f/.test(u) && !/c/.test(u);
    if (isFahrenheit || value > 45) return ((value - 32) * 5) / 9;
    return value;
  }

  if (type === "glucose") {
    const isMmol = u.includes("mmol");
    if (isMmol || value < 30) return value * 18.0182;
    return value;
  }

  return value;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function whenPhrase(recordedAt: string, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(recordedAt).getTime()) / 86_400_000);
  if (days <= 0) return "recorded today";
  if (days === 1) return "recorded yesterday";
  return `recorded ${days} days ago`;
}

/** One reading against one band. Returns nothing when it sits inside the band. */
function gradeReading(
  key: string,
  raw: number,
  unit: string,
  recordedAt: string,
  now: Date,
): RiskFactor | null {
  const band = BANDS[key];
  if (!band) return null;

  // Bands for the two halves of a blood pressure are keyed separately, but the
  // value arrives under the parent type, so normalise against that.
  const normaliseKey = key === "systolic" || key === "diastolic" ? "blood_pressure" : key;
  const value = round(normaliseReading(normaliseKey, raw, unit));
  const shown = `${value} ${band.unit}`;
  const when = whenPhrase(recordedAt, now);

  if (band.criticalLow !== undefined && value < band.criticalLow) {
    return {
      type: key,
      severity: "high",
      headline: `${band.label} is critically low at ${shown}`,
      detail: `Below the critical threshold of ${band.criticalLow} ${band.unit}; normal is ${band.low}–${band.high}. ${capitalise(when)}.`,
    };
  }
  if (band.criticalHigh !== undefined && value > band.criticalHigh) {
    return {
      type: key,
      severity: "high",
      headline: `${band.label} is critically high at ${shown}`,
      detail: `Above the critical threshold of ${band.criticalHigh} ${band.unit}; normal is ${band.low}–${band.high}. ${capitalise(when)}.`,
    };
  }
  if (value < band.low) {
    return {
      type: key,
      severity: "medium",
      headline: `${band.label} is below range at ${shown}`,
      detail: `Normal is ${band.low}–${band.high} ${band.unit}. ${capitalise(when)}.`,
    };
  }
  if (value > band.high) {
    return {
      type: key,
      severity: "medium",
      headline: `${band.label} is above range at ${shown}`,
      detail: `Normal is ${band.low}–${band.high} ${band.unit}. ${capitalise(when)}.`,
    };
  }
  return null;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** How far outside its normal band a value sits. Zero when it is inside. */
function distanceOutside(band: Band, value: number): number {
  if (value < band.low) return band.low - value;
  if (value > band.high) return value - band.high;
  return 0;
}

/**
 * Is this reading outside its normal range?
 *
 * The same question the summary view was answering from its own copy of the
 * ranges, which is how two surfaces came to disagree about whether a diastolic
 * counts. One set of bands, one answer. Returns false for anything without a
 * defined normal range — weight, say — rather than inventing one.
 */
export function isReadingOutsideRange(
  type: string,
  value: number,
  secondaryValue: number | null | undefined,
  unit: string,
): boolean {
  const canonical = canonicalType(type);

  if (canonical === "blood_pressure") {
    const systolic = BANDS.systolic;
    const diastolic = BANDS.diastolic;
    if (value < systolic.low || value > systolic.high) return true;
    if (secondaryValue != null && (secondaryValue < diastolic.low || secondaryValue > diastolic.high)) return true;
    return false;
  }

  const band = BANDS[canonical];
  if (!band) return false;
  const normalised = normaliseReading(canonical, value, unit);
  return normalised < band.low || normalised > band.high;
}

export type ReadingStatus = "Low" | "Normal" | "High";

/**
 * One word for a reading, for the report a patient sends their clinician.
 *
 * The export used VITAL_CONFIG's normalMin/normalMax, which are *target* values
 * — 90–120 systolic is what to aim for, not the point at which something is
 * wrong. So a report handed to a doctor called 130/80 "High" while the
 * clinician's own screen called it normal, and it read `value` alone, so 120/110
 * came out as "Normal" with a diastolic in crisis range. Both are answered here
 * against the same bands the clinician sees.
 */
export function describeReadingStatus(
  type: string,
  value: number,
  secondaryValue: number | null | undefined,
  unit: string,
): ReadingStatus {
  const canonical = canonicalType(type);

  if (canonical === "blood_pressure") {
    // Either half being out puts the whole reading out; high wins over low
    // when the two disagree, because it is the one that needs acting on.
    const halves: [number, Band][] = [[value, BANDS.systolic]];
    if (secondaryValue != null) halves.push([secondaryValue, BANDS.diastolic]);
    if (halves.some(([v, b]) => v > b.high)) return "High";
    if (halves.some(([v, b]) => v < b.low)) return "Low";
    return "Normal";
  }

  const band = BANDS[canonical];
  if (!band) return "Normal";
  const normalised = normaliseReading(canonical, value, unit);
  if (normalised > band.high) return "High";
  if (normalised < band.low) return "Low";
  return "Normal";
}

export function assessPatientRisk(
  vitals: RiskVital[],
  adherenceRate?: number,
  now: Date = new Date(),
): RiskAssessment {
  const factors: RiskFactor[] = [];
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);

  const latestByType: Record<string, RiskVital> = {};
  const recentByType: Record<string, RiskVital[]> = {};

  for (const vital of vitals) {
    const type = canonicalType(vital.type);
    const at = new Date(vital.recorded_at);
    if (Number.isNaN(at.getTime())) continue;

    const held = latestByType[type];
    if (!held || at > new Date(held.recorded_at)) latestByType[type] = vital;
    if (at >= sevenDaysAgo) (recentByType[type] ??= []).push(vital);
  }

  // --- Latest reading of each measurement, against its band -----------------
  for (const [type, vital] of Object.entries(latestByType)) {
    if (type === "blood_pressure") {
      // Both halves, separately. Scoring the systolic alone was the bug: a
      // diastolic of 110 is a finding whatever the systolic is doing.
      const systolic = gradeReading("systolic", vital.value, vital.unit, vital.recorded_at, now);
      if (systolic) factors.push(systolic);
      if (vital.secondary_value != null) {
        const diastolic = gradeReading("diastolic", vital.secondary_value, vital.unit, vital.recorded_at, now);
        if (diastolic) factors.push(diastolic);
      }
      continue;
    }
    const factor = gradeReading(type, vital.value, vital.unit, vital.recorded_at, now);
    if (factor) factors.push(factor);
  }

  // --- Trends, but only ones heading the wrong way --------------------------
  for (const [type, readings] of Object.entries(recentByType)) {
    if (readings.length < 3) continue;
    const band = BANDS[type === "blood_pressure" ? "systolic" : type];
    if (!band) continue;

    const sorted = [...readings].sort(
      (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
    );
    const half = Math.floor(sorted.length / 2);
    const mean = (rows: RiskVital[]) =>
      rows.reduce((sum, r) => sum + normaliseReading(type, r.value, r.unit), 0) / rows.length;

    const before = mean(sorted.slice(0, half));
    const after = mean(sorted.slice(half));
    if (before === 0) continue;

    const changePercent = ((after - before) / Math.abs(before)) * 100;
    if (Math.abs(changePercent) <= 15) continue;

    // A reading moving back toward its normal range is the treatment working.
    // Reporting that as a risk factor next to a critical value taught clinicians
    // to skim the list.
    if (distanceOutside(band, after) <= distanceOutside(band, before)) continue;

    const direction = changePercent > 0 ? "rising" : "falling";
    factors.push({
      type,
      severity: "low",
      headline: `${band.label} is ${direction} — ${Math.abs(Math.round(changePercent))}% over the last week`,
      detail: `Mean moved from ${round(before)} to ${round(after)} ${band.unit}, further from the normal range of ${band.low}–${band.high}.`,
    });
  }

  // --- Adherence ------------------------------------------------------------
  if (adherenceRate !== undefined && adherenceRate !== null) {
    if (adherenceRate < 50) {
      factors.push({
        type: "adherence",
        severity: "high",
        headline: `Taking about ${Math.round(adherenceRate)}% of scheduled doses`,
        detail: "Fewer than half. Readings and symptoms should be read in that light before any dose is changed.",
      });
    } else if (adherenceRate < 80) {
      factors.push({
        type: "adherence",
        severity: "medium",
        headline: `Taking about ${Math.round(adherenceRate)}% of scheduled doses`,
        detail: "Below the 80% usually taken as adherent.",
      });
    }
  }

  // --- Silence ---------------------------------------------------------------
  const mostRecent = Object.values(latestByType).sort(
    (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
  )[0];

  if (mostRecent) {
    const days = Math.floor((now.getTime() - new Date(mostRecent.recorded_at).getTime()) / 86_400_000);
    if (days > 14) {
      factors.push({
        type: "data_freshness",
        severity: "medium",
        headline: `No readings for ${days} days`,
        detail: "Everything above is that old. Absence of a reading is not absence of a problem.",
      });
    } else if (days > 7) {
      factors.push({
        type: "data_freshness",
        severity: "low",
        headline: `Last reading ${days} days ago`,
        detail: "Recent enough to act on, old enough to mention.",
      });
    }
  }

  const highCount = factors.filter((f) => f.severity === "high").length;
  const mediumCount = factors.filter((f) => f.severity === "medium").length;

  let level: RiskLevel = "low";
  if (highCount > 0 || mediumCount >= 2) level = "high";
  else if (mediumCount > 0) level = "medium";

  // Most serious first: a critical value must not sit below a trend note.
  const order: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };
  factors.sort((a, b) => order[a.severity] - order[b.severity]);

  return { level, factors, highCount, mediumCount };
}
