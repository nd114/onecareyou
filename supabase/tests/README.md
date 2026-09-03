# Database tests

RLS is the security boundary for this product, so the rules that matter are
asserted against a real Postgres rather than inferred from the UI.

## Running

These need a Postgres with the migration history applied. Against a local
Supabase (`supabase start`):

```sh
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" \
  -v ON_ERROR_STOP=1 -f supabase/tests/institution_access.test.sql
```

Against a plain Postgres 16, the history replays with a small compatibility
shim (roles `anon`/`authenticated`/`service_role`, an `auth.uid()` reading
`request.jwt.claim.sub`, and stub `storage`/`realtime` schemas), plus the
grants Supabase applies by default to new objects in `public`. The shim ends
with those, as `ALTER DEFAULT PRIVILEGES`:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
```

**Run the shim before the migrations, and do not substitute a blanket
`GRANT ALL ON ALL TABLES` afterwards.** Supabase applies these at
`CREATE TABLE` time, so a `REVOKE` later in the history wins — which is exactly
how `rate_limit_events`, `kingschat_login_attempts` and the audit log end up
with no client grants at all. Granting everything after the replay silently
undoes every one of those revokes, and the four suites that assert them fail
against code that is in fact correct. Default privileges are per-role and
persist in the cluster, so a database being reused for a second replay wants
them revoked first.

Each file runs inside a transaction and rolls back, so it leaves no fixtures
behind. A failed assertion raises and aborts; a clean run ends with
`ALL INSTITUTION ACCESS TESTS PASSED`.

## What is covered

`institution_access.test.sql` — the hospital (institution) sharing pathway:

| Rule | Source |
| --- | --- |
| A clinician assigned to a hospital-shared patient reads the shared categories | consent model §2B |
| Categories the patient withheld stay unreadable | consent model §2B |
| A colleague at the same hospital without an assignment reads nothing | consent model §2B |
| An assignment made by another tenant grants nothing | tenancy plan §2 |
| Patient identity resolves through the institution pathway, and only there | tenancy plan §2 |
| Adherence history follows the medications category | consent model §2B |
| Conditions and allergies are released per category, not together | consent model §2B |
| A hospital may end a share but never restart one | consent model §3 |
| Revocation stops forward access immediately | consent model §3 |
| The relationship ledger records connect / revoke / re-share | consent model §3 |

`department_delegation.test.sql` — departments and the Sub-Admin role:

| Rule | Source |
| --- | --- |
| A lead routes and assigns inside their own department | tenancy plan §3 (Phase D) |
| A lead cannot assign in another department, or to a clinician outside theirs | tenancy plan §3 |
| A lead cannot appoint another lead, or create a department | tenancy plan §3 |
| A sub_admin holds no tenant management, team or billing rights | build prompt §2 |
| A lead's oversight covers their own departments and the unrouted queue | tenancy plan §3 |
| The chief admin sees the full staff roster and every shared patient | build prompt §10 |
| An ordinary clinician gets no oversight surface | build prompt §2 |

`clinician_affiliation.test.sql` — whitelisting, bulk onboarding, offboarding:

| Rule | Source |
| --- | --- |
| An approved domain or allowlist entry affiliates immediately | build prompt §4 |
| Anyone else lands in pending approval, holding no capabilities | build prompt §4 |
| Affiliation never creates a duplicate membership | build prompt §4 |
| Bulk import skips duplicates and unusable rows | build prompt §4 |
| Offboarding revokes access without deleting the person | build prompt §4 |
| The last owner cannot be offboarded | operational safety |

`privilege_escalation.test.sql` — the red-team findings, as regressions:

| Rule | Why |
| --- | --- |
| A patient cannot grant themselves the paid plan | RLS grants the whole profile row, including subscription_tier |
| A tenant admin cannot change their revenue share, storage or seat limits | Those are contract terms, not tenant settings |
| A clinician cannot re-activate a revoked share or widen their permissions | The patient creates, narrows and ends every relationship |
| The legitimate write each policy exists for still works | Guards must not break notes, renames or profile edits |
| Service-role callers can still set entitlement | Stripe and admin tooling run server-side |

`fhir_appointments.test.sql` — scheduling, as a FHIR Appointment:

| Rule | Source |
| --- | --- |
| The patient reads the appointments made for them, and only those | the point of the module |
| Both clinician pathways reach it; an unrelated clinician reaches nothing | consent model §2B |
| A clinician schedules only for patients they can already reach | consent model §2B |
| An appointment cannot be attributed to another clinician | `created_by = auth.uid()` |
| The patient reads but does not write the clinic's calendar | requesting a time is a separate flow |
| Nobody can delete: cancelling is a status change | FHIR Appointment.status |
| A signed-out visitor reads nothing | appointments are never public |
| A booked appointment must have a start and an end | FHIR invariant app-3 |
| An appointment cannot end before it starts | clinical sanity |
| A status outside the FHIR value set is refused | the gap `@medplum/core` does not cover |
| `updated_at` is stamped by the database, not trusted from the client | audit integrity |

The delete and value-set assertions are the ones worth keeping honest. Both
cover a layer the client-side validator does not: Medplum passes a status code
it has never heard of, because value-set binding needs terminology the
structure-definition bundles do not carry, and the delete test runs with the
privilege deliberately granted so that the refusal has to come from the absence
of a policy rather than from the grant.

`clinical_lists.test.sql` — conditions and allergies are lists:

| Rule | Source |
| --- | --- |
| A loose comma- or semicolon-separated string is recovered as a list | the CSV import writes semicolons, hand entry writes commas |
| An array is left exactly as it is | normalisation must not churn clean data |
| Stray separators do not produce blank entries | a blank badge is a bug |
| An object is kept as a single entry rather than discarded | it is somebody's data |
| A bare string can no longer be stored, on any of the three tables | CHECK constraint |
| NULL still means withheld; `[]` still means none recorded | the two mean opposite things to a clinician |

The withheld/empty distinction is the one to protect. "No known allergies" when
the truth is "you were not told" is the failure it exists to prevent, so the
constraint allows NULL rather than collapsing it into an empty array.

`fhir_invoices.test.sql` — billing, and who may see a bill:

| Rule | Source |
| --- | --- |
| The invoice total is summed by the database from its line items | a client that computes its own eventually computes a different one |
| An issued invoice does not silently re-total when a line is added | it is a statement someone has been given |
| The patient reads their own issued invoices without asking | the asymmetry this product exists to remove |
| A draft stays with the practice until issued | a number still being decided cannot usefully be queried |
| Line items follow the invoice, through an RLS-aware subquery | a total with no breakdown is a demand, not a bill |
| A patient cannot mark their own invoice paid | payment confirmation is server-side |
| Nobody deletes an invoice; cancelling is a status | FHIR `cancelled` / `entered-in-error` |
| Paid never exceeds billed; totals are never negative | a credit is its own invoice |
| Not balanced until paid in full | FHIR's meaning of the status |
| Currency is an ISO code; due never precedes issued | constraint and trigger |

The line-item assertion is the one that earns its place: the policy leans on a
subquery against `fhir_invoices`, and whether that subquery inherits the invoice
table's row policies is a thing to test rather than believe. Replacing it with
`USING (true)` makes the suite fail, which is how we know it is load-bearing.

`signed_notes.test.sql` — a signed note is a record, not a draft:

| Rule | Source |
| --- | --- |
| A signed assessment, plan, codes or transcript cannot be rewritten | clinical records integrity |
| A note cannot be un-signed or back-dated | otherwise every rule above is one UPDATE away |
| An unsigned note is freely editable, and freezes the moment it is signed | a draft is a draft |
| Sharing can still be withdrawn after signing | disclosure is not a clinical claim |
| Retraction marks the note and leaves the text readable | FHIR `entered-in-error`, not a gap |
| Corrections go in an addendum, by the author or a colleague who can reach the patient | how paper records worked, and why |
| An addendum cannot be attributed to another clinician | `author_user_id = auth.uid()` |
| An addendum cannot be edited or deleted, even by its author | a later one corrects it |
| A patient reads corrections to summaries they were given, and only those | see below |

`signed_at` existed and meant nothing before this: the update policy was
`(clinician_user_id = auth.uid())` with no reference to it, so an author could
rewrite a signed assessment leaving nothing behind but a changed `updated_at`.
Test 1 is that exact attempt.

The patient assertions exist because of something testing found and reasoning
missed. Patients read summaries through `my_visit_summaries()`, a SECURITY
DEFINER function, since they hold no direct SELECT on `encounters` — and the
addendum policy defers to the encounter policies they also do not hold. The
patient therefore saw the summary and none of its corrections. A companion
function fixes it, and mirrors the summary rules exactly: signed, shared, not
retracted.

`fhir_care_plans.test.sql` — what the rest of the record is for:

| Rule | Source |
| --- | --- |
| A goal is measurable or it is not — never half a target | half a target renders as a number with no meaning |
| A goal with no measure at all is allowed | "walk more" is a real thing a clinician says |
| A plan needs a title, cannot end before it starts, and takes only FHIR statuses | constraints |
| The patient sees the active plan, not one still being decided | same reasoning as invoice drafts |
| Goals follow the plan, through an RLS-aware subquery | a plan without its goals is a title |
| The patient reads but does not write | a plan is what was agreed, not what one side decided |
| A plan is revoked, never deleted | it is part of the record |

`independent_vs_institution.test.sql` — the independent clinician, the hospital,
and the person who is both:

| Rule | Why it matters |
| --- | --- |
| A hospital never inherits a doctor's private list | taking a post must not hand your patients to your employer |
| A doctor never gains the hospital's list personally | the mirror of the same rule |
| Leaving the job does not take your own patients with it | otherwise a patient's invitation means nothing |
| Another hospital's membership grants nothing here | assignments are scoped to their tenant |
| Ending one relationship never ends the other | a patient can leave either independently |
| Only the patient changes the terms of a personal share | `guard_provider_share_consent` |

The consent-guard assertions exist because a draft of this suite tried to end a
share while carrying a colleague's identity and the change was silently
reverted. That was the guard working; it is asserted now rather than assumed.
See `docs/independent-clinicians-and-hospitals.md`.

`practice_access_consent.test.sql` — a practice cannot let itself in:

| Rule | Why |
| --- | --- |
| A practice cannot record access to a patient who never shared with it | this was possible; test 1 is the attack |
| An existing access row is not evidence of consent | closing only the door leaves everything already through it working |
| A patient who shared can be recorded normally, notes included | a tightening that breaks real access is not a fix |
| Ending the share ends the access, whatever the row says | consent is what moved, not the record |
| The access row itself survives | it is a record of what a practice did, not a permission |

This suite exists because the platform allowed the attack. A staff member with
`can_invite_patients` could insert a `practice_patient_access` row for any
patient at all and immediately read their signed notes and raw ambient
transcript: the INSERT policy asked for membership and the invite capability,
and nothing about the patient agreeing. Verified by doing it before the fix, and
refused after.

Please extend these files rather than starting new ones when the rules change,
and add a row above so the coverage stays legible.
