import type {
  AllergyIntolerance,
  Appointment,
  Condition,
  MedicationStatement,
  Observation,
  Resource,
} from "@medplum/fhirtypes";

import type { VitalType } from "@/types/health";
import { VITAL_CONFIG } from "@/types/health";

/**
 * FHIR coming *in*.
 *
 * Everything in this directory until now went one way: our rows became
 * resources. That is the easy direction, because we know what we hold. Reading
 * somebody else's FHIR is the hard one — it arrives with codes we may not
 * recognise, units we do not store, and references to a patient who may not be
 * the person we think.
 *
 * The rule throughout: **refuse rather than guess.** A resource we cannot map
 * confidently is rejected with a reason, not stored under a nearest-fit
 * category. A partially-mapped resource carries warnings naming what was
 * dropped. Silence is the one outcome that is never acceptable, because an
 * import that quietly loses half a record looks exactly like one that worked.
 *
 * Nothing here writes. These are pure functions producing candidate rows, so
 * the caller can show a person what is about to happen before it does — the
 * same shape as the assistant's proposed actions, for the same reason.
 */

const LOINC = "http://loinc.org";

/**
 * The inverse of `observation.ts`'s VITAL_SIGN_CODES.
 *
 * Written as its own map rather than derived, because a reversed lookup would
 * silently change meaning if the outbound map ever gained two types sharing a
 * code. The test suite asserts the two stay in step.
 */
const CODE_TO_VITAL: Record<string, VitalType> = {
  "29463-7": "weight",
  "8867-4": "heart_rate",
  "8310-5": "temperature",
  "2708-6": "oxygen_saturation",
  "85354-9": "blood_pressure",
};

const BP_SYSTOLIC = "8480-6";
const BP_DIASTOLIC = "8462-4";

/** The inverse of the UCUM map, for turning a coded unit back into ours. */
const UCUM_TO_DISPLAY: Record<string, string> = {
  "kg": "kg",
  "g": "g",
  "[lb_av]": "lbs",
  "cm": "cm",
  "%": "%",
  "Cel": "°C",
  "[degF]": "°F",
  "mm[Hg]": "mmHg",
  "/min": "bpm",
  "mg/dL": "mg/dL",
  "mmol/L": "mmol/L",
  "g/dL": "g/dL",
  "U/L": "U/L",
  "mL/min": "mL/min",
};

/**
 * Where an inbound row came from.
 *
 * Mandatory, and carried onto every row this module produces. Without it an
 * imported record and one the patient typed are indistinguishable, and a bad
 * import can never be unwound — you would have to ask a person which rows they
 * recognised.
 */
export interface Provenance {
  /** Stable identifier for the system that sent it, e.g. an EHR connection id. */
  sourceId: string;
  /** Human name for that system, for showing someone where a row came from. */
  sourceLabel: string;
  /** The resource's id in the sending system, so a re-import updates rather than duplicates. */
  externalId?: string;
}

/**
 * The outcome of mapping one resource.
 *
 * `row` is null exactly when `rejected` is set. `warnings` can be present on a
 * successful map: they name what did not survive, which is information the
 * person approving an import needs.
 */
export interface InboundResult<T> {
  row: T | null;
  rejected?: string;
  warnings: string[];
}

function reject<T>(reason: string): InboundResult<T> {
  return { row: null, rejected: reason, warnings: [] };
}

