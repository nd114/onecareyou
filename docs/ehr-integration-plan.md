# EHR Integration Plan — one-way first, bidirectional later

Status: planning. Read alongside `qhin-integration-plan.md` (national networks) and
`enterprise-hospital-tenancy-plan.md` (who the data belongs to).

**We are not building an EHR.** The point of connecting to one is the platform's own
purpose: a patient should not have to be the courier for their own results. What the
hospital's system knows about a patient's care should reach the patient's record without
them chasing it, and what the patient records between visits should be visible to the
clinician treating them. That is the information asymmetry this closes.

---

## 1. What already exists

| Piece | State |
| --- | --- |
| `ehr_connections` | Per-clinician connection: `provider_type`, `fhir_base_url`, `credentials_encrypted`, `patient_id_mapping`, `sync_status`, `last_sync_at` |
| `ehr_sync_logs` | Per-run record |
| `ehr_export_queue` | Outbound queue — the skeleton of write-back |
| `ehr-sync` | Pulls FHIR `Patient` and `Observation` resources |
| `ehr-webhook` | Inbound endpoint for push-capable systems |
| `scheduled-ehr-sync` | Cron-driven pull, service-role gated |
| `ehr-export` | Outbound document/record export |
| `vitals.source` / `external_id` / `ehr_connection_id` | Provenance columns on imported readings |

So the read path exists in outline. Three things are missing before it is safe at hospital
scale: a **tenant-owned** connection, **identity matching** that cannot silently attach one
patient's results to another, and **conflict rules** for write-back.

---

## 2. Phase 1 — one-way import, tenant-scoped

The change that matters most for OC-LMC: a connection currently belongs to a *clinician*
(`ehr_connections.clinician_user_id`). A hospital's integration belongs to the **hospital**.
A departing doctor must not take the hospital's EHR link with them.

1. **Tenant ownership.** Add `practice_id` to `ehr_connections`; a connection may be owned by
   a tenant or by a solo clinician, never orphaned by an offboarding.
2. **Identity matching, explicitly.** `patient_id_mapping` is a free-form column doing the
   hardest job in the integration. Promote it to a table — `ehr_patient_links` (connection,
   external MRN, OneCare `user_id`, how it was matched, who confirmed it) — and reuse the
   duplicate-detection rules already in `src/lib/patient-dedup.ts`. **Never auto-link on name
   alone.** An unconfirmed match goes to a review queue, exactly as CSV import already does.
3. **Consent gate.** An import writes into a patient's record, so it requires an active share
   with the tenant. No share, no import — the same rule as everything else
   (`docs/sharing-access-consent-model.md` §1.4, no break-glass).
4. **Provenance on every row.** Imported data carries `source = 'ehr_import'`, the connection
   id, and the external id, and renders with the existing `VitalSourceBadge`. A clinician must
   always be able to tell where a number came from.
5. **Scope.** Observations (vitals, labs), conditions, allergies, medications, and documents
   (discharge summaries, imaging reports). Start with what FHIR R4 exposes cleanly.

Deliverable: a hospital connects once, and its patients' hospital-side results appear in their
Vault with the hospital named as the source.

## 3. Phase 2 — write-back, narrowly

Write-back is where an integration starts being able to do harm, so it is deliberately narrow
and never automatic.

- **What we write:** patient-reported vitals, adherence summaries, and clinician-authored notes
  the clinician has explicitly approved for export. Nothing the patient typed goes into the
  hospital's chart labelled as clinical measurement.
- **What we never write:** anything the AI drafted without a human approval already logged in
  `patient_action_log`, and any category the patient has not shared.
- **Approval:** write-back is per-item and clinician-approved, matching the propose → approve →
  apply pattern the assistant already uses. `ehr_export_queue` becomes the durable record.
- **Conflicts:** the hospital's system wins on clinical facts it authored; OneCare wins on
  patient-reported data it authored. Neither silently overwrites the other — a conflict raises a
  review item rather than resolving itself. Every write records source, actor and timestamp.
- **Idempotency:** every outbound item carries a stable key so a retried delivery cannot double
  post into a chart.

## 4. Open questions for the hospital's IT team

These decide the shape of the work and none can be answered from here:

1. Which system, which version, and is FHIR R4 exposed — or is this HL7 v2, or a nightly file drop?
2. Is the endpoint reachable from outside the hospital network, or does this need a gateway?
3. Do they issue an MRN we can match on, and will they confirm matches, or must we?
4. Will they accept write-back at all? Many will not, and Phase 1 alone is still worth having.
5. Who owns the credentials, and what is the rotation policy?

## 5. What not to do

- Do not build a generic "EHR adapter framework" before the second EHR exists. Build for the
  one in front of us and generalise on evidence.
- Do not treat an EHR record as more authoritative than the patient. Both are sources with
  provenance; the patient's own record is not overwritten by an import.
- Do not let an integration become a back door around consent. Access still comes from a share.

---

## What actually imports today (September 2026)

Written down because the gap between the plan above and the code was wide
enough to mislead.

