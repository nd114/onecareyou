# Medplum as a Library, Not a Backend

**Status:** Appointment shipped; remaining resources scoped below
**Owner:** Engineering
**Relates to:** `docs/loinc-and-coding-policy.md`, `docs/ehr-integration-plan.md`, `docs/qhin-integration-plan.md`, `docs/sharing-access-consent-model.md`

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
| `Observation` | **Done** — mapping plus export, see §6.3 | Vitals is a real table. LOINC coding resolved without a decision needed |
| `CarePlan` / `Goal` | **Done** — table plus mapper | Goals score against readings the patient already takes |
| `Invoice` | **Done** — table plus mapper | Minor units, per-tenant currency; see docs/billing-and-payments.md |
| `Communication` | **Done** — mapping only | Assistant messages filed as `sender.display`, never a Practitioner reference |
| `MedicationStatement` | **Done** — mapping plus export, see §6.5 | *Not* `MedicationRequest`; see below |
| `DocumentReference` | Next | Natural fit for QHIN retrieval, and the last thing the Vault cannot export |

The tables these added are not in the generated Supabase types yet, because
that file is regenerated from the deployed database and these migrations have
not been run. `src/integrations/supabase/types-extra.ts` carries hand-written
types for them in the meantime, read back out of the migrations rather than
written from memory — see that file for how to retire it.

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

### 6.3 Observation: the first resource we could code honestly

Vitals is a real table with typed numeric values, so this maps a row rather than
parsing free text — and it is the first place coding was possible without
guessing.

**Every LOINC code was read out of the R4 bundle**, not recalled. What is and
is not coded, and what to say about it to a client, is in
`docs/loinc-and-coding-policy.md` — read that before any demo. The codes come
from `ValueSet/observation-vitalsignresult`; which code belongs to which
measurement comes from the vital-sign profiles (`bodyweight` → 29463-7,
`heartrate` → 8867-4, `bodytemp` → 8310-5, `oxygensat` → 2708-6, `bp` → 85354-9
with components 8480-6 and 8462-4). The test suite re-extracts them from the
bundle, so the claim stays checkable rather than becoming folklore. UCUM units
are the spec's spellings from `ValueSet/ucum-vitals-common`, which is why `bpm`
becomes `/min` and `°C` becomes `Cel`.

The other fourteen types we store are **laboratory results, not vital signs**,
and get `category: laboratory`. LOINC has codes for them, but those codes are
not in the FHIR bundles and would have to be typed from memory — the same
failure as inventing SNOMED for "Diabetes" in different clothes. They carry
`code.text` and no coding until a terminology source provides one. Units we
cannot code honestly (`x10³/µL` is not valid UCUM) are emitted as
`Quantity.unit` with no system, which is what FHIR intends for an uncoded unit.

Blood pressure is a panel with two components, not a number with a spare. `128`
in `valueQuantity` and `82` in a secondary column is our storage shape, not a
clinical fact, and it does not survive the mapping.

**Patients can now download their readings as a FHIR bundle** from the vitals
export dialog, alongside CSV and PDF. That is the first thing on this platform
another system can read without a bespoke mapping written for us.

### 6.4 What building the export turned up

The bundle was built inline at the download site, where no test could reach it,
and it carried a `total` field. FHIR's `bdl-1` invariant allows `total` only on
a `searchset` or `history` bundle — a `collection` is neither. Every Observation
inside it validated; the file a receiver got did not, and a strict one would have
rejected the lot.

Found by generating a real bundle and validating it, not by review. The fix was
to move bundle construction into `src/lib/fhir/observation.ts` where a test
reaches it, and the lesson generalises: **validate the envelope, not only what
is in it.** Three tests now fail if the `total` comes back.

## 7. What this does not change

Extraction, QHIN retrieval and EHR write-back still need the work described in
their own plans. What this gives them is something real to map to and from,
rather than an approximation of FHIR we would have had to reconcile later.


### 6.5 The plan named the wrong resource

This table said `MedicationRequest`. Mapping to it would have put a claim into
every exported record that nobody made.

A `MedicationRequest` is an **order**: somebody with prescribing authority
asked for this to be dispensed. Our `medications` table is a list of what a
person takes — prescriptions alongside paracetamol, vitamin D and a herbal
remedy, most of it typed in by the patient. `prescriber` is a name in a text
box, not a reference to an order we hold.

FHIR draws exactly this distinction, and the resource for a record of what a
patient is actually consuming is `MedicationStatement`, which the specification
describes as explicitly not a request. That is what `src/lib/fhir/medication.ts`
emits.

The same honesty rules as §6.1 apply, and one more that only appeared when the
validator ran: FHIR's `time` primitive requires seconds, so the `08:00` we
store is not a valid FHIR time. `structuredTimes` pads it. Nothing but running
the real validator would have found that — the resource looked correct.

What is deliberately *not* claimed:

| Field | Why it is absent |
| --- | --- |
| `medicationCodeableConcept.coding` | "Metformin 500mg" in a text box is not an RxNorm concept, and a wrong code reaching an interaction checker is worse than none |
| `informationSource` | We do not record who added a row, so we cannot say whether the patient or a clinician asserted it |
| `category` | The value set distinguishes inpatient, outpatient, community and patient-specified; we cannot tell which without knowing who asserted it |
| structured `timing.repeat.frequency` | "twice daily" is free text. Only `times_of_day`, which is already structured, becomes structured timing |

Type, prescriber and pharmacy have no structured home on MedicationStatement
and are carried as notes rather than dropped — that a remedy is herbal matters
to whoever checks interactions next.

### 6.6 The record can now leave

`src/lib/fhir/record-bundle.ts` assembles readings, medications, conditions and
allergies into one R4 collection bundle, exposed to the patient under Settings
→ Privacy & data. Before this, the only thing that could leave was vitals.

The counts are shown before the download rather than after, so nobody opens a
JSON file to find out whether it holds what they expected, and the action is
placed below the contents for the same reason.

Documents in the Health Vault are still downloaded separately — that is what
`DocumentReference` is for, and it is now the next resource worth doing.
