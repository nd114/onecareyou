import type { Bundle, Observation, ObservationComponent, Quantity } from "@medplum/fhirtypes";
import type { VitalType } from "@/types/health";
import { VITAL_CONFIG } from "@/types/health";

/**
 * Vitals as FHIR Observations.
 *
 * Unlike conditions and allergies, vitals are a real table with typed numeric
 * values, so this maps a row rather than parsing free text. It is also the first
 * resource where coding is possible honestly.
 *
 * Every LOINC code below was read out of the R4 specification bundle shipped in
 * @medplum/definitions — `ValueSet/observation-vitalsignresult` for the codes,
 * and the vital-sign profiles (`bodyweight`, `heartrate`, `bodytemp`,
 * `oxygensat`, `bp`) for which code belongs to which measurement. None of them
 * was recalled or inferred. The extraction is in the test suite so the claim
 * stays checkable rather than becoming folklore.
 *
 * The other fourteen types we store are laboratory results, not vital signs.
 * LOINC does have codes for them, but those codes are not in the FHIR bundles
 * and would have to be typed from memory — the same failure as inventing SNOMED
 * for "Diabetes", wearing different clothes. They are emitted as
 * `category: laboratory` with `code.text` and no coding, and gain codes when a
 * terminology source provides them.
 */

const LOINC = "http://loinc.org";
const UCUM = "http://unitsofmeasure.org";

/** LOINC codes from ValueSet/observation-vitalsignresult, per the R4 profiles. */
const VITAL_SIGN_CODES: Partial<Record<VitalType, string>> = {
  weight: "29463-7", // bodyweight profile
  heart_rate: "8867-4", // heartrate profile
  temperature: "8310-5", // bodytemp profile
  oxygen_saturation: "2708-6", // oxygensat profile
  blood_pressure: "85354-9", // bp profile — a panel, see below
};

/** The bp profile's two components. Systolic and diastolic are not one number. */
const BP_SYSTOLIC = "8480-6";
const BP_DIASTOLIC = "8462-4";

/**
 * UCUM codes for the display units we store.
 *
 * Taken from ValueSet/ucum-vitals-common where it covers them, which is why
 * "bpm" becomes "/min" and "°C" becomes "Cel" — those are the spec's spellings,
 * not ours. Units with no entry here are emitted as `Quantity.unit` alone: FHIR
 * allows a human unit without a coded one, and an uncoded unit is honest where
 * a guessed code is not.
 */
const UCUM_CODES: Record<string, string> = {
  "kg": "kg",
  "g": "g",
  "lbs": "[lb_av]",
  "cm": "cm",
  "%": "%",
  "°C": "Cel",
  "°F": "[degF]",
  "mmHg": "mm[Hg]",
  "bpm": "/min",
  // Valid UCUM as written, and used by the laboratory results.
  "mg/dL": "mg/dL",
  "mmol/L": "mmol/L",
  "g/dL": "g/dL",
  "U/L": "U/L",
  "mL/min": "mL/min",
};

export interface VitalRow {
  id?: string;
  user_id?: string;
  type: string;
  value: number | string | null;
  secondary_value?: number | string | null;
  unit?: string | null;
  recorded_at: string;
  notes?: string | null;
}

/** Is this one of the five the FHIR vital-signs profile actually covers? */
export function isVitalSign(type: string): boolean {
  return type in VITAL_SIGN_CODES;
}

/** A Quantity for a value, coded where the unit is one we can code honestly. */
function quantity(value: number, unit: string | null | undefined): Quantity {
  const q: Quantity = { value };
  if (!unit) return q;

  q.unit = unit;
  const code = UCUM_CODES[unit];
  if (code) {
    q.system = UCUM;
    q.code = code;
  }
  return q;
}

function categoryFor(type: string) {
  const isVital = isVitalSign(type);
  return [
    {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/observation-category",
          code: isVital ? "vital-signs" : "laboratory",
          display: isVital ? "Vital Signs" : "Laboratory",
        },
      ],
    },
  ];
}