| Resource | Status |
| --- | --- |
| `Observation` (vital signs) | Imported by `scheduled-ehr-sync`, with `source`, `external_id` and `ehr_connection_id` set |
| `MedicationRequest` | Imported by `scheduled-ehr-sync` — added September 2026 |
| Conditions, allergies, documents, labs | Not imported |
| `ehr-sync`'s `import_patient` action | **Finished** (September 2026). Imports observations and medication requests for one patient, on demand. |

### Where the mapping lives

`supabase/functions/_shared/fhir-medication.ts`, and it imports nothing at all.
That constraint is deliberate: an import-free module runs unchanged under Deno
and under vitest, so the logic deciding what a patient's medication list says is
covered by `src/test/fhir-medication-import.test.ts` rather than only ever
running in production against a real hospital.

`src/lib/fhir/inbound.ts` is the browser-side counterpart. It handles
`MedicationStatement` (somebody's account of what is being taken) where the
shared module handles `MedicationRequest` (a hospital's record of what it
prescribed). Those are different claims and are mapped differently on purpose.

### Rules the medication import follows

- **Refuse rather than guess.** No readable name, no dose, a `proposal` rather
  than an `order`, a `draft` or `entered-in-error` status — all rejected with a
  reason, which is written to `ehr_sync_logs.error_details`.
- **A run that refused anything is `partial`, not `success`.** An import that
  quietly drops half a prescription list looks exactly like one that worked.
- **A schedule we cannot express becomes `as_needed` with a warning.** The app
  holds a fixed frequency vocabulary; FHIR can express far more. Rounding an
  unmappable schedule to the nearest one we hold would have a patient dosing on
  a timetable nobody prescribed.
- **A repeated sync updates, never duplicates.** Enforced by the unique index
  on `(user_id, ehr_connection_id, external_id)`, asserted in
  `supabase/tests/medication_provenance.test.sql`. The lookup is explicit rather
  than an upsert because the index is partial and `ON CONFLICT` cannot infer it.

### What provenance now buys the patient

`medications.source` is `'manual'` for anything they entered and the sending
system's name otherwise. `isMedicationEditable()` reads it, and:

- the medication card hides Edit and Delete on an imported row, showing
  "Managed by <hospital> — ask them to change it" instead — a control that
  exists and then refuses is worse than one that is not there;
- `/medications/:id/edit` is reachable by URL, so it renders read-only rather
  than redirecting, which would look like a bug;
- `useMedications` guards the mutations themselves, because the buttons are not
  the only caller — the assistant can change a medication too.

Disconnecting a hospital nulls `ehr_connection_id` but keeps `source`, so the
patient can still see the row was not theirs after the connection is gone.


---

## Finishing `import_patient`

It used to fetch a patient, fetch their observations, count them, log the sync
as `success` with a record count, and write nothing. The comment said "this
would need patient mapping to a real user_id". A sync that reports success
having imported zero rows is worse than one that fails, because nobody goes
looking.

Two questions had to be settled, and both are answered by refusing rather than
guessing.

**Which OneCare user is this?** Only the connection's `patient_id_mapping`
says. If the FHIR patient is not linked, the import refuses with a message
saying so. Matching on name or date of birth is how one person's blood pressure
ends up in another person's record.

**May this clinician write there?** Owning the EHR connection is not consent.
The patient's own sharing decides, and the *database* answers — the function
opens a second client carrying the caller's own JWT and calls
`clinician_has_patient_access` / `institution_has_patient_access` through it.
Service-role does the writing afterwards, because the write is legitimately
cross-user, but it does not get to decide whether it is allowed.

The patient also gets a `patient_action_log` entry saying a hospital put
something in their record. Noticing a medication you did not add is a bad way
to find that out.

### One LOINC table, and what having two hid

`ehr-sync` and `scheduled-ehr-sync` each carried their own copy of the
observation mapping, and the copies had already drifted — one skipped a code
it did not recognise, the other counted it as imported and wrote nothing. Both
now use `supabase/functions/_shared/fhir-observation.ts`, which imports nothing
and so is covered by `src/test/fhir-observation-import.test.ts`.

Writing the test found that **both copies mapped codes to vital types the app
cannot store**: `respiratory_rate` and `bmi` have no entry in `VITAL_CONFIG` at
all, so an imported respiratory rate arrived with a generated label, no normal
range, and therefore no alerting — a reading that looks checked and is not.
`blood_glucose` only resolved through an alias lookup at read time.

So the shared map holds only types the app can actually hold, under the name it
uses, and a test asserts it. A hospital sending a respiratory rate now gets a
line in the skip log rather than a silently useless row. Adding a vital type
means deciding its clinical ranges and alerting behaviour, which deserves a
deliberate change rather than arriving as a side effect of an import.

### Deduplication is by external id, not by timestamp

The scheduled sync matched on `(user_id, type, recorded_at)`, so a corrected
reading resent with a new effective time arrived as a second reading rather
than replacing the first. Both functions now match on the sending system's own
id, which is what identity means here.
