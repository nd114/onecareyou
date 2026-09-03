import type { Dosage, MedicationStatement } from "@medplum/fhirtypes";

/**
 * A patient's medication list as FHIR.
 *
 * The adapter plan said `MedicationRequest`. That is the wrong resource for
 * this data, and mapping to it would put a claim into an exported record that
 * nobody made. A MedicationRequest is an *order* — someone with prescribing
 * authority asked for this to be dispensed. Our `medications` table is a list
 * of what a person takes: prescriptions alongside paracetamol, vitamin D and a
 * herbal remedy, typed in by the patient. `prescriber` is a name in a text
 * box, not a reference to an order we hold.
 *
 * FHIR has a resource for exactly that distinction, and it is
 * `MedicationStatement`: "a record of a medication that is being consumed by a
 * patient", explicitly not a request. So that is what this emits.
 *
 * The same honesty rules as `clinical.ts` apply:
 *
 *   - **No invented codes.** "Metformin 500mg" in a text box is not an RxNorm
 *     concept. `medicationCodeableConcept.text` carries the name and no
 *     `coding` is emitted, because a wrong code is worse than no code when the
 *     receiving system is a drug-interaction checker.
 *   - **No invented structure.** `frequency` is free text ("twice daily",
 *     "with meals"). It goes in `dosage.text` where a human reads it. The only
 *     structured timing emitted comes from `times_of_day`, which is already
 *     structured, and only when its entries actually look like times.
 *   - **No `informationSource`.** We do not record who added a row, so we
 *     cannot say whether the patient or a clinician asserted it, and guessing
 *     Patient would be wrong for the clinician-managed record.
 *   - **No `category`.** The FHIR value set distinguishes inpatient,
 *     outpatient, community and patient-specified. We cannot tell which
 *     applies without knowing who asserted the row, so nothing is claimed.
 */

/** The columns this mapper reads. A subset of the `medications` row. */
export interface MedicationRecord {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  type: string;
  instructions?: string | null;
  prescriber?: string | null;
  pharmacy?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean | null;
  discontinued_at?: string | null;
  discontinuation_reason?: string | null;
  times_of_day?: unknown;
  created_at?: string | null;
}

/**
 * What we store, which is `HH:MM` or `HH:MM:SS`.
 *
 * FHIR's `time` primitive is stricter than it looks: seconds are **mandatory**,
 * so `08:00` is not a valid FHIR time and the validator rejects it. Our
 * `times_of_day` values are minute-precision, so they are padded on the way
 * out rather than emitted as-is.
 */
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/**
 * Status, from the three columns that carry it.
 *
 * Order matters: a discontinued medication is `stopped` whether or not the row
 * still says active, because somebody made a decision to end it. An inactive
 * row with no discontinuation is a course that ran out, which is `completed`.
 */
export function medicationStatus(record: MedicationRecord): MedicationStatement["status"] {
  if (record.discontinued_at) return "stopped";
  if (record.is_active === false) return "completed";
  return "active";
}

/**
 * Times a dose is due, from `times_of_day`, ignoring anything unparseable and
 * padding to the seconds FHIR requires.
 */
export function structuredTimes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => TIME_OF_DAY.test(v))
    .map((v) => (v.length === 5 ? `${v}:00` : v));
}

/**
 * The human dosage line: what to take, how often, and any instruction.
 *
 * Joined rather than parsed. "500 mg · twice daily · with food" is what a
 * clinician reads on the other end, and it is exactly what our columns say.
 */
export function dosageText(record: MedicationRecord): string {
  return [record.dosage, record.frequency, record.instructions]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" · ");
}

function toDosage(record: MedicationRecord): Dosage[] {
  const text = dosageText(record);
  const times = structuredTimes(record.times_of_day);
  if (!text && times.length === 0) return [];

  const dosage: Dosage = {};
  if (text) dosage.text = text;
  if (times.length > 0) dosage.timing = { repeat: { timeOfDay: times } };
  return [dosage];
}

/**
 * Free-text facts with no structured home on MedicationStatement.
 *
 * Dropping them on export would lose real information — that a herbal remedy
 * is a herbal remedy matters to whoever checks interactions next — so they go
 * where FHIR puts human text it has no field for.
 */
function toNotes(record: MedicationRecord): MedicationStatement["note"] {
  const notes = [
    record.type ? `Recorded as: ${record.type}` : "",
    record.prescriber ? `Prescriber (as entered): ${record.prescriber}` : "",
    record.pharmacy ? `Pharmacy (as entered): ${record.pharmacy}` : "",
  ].filter(Boolean);
  return notes.length > 0 ? notes.map((text) => ({ text })) : undefined;
}

/** One medication as a FHIR MedicationStatement. */
export function toFhirMedicationStatement(
  record: MedicationRecord,
  patientUserId: string,
): MedicationStatement {
  const status = medicationStatus(record);

  const statement: MedicationStatement = {
    resourceType: "MedicationStatement",
    id: record.id,
    status,
    medicationCodeableConcept: { text: record.name },
    subject: { reference: `Patient/${patientUserId}` },
  };

  // The period it was taken for. `end` prefers the recorded end date and falls
  // back to when it was discontinued, because a stopped medication has an end
  // even when nobody filled the field in.
  const end = record.end_date ?? record.discontinued_at ?? null;
  if (record.start_date) {
    statement.effectivePeriod = { start: record.start_date, ...(end ? { end } : {}) };
  } else if (end) {
    statement.effectivePeriod = { end };
  }

  if (record.created_at) statement.dateAsserted = record.created_at;

  // Why it was stopped, as text. No code: "side effects" from a text box is
  // not a coded reason, and there is no value set that would make it one.
  if (status === "stopped" && record.discontinuation_reason) {
    statement.statusReason = [{ text: record.discontinuation_reason }];
  }

  const dosage = toDosage(record);
  if (dosage.length > 0) statement.dosage = dosage;

  const note = toNotes(record);
  if (note) statement.note = note;

  return statement;
}

/** A patient's whole list. */
export function toFhirMedicationStatements(
  records: MedicationRecord[],
  patientUserId: string,
): MedicationStatement[] {
  return records.map((record) => toFhirMedicationStatement(record, patientUserId));
}