/** The `Patient/<id>` a resource points at, or null if it names nobody. */
export function subjectId(resource: Resource): string | null {
  const ref =
    (resource as { subject?: { reference?: string } }).subject?.reference ??
    (resource as { patient?: { reference?: string } }).patient?.reference;
  if (typeof ref !== "string") return null;
  const match = /^Patient\/(.+)$/.exec(ref.trim());
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Observation → vitals
// ---------------------------------------------------------------------------

export interface InboundVital {
  user_id: string;
  type: VitalType;
  value: number;
  secondary_value: number | null;
  unit: string;
  recorded_at: string;
  notes: string | null;
  source: string;
  external_id: string | null;
  ehr_connection_id: string | null;
}

function codesOf(concept: { coding?: { system?: string; code?: string }[] } | undefined): string[] {
  return (concept?.coding ?? [])
    .filter((c) => c.system === LOINC && typeof c.code === "string")
    .map((c) => c.code as string);
}

/**
 * One Observation as a vitals row.
 *
 * Refused when: it names no patient, carries no LOINC code we know, has no
 * numeric value, or is a blood pressure missing one of its two components. A
 * half-recorded blood pressure is not a blood pressure.
 */
export function fromFhirObservation(
  observation: Observation,
  patientUserId: string,
  provenance: Provenance,
): InboundResult<InboundVital> {
  const warnings: string[] = [];

  if (observation.status === "entered-in-error") {
    return reject("The sending system marked this reading as entered in error.");
  }

  const codes = codesOf(observation.code);
  const type = codes.map((c) => CODE_TO_VITAL[c]).find(Boolean);
  if (!type) {
    const text = observation.code?.text;
    return reject(
      text
        ? `"${text}" is not a reading we store. No code was matched, and guessing a category would put a made-up measurement in the record.`
        : "This reading carries no code we recognise.",
    );
  }

  const recordedAt =
    observation.effectiveDateTime ??
    observation.effectivePeriod?.start ??
    observation.issued ??
    null;
  if (!recordedAt) {
    return reject("This reading has no date, and a reading without a time is not a reading.");
  }

  let value: number | null = null;
  let secondary: number | null = null;
  let unit: string | null = null;

  if (type === "blood_pressure") {
    // The bp profile is a panel: the numbers live in components, never in the
    // parent's valueQuantity.
    const components = observation.component ?? [];
    const systolic = components.find((c) => codesOf(c.code).includes(BP_SYSTOLIC));
    const diastolic = components.find((c) => codesOf(c.code).includes(BP_DIASTOLIC));
    if (!systolic?.valueQuantity?.value || !diastolic?.valueQuantity?.value) {
      return reject("A blood pressure needs both a systolic and a diastolic reading.");
    }
    value = systolic.valueQuantity.value;
    secondary = diastolic.valueQuantity.value;
    unit = resolveUnit(systolic.valueQuantity, warnings);
  } else {
    const quantity = observation.valueQuantity;
    if (typeof quantity?.value !== "number") {
      return reject("This reading has no numeric value.");
    }
    value = quantity.value;
    unit = resolveUnit(quantity, warnings);
  }

  const expected = VITAL_CONFIG[type]?.unit;
  if (unit && expected && unit !== expected) {
    // Kept as sent rather than converted. Converting silently is how a weight
    // in pounds becomes a weight in kilograms without anyone deciding to.
    warnings.push(
      `Recorded in ${unit}, which is not the ${expected} this record normally uses. The value is stored as sent.`,
    );
  }

  return {
    row: {
      user_id: patientUserId,
      type,
      value,
      secondary_value: secondary,
      unit: unit ?? expected ?? "",
      recorded_at: recordedAt,
      notes: observation.note?.map((n) => n.text).filter(Boolean).join(" · ") || null,
      source: provenance.sourceLabel,
      external_id: provenance.externalId ?? observation.id ?? null,
      ehr_connection_id: provenance.sourceId,
    },
    warnings,
  };
}

function resolveUnit(quantity: { unit?: string; code?: string }, warnings: string[]): string | null {
  if (quantity.code && UCUM_TO_DISPLAY[quantity.code]) return UCUM_TO_DISPLAY[quantity.code];
  if (quantity.unit) {
    if (quantity.code) {
      warnings.push(`Unit code "${quantity.code}" is not one we recognise; "${quantity.unit}" was used as sent.`);
    }
    return quantity.unit;
  }
  if (quantity.code) {
    warnings.push(`Unit code "${quantity.code}" is not one we recognise, and no readable unit was sent.`);
    return quantity.code;
  }
  warnings.push("No unit was sent with this reading.");
  return null;
}

// ---------------------------------------------------------------------------
// MedicationStatement → medications
// ---------------------------------------------------------------------------

export interface InboundMedication {
  user_id: string;
  name: string;
  dosage: string;
  frequency: string;
  type: string;
  instructions: string | null;
  prescriber: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  source: string;
  external_id: string | null;
}

/**
 * One MedicationStatement as a medications row.
 *
 * We accept MedicationRequest too, because plenty of systems send an order
 * where a statement would be more accurate — but the distinction is recorded
 * rather than flattened, since one asserts a prescriber decided and the other
 * only that somebody takes it.
 */
export function fromFhirMedication(
  resource: MedicationStatement,
  patientUserId: string,
  provenance: Provenance,
): InboundResult<InboundMedication> {
  const warnings: string[] = [];

  if (resource.status === "entered-in-error") {
    return reject("The sending system marked this medication as entered in error.");
  }

  const name = resource.medicationCodeableConcept?.text
    ?? resource.medicationCodeableConcept?.coding?.find((c) => c.display)?.display;
  if (!name) {
    return reject(
      "This medication has no readable name — only a code we cannot resolve without a terminology service.",
    );
  }

  if (resource.medicationCodeableConcept?.coding?.length && !resource.medicationCodeableConcept.text) {
    warnings.push("The name came from a code's display text rather than a written name.");
  }

  const dosage = resource.dosage?.[0];
  if (!dosage?.text) {
    warnings.push("No dosage instructions were sent.");
  }

  const active = resource.status === "active" || resource.status === "intended";

  return {
    row: {
      user_id: patientUserId,
      name,
      dosage: dosage?.text ?? "",
      // Free text is kept as one line rather than split into dose and
      // frequency: parsing "500mg twice daily" into fields is guessing.
      frequency: "",
      type: "prescription",
      instructions: resource.note?.map((n) => n.text).filter(Boolean).join(" · ") || null,
      prescriber: null,
      start_date: resource.effectivePeriod?.start ?? resource.effectiveDateTime ?? null,
      end_date: resource.effectivePeriod?.end ?? null,
      is_active: active,
      source: provenance.sourceLabel,
      external_id: provenance.externalId ?? resource.id ?? null,
    },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Condition / AllergyIntolerance → the free-text lists
// ---------------------------------------------------------------------------

/**
 * The readable name of a condition or allergy.
 *
 * These are free-text lists on the profile, so what comes back is a string
 * rather than a row. A resource carrying only codes is refused: putting a
 * SNOMED identifier into a list a patient reads would be worse than dropping
 * it, and the outbound mapper refuses to invent codes for the same reason.
 */
export function fromFhirCondition(condition: Condition): InboundResult<string> {
  if (condition.verificationStatus?.coding?.some((c) => c.code === "entered-in-error")) {
    return reject("The sending system marked this condition as entered in error.");
  }
  const text = condition.code?.text ?? condition.code?.coding?.find((c) => c.display)?.display;
  if (!text) return reject("This condition has no readable name, only codes.");

  const warnings: string[] = [];
  if (!condition.code?.text) {
    warnings.push("The name came from a code's display text rather than a written name.");
  }
  return { row: text.trim(), warnings };
}

export function fromFhirAllergy(allergy: AllergyIntolerance): InboundResult<string> {
  if (allergy.verificationStatus?.coding?.some((c) => c.code === "entered-in-error")) {
    return reject("The sending system marked this allergy as entered in error.");
  }
  const text = allergy.code?.text ?? allergy.code?.coding?.find((c) => c.display)?.display;
  if (!text) return reject("This allergy has no readable name, only codes.");

  const warnings: string[] = [];
  // Losing a criticality is worth saying out loud: "anaphylaxis" and "mild
  // rash" become the same line in a text list.
  if (allergy.criticality) {
    warnings.push(`Criticality "${allergy.criticality}" was sent but is not stored on a text list.`);
  }
  if (allergy.reaction?.length) {
    warnings.push("Reaction details were sent but are not stored on a text list.");
  }
  return { row: text.trim(), warnings };
}

// ---------------------------------------------------------------------------
// Appointment
// ---------------------------------------------------------------------------

export interface InboundAppointment {
  patient_user_id: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  description: string | null;
  resource: Appointment;
  external_id: string | null;
}

const APPOINTMENT_STATUSES = new Set([
  "proposed", "pending", "booked", "arrived", "fulfilled",
  "cancelled", "noshow", "entered-in-error", "checked-in", "waitlist",
]);

/**
 * An inbound Appointment.
 *
 * The whole resource is kept, because our own table stores the resource and
 * derives its columns from it — the projection rule works in this direction
 * too, and keeping the original means nothing is lost even where our columns
 * have no room for it.
 */
export function fromFhirAppointment(
  appointment: Appointment,
  patientUserId: string,
  provenance: Provenance,
): InboundResult<InboundAppointment> {
  const warnings: string[] = [];

  if (!appointment.status || !APPOINTMENT_STATUSES.has(appointment.status)) {
    return reject(
      `"${appointment.status ?? "(none)"}" is not an appointment status this record accepts.`,
    );
  }

  const start = appointment.start ?? null;
  const end = appointment.end ?? null;

  // app-3: a booked appointment needs a time. Refusing here rather than letting
  // the database trigger refuse means the person importing sees why.
  const timeless = ["proposed", "cancelled", "waitlist", "entered-in-error"];
  if (!timeless.includes(appointment.status) && !start) {
    return reject(`An appointment that is "${appointment.status}" must have a start time.`);
  }
  if (start && end && new Date(end) < new Date(start)) {
    return reject("This appointment ends before it starts.");
  }
  if (appointment.participant?.length && !appointment.participant.some((p) => p.actor?.reference)) {
    warnings.push("No participants could be resolved; the appointment is stored without them.");
  }

  return {
    row: {
      patient_user_id: patientUserId,
      status: appointment.status,
      start_time: start,
      end_time: end,
      description: appointment.description ?? null,
      resource: appointment,
      external_id: provenance.externalId ?? appointment.id ?? null,
    },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Summarising an import before it happens
// ---------------------------------------------------------------------------

export interface ImportSummary {
  accepted: number;
  rejected: number;
  warnings: number;
  /** Reasons, deduplicated with a count, so a person reads five lines not five hundred. */
  reasons: { reason: string; count: number }[];
}

export function summariseImport(results: InboundResult<unknown>[]): ImportSummary {
  const reasons = new Map<string, number>();
  let accepted = 0;
  let rejected = 0;
  let warnings = 0;

  for (const result of results) {
    if (result.row === null) {
      rejected += 1;
      const reason = result.rejected ?? "Refused for an unrecorded reason.";
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    } else {
      accepted += 1;
      if (result.warnings.length > 0) warnings += 1;
      for (const warning of result.warnings) {
        reasons.set(warning, (reasons.get(warning) ?? 0) + 1);
      }
    }
  }

  return {
    accepted,
    rejected,
    warnings,
    reasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}
