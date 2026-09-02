import type { AllergyIntolerance, Condition } from "@medplum/fhirtypes";
import { toClinicalList } from "@/lib/clinical-lists";

/**
 * Conditions and allergies as FHIR, from the free text we actually hold.
 *
 * Unlike Appointment, these are not stored as resources. They are free-text
 * lists on profiles, entered by patients and by clinicians in a hurry, and
 * turning them into a FHIR-shaped table would mean migrating dirty text and
 * rewriting twenty files for no clinical gain. What is worth having is the
 * mapping: export, QHIN and EHR write-back all need Condition and
 * AllergyIntolerance, and this is where the free text becomes them.
 *
 * The honesty rule: no invented codes. "Diabetes" in a text box is not a SNOMED
 * concept, and emitting `73211009` because the string looked close would put a
 * clinical claim into an exported record that nobody made. FHIR allows a
 * CodeableConcept to carry `text` with no `coding`, which is exactly what this
 * data is. Coding comes when a terminology service does the mapping and a
 * clinician confirms it — not from string matching here.
 */

/** `verificationStatus`, so a reader knows how much weight to put on it. */
const UNCONFIRMED = {
  coding: [
    {
      system: "http://terminology.hl7.org/CodeSystem/condition-ver-status",
      code: "unconfirmed",
      display: "Unconfirmed",
    },
  ],
};

const ACTIVE = {
  coding: [
    {
      system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
      code: "active",
      display: "Active",
    },
  ],
};

/**
 * FHIR Conditions for a patient's stored condition list.
 *
 * Every one comes back `unconfirmed`, because that is what a self-reported line
 * of text is. A receiving system that treats an unconfirmed condition as a
 * diagnosis is making its own mistake; one that is told these are confirmed is
 * making ours.
 */
export function toFhirConditions(value: unknown, patientUserId: string): Condition[] {
  return toClinicalList(value).map((text) => ({
    resourceType: "Condition" as const,
    clinicalStatus: ACTIVE,
    verificationStatus: UNCONFIRMED,
    code: { text },
    subject: { reference: `Patient/${patientUserId}` },
  }));
}

/**
 * FHIR AllergyIntolerances for a patient's stored allergy list.
 *
 * `type`, `criticality` and `reaction` are all left out rather than guessed. A
 * free-text line says what the patient reacts to and nothing about how badly —
 * and an allergy exported as `criticality: low` on no evidence is worse than one
 * exported with the field absent, because absence reads as unknown while a value
 * reads as assessed.
 */
export function toFhirAllergies(value: unknown, patientUserId: string): AllergyIntolerance[] {
  return toClinicalList(value).map((text) => ({
    resourceType: "AllergyIntolerance" as const,
    clinicalStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
          code: "active",
          display: "Active",
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
          code: "unconfirmed",
          display: "Unconfirmed",
        },
      ],
    },
    code: { text },
    patient: { reference: `Patient/${patientUserId}` },
  }));
}
