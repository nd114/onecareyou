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

Please extend these files rather than starting new ones when the rules change,
and add a row above so the coverage stays legible.
