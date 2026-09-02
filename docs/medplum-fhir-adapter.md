# Medplum as a Library, Not a Backend

**Status:** Appointment shipped; remaining resources scoped below
**Owner:** Engineering
**Relates to:** `docs/ehr-integration-plan.md`, `docs/qhin-integration-plan.md`, `docs/sharing-access-consent-model.md`

---

## 1. The question this answers

The clinician side needs more depth than it has, and Medplum has a great deal of
it built already. The options were to stand up self-hosted Medplum beside our
Supabase, or to take the parts of Medplum that are genuinely ready and run them
against our own database.

We took the second. This document says why, what that actually means in code,
and what it cost.

## 2. Why not self-hosted Medplum

Not a licensing problem — `@medplum/core`, `@medplum/fhirtypes`, `@medplum/react`,
`@medplum/fhir-router` and `@medplum/definitions` are all Apache-2.0, and we are
free to use them commercially. Two other things decided it.

**`@medplum/server` is not published to npm.** Adopting it means running their
server from source: a second Postgres, a second identity system, a second
authorisation model, and a Redis. Verified rather than assumed.

**Authorisation is the whole product.** Consent lives in Postgres RLS, and there
are now 198 assertions across sixteen SQL suites proving what each pathway can
reach. A second backend means either replicating those rules in Medplum's
AccessPolicies — the same rules, expressed twice, drifting — or letting a system
that does not know about `practice_shares` decide who sees what. Neither is
acceptable for a product whose claim is that the patient controls access.

So: their libraries, our database, one authorisation model.

## 3. What that looks like

`public.fhir_appointments` is a real FHIR R4 Appointment. The columns a clinician
filters and sorts on are promoted to real columns; the complete resource lives in
`resource` as jsonb.

The columns are **projections of the resource**, never the other way round.
`src/lib/fhir/appointment.ts` is the only place that writes both, because a
projection maintained in two places is a projection that quietly stops matching
what it projects. That is not hypothetical: the first version of the status
change updated the column and left the resource saying `booked` on a cancelled
appointment, and since readers trust the stored resource, the cancellation would
not have been visible to anything reading FHIR. `toStatusPatch` exists to stop
that, and a test holds it there.

### What each layer is actually for

| Layer | Enforces | Notes |
| --- | --- | --- |
| `@medplum/core` validator | FHIR structure and FHIRPath invariants | Catches app-3 — a booked appointment needs a start and an end — which is a rule we would otherwise have had to think of ourselves |
| DB `CHECK` on `status` | The value set | The validator **passes** `status: "rescheduled"`. Value-set binding needs terminology the structure-definition bundles do not carry. Verified, and pinned by a test in both suites |
| `validate_fhir_appointment` trigger | app-3 and time ordering, server-side | Client validation is validation a client can skip |
| RLS policies | Who may read, write and amend | The same helpers that decide everything else: `clinician_has_patient_access`, `institution_has_patient_access` |

The validator and the CHECK constraint are complementary, not redundant. That is
the single most useful thing we learned building this, and it came from running
the validator rather than reading about it.

### Validation does not ship to the browser

`@medplum/definitions` reads its bundles from disk with `fs.readFileSync`, so the
production build fails outright on it — and `profiles-resources.json` alone is
34 MB. It lives in `devDependencies` and is imported only by
`src/lib/fhir/validate.ts`, which is server- and test-only.

This is the right shape anyway. The full FHIR check runs where something is
being accepted from outside — an extraction feed, an edge function — and in the
tests that hold the mapper to the specification. In the browser, the mapper is
pure and the database is the enforcement.

## 4. What it cost

| | Before | After |
| --- | --- | --- |
| Main bundle | 3,441.31 kB | 3,451.89 kB |
| Gzipped | 953.83 kB | 956.23 kB |

**+2.4 kB gzipped.** `@medplum/fhirtypes` is types-only and erases at compile
time; `@medplum/core` tree-shakes out of the browser path because the only thing
importing it there is nothing. Measured against a clean build of `main`, not
estimated.

## 5. Deliberate omissions

**No DELETE, at either layer.** Cancelling is a status change — a cancelled or
missed appointment is part of the record, and FHIR has statuses for both. The
table has no DELETE policy, and the privilege is revoked as well.

