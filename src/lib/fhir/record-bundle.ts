import type { Bundle, BundleEntry, Resource } from "@medplum/fhirtypes";

import { toFhirAllergies, toFhirConditions } from "@/lib/fhir/clinical";
import { toFhirMedicationStatements, type MedicationRecord } from "@/lib/fhir/medication";
import { toFhirObservations, type VitalRow } from "@/lib/fhir/observation";

/**
 * The whole record, as one FHIR bundle.
 *
 * The homepage promises that your record stays yours if you ever leave. Until
 * now the only thing that could leave was vitals. This is the rest of what we
 * hold in a form another system can read: readings, medications, conditions
 * and allergies, in one collection.
 *
 * A collection bundle and nothing more. It carries no `total` — FHIR's bdl-1
 * invariant forbids that on a collection, and an earlier hand-built bundle
 * here shipped one — and it makes no claim about ordering or completeness
 * beyond the resources inside it.
 *
 * Every resource is built by the mapper that owns it, so the honesty rules
 * those mappers enforce apply here too: no invented codes, no invented
 * structure, and nothing asserted about who said what.
 */

export interface RecordBundleInput {
  patientUserId: string;
  vitals?: VitalRow[];
  medications?: MedicationRecord[];
  /** Free-text condition list from the profile. */
  conditions?: unknown;
  /** Free-text allergy list from the profile. */
  allergies?: unknown;
}

/**
 * `fullUrl` only where the resource has an id.
 *
 * Ids here are uuids, so `urn:uuid:` is a real identifier the receiving system
 * can resolve references against. Conditions and allergies are mapped from
 * free text and have no id, so they get no `fullUrl` rather than a fabricated
 * one.
 */
function toEntry(resource: Resource): BundleEntry {
  return {
    ...(resource.id ? { fullUrl: `urn:uuid:${resource.id}` } : {}),
    resource,
  };
}

export function toRecordBundle({
  patientUserId,
  vitals = [],
  medications = [],
  conditions,
  allergies,
}: RecordBundleInput): Bundle {
  const resources: Resource[] = [
    ...toFhirObservations(vitals, patientUserId),
    ...toFhirMedicationStatements(medications, patientUserId),
    ...toFhirConditions(conditions, patientUserId),
    ...toFhirAllergies(allergies, patientUserId),
  ];

  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: new Date().toISOString(),
    entry: resources.map(toEntry),
  };
}

/** What is in a bundle, for telling someone what they are about to download. */
export function summariseRecordBundle(bundle: Bundle): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of bundle.entry ?? []) {
    const type = entry.resource?.resourceType;
    if (!type) continue;
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}