/**
 * The FHIR Observation for one stored vital.
 *
 * Returns null for a row with no numeric value — a reading with nothing read is
 * not an observation, and emitting one with the value absent would export a
 * measurement that never happened.
 */
export function toFhirObservation(row: VitalRow, patientUserId: string): Observation | null {
  const value = typeof row.value === "string" ? Number(row.value) : row.value;
  if (value === null || value === undefined || Number.isNaN(value)) return null;

  const config = VITAL_CONFIG[row.type as VitalType];
  const label = config?.label ?? row.type;
  const unit = row.unit ?? config?.unit ?? null;

  const observation: Observation = {
    resourceType: "Observation",
    ...(row.id ? { id: row.id } : {}),
    status: "final",
    category: categoryFor(row.type),
    code: codeFor(row.type, label),
    subject: { reference: `Patient/${patientUserId}` },
    effectiveDateTime: row.recorded_at,
  };

  if (row.type === "blood_pressure") {
    // A blood pressure is a panel of two components, not a number with a spare.
    // Putting 120 in valueQuantity and hiding 80 in a secondary column is our
    // storage shape, not a clinical fact, and it must not survive the mapping.
    const diastolic =
      typeof row.secondary_value === "string" ? Number(row.secondary_value) : row.secondary_value;

    const components: ObservationComponent[] = [
      {
        code: { coding: [{ system: LOINC, code: BP_SYSTOLIC }], text: "Systolic" },
        valueQuantity: quantity(value, unit),
      },
    ];

    if (diastolic !== null && diastolic !== undefined && !Number.isNaN(diastolic)) {
      components.push({
        code: { coding: [{ system: LOINC, code: BP_DIASTOLIC }], text: "Diastolic" },
        valueQuantity: quantity(diastolic, unit),
      });
    }

    observation.component = components;
  } else {
    observation.valueQuantity = quantity(value, unit);
  }

  if (row.notes) observation.note = [{ text: row.notes }];

  return observation;
}

/**
 * The code for a measurement.
 *
 * `text` is always our own label, because `Coding.display` is not in the FHIR
 * bundles and typing the LOINC display strings from memory would be guessing at
 * the exact thing this module refuses to guess at. FHIR is explicit that
 * CodeableConcept.text is the human representation, so it belongs there.
 */
function codeFor(type: string, label: string) {
  const code = VITAL_SIGN_CODES[type as VitalType];
  return code ? { coding: [{ system: LOINC, code }], text: label } : { text: label };
}

/** Observations for a list of rows, skipping any with nothing recorded. */
export function toFhirObservations(rows: VitalRow[], patientUserId: string): Observation[] {
  return rows
    .map((row) => toFhirObservation(row, patientUserId))
    .filter((o): o is Observation => o !== null);
}

/**
 * The readings as a FHIR Bundle, which is the unit another system accepts.
 *
 * Built here rather than at the download site so that it is reachable by a test.
 * It was inline in vitals-export.ts first, and it carried a `total` — which is
 * invalid: FHIR's bdl-1 invariant allows `total` only on a searchset or a
 * history bundle, and a `collection` is neither. Nothing caught it, because the
 * tests validated the Observations and never the Bundle holding them. A strict
 * receiver would have rejected the whole file.
 *
 * `collection` is the right type: these are records being handed over, not a
 * transaction asking a server to do something.
 */
export function toFhirBundle(rows: VitalRow[], patientUserId: string): Bundle<Observation> {
  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: new Date().toISOString(),
    entry: toFhirObservations(rows, patientUserId).map((resource) => ({
      // Ids are uuids, so a urn:uuid fullUrl is a real identifier for the
      // receiving system rather than a made-up one.
      ...(resource.id ? { fullUrl: `urn:uuid:${resource.id}` } : {}),
      resource,
    })),
  };
}
