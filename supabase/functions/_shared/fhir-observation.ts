/**
 * FHIR Observation → `vitals` rows.
 *
 * Imports nothing, so it runs in Deno (both sync functions) and in the browser
 * test suite. The same reason as `fhir-medication.ts`: the mapping that
 * decides what a patient's readings say is worth testing, and a Deno-only file
 * cannot be.
 *
 * The LOINC table existed twice before this — once in `ehr-sync` and once in
 * `scheduled-ehr-sync` — with the two already differing: the scheduled one
 * skipped anything it could not map, and the on-demand one counted it as
 * imported and wrote nothing at all. Two copies of a clinical mapping is one
 * copy that quietly stops matching.
 *
 * Returns an array because one Observation can be several rows: a blood
 * pressure arrives as one resource with two components, and the app stores
 * systolic and diastolic together on a single row while other vitals are one
 * row each.
 */

export interface FhirCoding {
  system?: string;
  code?: string;
  display?: string;
}

export interface FhirObservation {
  resourceType?: string;
  id?: string;
  status?: string;
  code?: { coding?: FhirCoding[]; text?: string };
  valueQuantity?: { value?: number; unit?: string };
  effectiveDateTime?: string;
  effectivePeriod?: { start?: string };
  issued?: string;
  component?: Array<{
    code?: { coding?: FhirCoding[] };
    valueQuantity?: { value?: number; unit?: string };
  }>;
}

/** How a connection remembers which FHIR patient is which OneCare account. */
export interface PatientMapping {
  fhirPatientId: string;
  /** Named for the product's previous name; the column is what it is. */
  marpeUserId: string;
}

export interface VitalRow {
  user_id: string;
  type: string;
  value: number;
  secondary_value: number | null;
  unit: string;
  recorded_at: string;
  notes: string;
  source: string;
  external_id: string | null;
  ehr_connection_id: string;
}

export interface ObservationImportContext {
  userId: string;
  sourceLabel: string;
  connectionId: string;
  now?: Date;
}

const LOINC = "http://loinc.org";

/**
 * The vital types we store, by their LOINC code.
 *
 * Only types `VITAL_CONFIG` actually holds, written under the name it uses —
 * and a test asserts that, because the map this replaced did not.
 *
 * The old copies mapped codes to `respiratory_rate`, `bmi` and
 * `blood_glucose`. The app has no configuration for the first two at all, so
 * an imported respiratory rate arrived with a generated label, no normal
 * range, and therefore no alerting — a reading that looks checked and is not.
 * `blood_glucose` only worked through an alias lookup at read time.
 *
 * So: glucose is written under its canonical name, and the two the app cannot
 * hold are not imported. A hospital that sends them gets a line in the skip
 * log saying so, which is visible and honest; adding a vital type means
 * deciding its clinical ranges and alerting, which is a deliberate change
 * rather than a side effect of an import.
 */
export const VITAL_LOINC: Record<string, string> = {
  "85354-9": "blood_pressure",
  "8867-4": "heart_rate",
  "8310-5": "temperature",
  "2708-6": "oxygen_saturation",
  "59408-5": "oxygen_saturation",
  "29463-7": "weight",
  "2339-0": "glucose",
  "2345-7": "glucose",
  "41653-7": "glucose",
};

const BP_SYSTOLIC = "8480-6";
const BP_DIASTOLIC = "8462-4";

/** What we call a reading's unit when the sender did not say. */
const DEFAULT_UNITS: Record<string, string> = {
  blood_pressure: "mmHg",
  heart_rate: "bpm",
  temperature: "°C",
  oxygen_saturation: "%",
  weight: "kg",
  glucose: "mg/dL",
};

/**
 * Rows for one Observation, or none.
 *
 * Refuses rather than guesses, the same rule as everywhere else in this
 * directory: a code we do not recognise produces nothing, because a reading
 * filed under the nearest-looking vital is worse than a reading missing. The
 * caller logs what was skipped.
 */
export function vitalRowsFrom(
  observation: FhirObservation,
  context: ObservationImportContext,
): VitalRow[] {
  if (observation.resourceType && observation.resourceType !== "Observation") return [];
  // 'entered-in-error' is the sending system retracting it; importing one
  // would put a reading back that somebody deliberately withdrew.
  if (observation.status === "entered-in-error") return [];

  const code = observation.code?.coding?.find((c) => c.system === LOINC && c.code)?.code
    ?? observation.code?.coding?.find((c) => c.code)?.code;
  const type = code ? VITAL_LOINC[code] : undefined;
  if (!type) return [];

  const recordedAt =
    observation.effectiveDateTime
    ?? observation.effectivePeriod?.start
    ?? observation.issued
    ?? (context.now ?? new Date()).toISOString();

  const base = {
    user_id: context.userId,
    recorded_at: recordedAt,
    notes: `Synced from ${context.sourceLabel}`,
    source: "ehr_import",
    external_id: observation.id ?? null,
    ehr_connection_id: context.connectionId,
  };

  if (type === "blood_pressure") {
    // One resource, two components, one row: the app stores a blood pressure
    // as a pair, and half a blood pressure is not a blood pressure.
    const systolic = componentValue(observation, BP_SYSTOLIC);
    const diastolic = componentValue(observation, BP_DIASTOLIC);
    if (systolic === undefined || diastolic === undefined) return [];
    return [
      {
        ...base,
        type,
        value: systolic,
        secondary_value: diastolic,
        unit: componentUnit(observation, BP_SYSTOLIC) ?? DEFAULT_UNITS.blood_pressure,
      },
    ];
  }

  const value = observation.valueQuantity?.value;
  if (value === undefined || value === null) return [];

  return [
    {
      ...base,
      type,
      value,
      secondary_value: null,
      unit: observation.valueQuantity?.unit?.trim() || DEFAULT_UNITS[type] || "",
    },
  ];
}

function componentValue(observation: FhirObservation, code: string): number | undefined {
  return observation.component?.find((c) => c.code?.coding?.some((cd) => cd.code === code))
    ?.valueQuantity?.value;
}

function componentUnit(observation: FhirObservation, code: string): string | undefined {
  const unit = observation.component?.find((c) => c.code?.coding?.some((cd) => cd.code === code))
    ?.valueQuantity?.unit;
  return unit?.trim() || undefined;
}
