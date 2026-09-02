/**
 * FHIR validation. Server and tests only — never the browser.
 *
 * @medplum/core's validator needs the R4 structure definitions, and
 * @medplum/definitions loads them from disk with `fs.readFileSync`. Two reasons
 * that cannot go in the bundle: it does not resolve in a browser at all (the
 * build fails outright on `resolve` not being exported), and profiles-resources
 * alone is 34 MB.
 *
 * Which is the right answer anyway. Validation a client performs is a
 * convenience it can skip; the rules that must hold live in the database, as
 * the CHECK constraint on status and the app-3 trigger on fhir_appointments.
 * This module is where the full FHIR check runs when something is being
 * accepted from outside — an extraction feed, an edge function — and where the
 * tests hold the mapper to the actual specification rather than to our reading
 * of it.
 */
import { indexSearchParameterBundle, indexStructureDefinitionBundle, validateResource } from "@medplum/core";
import { readJson } from "@medplum/definitions";
import type { Bundle, Resource, SearchParameter } from "@medplum/fhirtypes";

let loaded = false;

/** Load R4 into the validator once. Without it every resource fails as "Invalid resource type". */
export function ensureFhirDefinitions(): void {
  if (loaded) return;
  indexStructureDefinitionBundle(readJson("fhir/r4/profiles-types.json") as Bundle);
  indexStructureDefinitionBundle(readJson("fhir/r4/profiles-resources.json") as Bundle);
  indexSearchParameterBundle(readJson("fhir/r4/search-parameters.json") as Bundle<SearchParameter>);
  loaded = true;
}

/**
 * Check a resource against FHIR R4.
 *
 * Runs the structure definitions and the FHIRPath invariants — app-3, which
 * requires a start and an end unless an appointment is proposed, cancelled or
 * waitlisted, is caught here rather than by a rule we had to think of.
 *
 * What it does *not* check is value-set binding: `status: "rescheduled"` passes,
 * because binding needs terminology these bundles do not carry. The CHECK
 * constraint on fhir_appointments.status is what refuses that, which is why both
 * layers exist.
 */
export function validateFhir(resource: Resource): void {
  ensureFhirDefinitions();
  validateResource(resource);
}