Worth knowing: Supabase's default privileges grant `anon` and `authenticated`
the full set on every new table in `public`, so a `GRANT` line that omits DELETE
does not withhold it. The RLS suite asserts the delete refusal *with the
privilege deliberately granted*, so the refusal has to come from the absence of
a policy rather than from a grant that a later migration could restore.

**Patients read, they do not write.** Requesting an appointment is a different
feature with a different flow — a request is not a booking. Until that exists, a
patient editing the clinic's calendar is not a thing.

**No coded `appointmentType`.** FHIR wants a code; without a code system agreed
with the tenant, display text is the honest representation rather than a code we
invented.

## 6. What comes next

Appointment was chosen first because it is small, it is visible on both sides of
the product, and it exercises every layer — resource shape, validator,
constraint, trigger, and both access pathways. It is the pattern the rest follow.

In rough order of value:

| Resource | Status | Notes |
| --- | --- | --- |
| `Condition` | **Done** — mapping only, see §6.1 | No table. Free text on `profiles`, mapped for export |
| `AllergyIntolerance` | **Done** — mapping only, see §6.1 | Same |
| `Observation` | Next | Vitals is a real table, so this is the closest analogue to Appointment. Needs a decision on LOINC coding |
| `MedicationRequest` | After that | Interacts with the drug-interaction checker |
| `DocumentReference` | Later | Natural fit for QHIN retrieval |

Each one carries a mapper with the projection rule, a unit suite, and rows in
`supabase/tests/README.md`. A migration too, where there is a table to migrate.

### 6.1 Condition and AllergyIntolerance: mapping, not tables

This document previously said these two would replace "the existing conditions
table" and that the mapping was "mostly mechanical". Both were wrong, written
before looking at how the data is actually stored.

There is no conditions table and no allergies table. They are free-text jsonb
lists on `profiles`, `clinician_patient_records` and `family_members`, read in
about twenty files. Giving them FHIR-shaped tables would mean migrating dirty
free text and rewriting all of those, for no clinical gain — the fields are not
queried, ranked or joined; they are shown.

What is worth having is the mapping, and that is what shipped:
`src/lib/fhir/clinical.ts` turns the stored lists into real `Condition` and
`AllergyIntolerance` resources, validated against R4. Export, QHIN and
write-back get what they need; storage does not move.

**No invented codes.** "Diabetes" in a text box is not a SNOMED concept, and
emitting `73211009` because the string looked close would put a clinical claim
nobody made into an exported record. FHIR lets a CodeableConcept carry `text`
with no `coding`, which is precisely what this data is. Everything comes back
`unconfirmed`, and `criticality`, `type` and `reaction` are omitted rather than
guessed — an absent field reads as unknown, a populated one reads as assessed.
Coding arrives when a terminology service does the mapping and a clinician
confirms it.

### 6.2 What the mapping turned up

The columns are plain jsonb with no constraint, so a bare string was storable
where the app reads an array. Three consequences, all verified rather than
imagined:

- `ClinicianDataConsentDialog` counted the characters of the string and offered
  the patient **"22 health condition(s)"** to consent to
- `ManagedRecordFilters` called `.map` on it, which throws
- `useFamilyMembers` guarded with `Array.isArray(...) ? ... : []`, which does not
  crash but silently discards the list — a member whose conditions were stored
  as `"Diabetes, Hypertension"` showed none at all

Fixed in both directions. `normalise_clinical_list` converts what is already
stored and a CHECK constraint stops it recurring, on all three tables;
`toClinicalList` normalises at the hook boundary so every reader downstream gets
a real array. NULL is deliberately still allowed and still means *withheld*,
which is not the same as an empty list meaning *none recorded* — a clinician
reading "no known allergies" when the truth is "you were not told" is the
failure that distinction exists to prevent.

`@medplum/fhir-router` and a `FhirRepository` implementation over these tables
become worthwhile once there are three or four resources — `FhirRepository` is an
abstract class with fourteen methods and `MemoryRepository` as a worked
reference, so it is a real extension point rather than a hope. One resource does
not justify it yet.

## 7. What this does not change

Extraction, QHIN retrieval and EHR write-back still need the work described in
their own plans. What this gives them is something real to map to and from,
rather than an approximation of FHIR we would have had to reconcile later.
