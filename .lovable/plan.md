# Clinical Workflow Depth — FHIR-shaped, Medplum-informed (roadmap only)

You asked for the architecture and sequencing, not a build. This plan produces **documents only**: a target architecture, a module-by-module map, and a migration path. No schema or code changes until you approve a phase.

## Recommendation

**Be FHIR-shaped, not Medplum-hosted.** Model our own Postgres tables on the FHIR resources that matter (naming, required fields, status vocabularies, code systems), keep RLS and the existing OneCare access model as the source of truth, and treat Medplum as a *reference implementation and optional interop peer* — we read their resource design and their open-source ideas, review anything we adopt, and never depend on their service to run. If Medplum disappears, nothing in OneCare stops.

Why not the two extremes:
- A pure "borrow the module names" build gets us features fast but leaves us with bespoke shapes we would have to re-model the first time a hospital asks for FHIR export — which enterprise deals will ask for.
- A full generic FHIR JSONB datastore with a FHIR API is the right end state for a platform whose product *is* the datastore. Ours is a patient-facing continuity product; a generic resource store would slow every screen and dilute the four-pillar discipline.

The middle path: **relational tables named and shaped after FHIR resources, with a thin mapping layer** (`src/lib/fhir/`) that converts a row to a FHIR resource and back. That mapper is what powers export, QHIN, and EHR write-back later, and it is the only place interop logic lives.

## What OneCare must not become

OneCare's purpose is to close the post-discharge information gap for the patient. So every module below earns its place only through a patient-visible outcome:

| Module | Clinician gets | Patient must get |
| --- | --- | --- |
| Intake & registration | Structured pre-visit answers | Fill it once, on their phone, reused next visit |
| Scheduling | Real appointment book | See upcoming visits, confirm, reschedule, prep list |
| Charting | Encounters (already live) | Plain-language visit summary they keep in the Vault |
| Diagnostic orders | Order + track labs/imaging | Know what was ordered, why, and the result |
| Messaging | Already live | Already live |
| Billing | Charge capture, statements | See what they owe, what insurance covered, receipts |

Anything with no patient-side column stays out.

## Resource map (our table -> FHIR resource)

Existing, already close: `profiles`/`clinician_patient_records` -> Patient, `encounters` -> Encounter + Composition, `medications` -> MedicationStatement, `vitals` -> Observation, `health_documents` -> DocumentReference, `clinician_guidance` -> CarePlan/Communication, `messages` -> Communication, `practices` -> Organization, `clinician_profiles` -> Practitioner, `practice_members` -> PractitionerRole, `referrals` -> ServiceRequest (referral).

New, per phase:

```text
Intake        questionnaires, questionnaire_responses      Questionnaire / QuestionnaireResponse
Scheduling    appointments, appointment_slots, schedules   Appointment / Slot / Schedule
Orders        service_requests, diagnostic_reports         ServiceRequest / DiagnosticReport / Observation
Billing       charge_items, invoices, invoice_lines,       ChargeItem / Invoice / Coverage /
              payments, coverages                          PaymentReconciliation
Coding        code_systems (ICD-10, CPT, LOINC subsets)    CodeSystem / ValueSet
```

Naming note: patient-side `schedule_entries` (medication doses) stays as-is — it is not FHIR Appointment and must not be conflated.

## Phasing

**Phase 0 — Foundations (docs + small, low-risk).** The FHIR mapping layer skeleton, a shared `code_systems` lookup, and a documented convention for status enums, `subject`/`performer` columns, and audit logging on every new clinical table.

**Phase 1 — Scheduling.** `appointments` bound to practice/clinician/patient, patient-visible in Today and My Health, clinician-visible in the Today inbox. Unlocks intake and billing (both hang off an appointment) and is the module with the clearest immediate value.

**Phase 2 — Intake & registration.** Questionnaire builder for practices (reuse `clinical_templates` patterns), patient fills on mobile, response lands on the appointment and pre-fills the encounter.

**Phase 3 — Billing & payments, statements-first.** `charge_items` -> `invoices` from a signed encounter; patient sees a Billing surface with balance, line items, and receipts. **Payment collection is a separate switch** (see below) and is not part of Phase 3.

**Phase 4 — Diagnostic orders & results.** `service_requests` with status tracking, results attached as `DiagnosticReport` + Observations, patient sees "ordered / collected / resulted" and the plain-language explanation.

**Phase 5 — Interop surface.** Turn the mapper outward: per-patient FHIR export bundle, then narrow write-back where partner agreements exist (already scoped in `ehr-integration-plan.md`).

## Payments — deliberately left open

The plan documents two modes behind one flag, so the decision does not block Phase 3:
- **Statements only** — practice issues the invoice, we display balance and receipts, patient pays elsewhere. No processor, no PCI surface, no Connect onboarding.
- **Pay in OneCare** — Stripe Connect with practice onboarding, platform fee, refunds and reconciliation. Bigger build, real revenue line, and it changes our regulatory posture.

Recommendation captured in the doc: ship statements-first in Phase 3, keep the invoice schema payment-ready (`amount_paid`, `payment_status`, external payment ids), and turn on Connect only when a practice actually asks to collect. No Stripe work now.

## Deliverables of this plan

1. `docs/clinical-modules-plan.md` — the target architecture: FHIR-shaped-not-Medplum-hosted rationale, the resource map above with full column sketches per new table, RLS and access-model rules per module (patient / connected clinician / institution + assignment), the patient-visible requirement per module, and the phase gates.
2. `docs/billing-plan.md` — billing data model, statements-vs-Connect decision matrix, patient billing surface, and what changes in `pricing-constants.ts` if we take a platform fee.
3. `docs/roadmap.md` — a "Clinical workflow depth" entry under Next up linking both docs, and companion-doc links added at the top. No existing roadmap content rewritten.
4. `mem://features/clinician/clinical-modules-fhir-strategy` — the durable rule: FHIR-shaped own tables, Medplum as reviewed reference only, no module without a patient-visible outcome; plus the index entry.

## Technical notes

- Every new clinical table follows the house rules already in force: `CREATE TABLE` -> `GRANT` -> `ENABLE ROW LEVEL SECURITY` -> policies scoped `TO authenticated`, access decided through the existing SECURITY DEFINER helpers (`clinician_has_patient_access`, `practice_has_patient_access`, `is_assigned_to_patient_in_practice`) rather than new bespoke logic, and writes logged via `log_record_access` / `patient_action_log`.
- Surface budget: scheduling and billing land inside the existing pillars (patient: Today + My Health; clinician: Today + Patients + Practice) as sub-tabs. No fifth pillar on either side.
- The mapper lives in `src/lib/fhir/` as pure functions with Vitest coverage, so interop is testable without a network.
- Time-dependent rules (appointment in the future, invoice due dates) use validation triggers, never CHECK constraints.

No source files or database objects change in this plan — documents and memory only.
