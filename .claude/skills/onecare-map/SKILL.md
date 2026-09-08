---
name: onecare-map
description: Read FIRST in any OneCare session before searching the codebase. An orientation map — where things live, which tables and helper functions matter, what the access model is, and which files answer which question — so a session spends its budget on the work rather than on rediscovering the layout. Trigger on any task touching this repo: a feature, a bug, a migration, a review, or a question about how something works.
---

# OneCare: where things are

Read this before grepping. It exists so a session does not spend twenty tool
calls learning what the last one already knew.

Scale: 165 migrations, 45 SQL suites, 83 pages, 88 hooks, 40 edge functions.
Stack: Vite + React + TypeScript + Tailwind + shadcn, Supabase (Postgres, RLS,
Deno edge functions), TanStack Query.

## The access model in one paragraph

A patient owns their record. They open access by creating a **`provider_shares`**
row (one clinician) or a **`practice_shares`** row (a whole institution), each
carrying a `permissions` JSON of category flags. Every RLS policy that lets
somebody else read a patient's data goes through one of two helpers:
`clinician_has_patient_permission(user_id, key)` or
`institution_has_patient_permission(user_id, key)`. Both check the share is
active, unexpired and unsuspended **at the moment of the call**. Permission
keys are resolved by `share_grants(permissions, key)`, which is where
whole-vault and share-all shorthands are expanded — never read the JSON
directly.

Staff access inside an institution is separate: `practice_members` with
`is_practice_member(practice_id)` and `can_manage_practice(practice_id)`, and
`practice_role_is_clinical()` (mirrored in TS as `isClinicalRole` in
`src/lib/staff-roles.ts` — change both).

## Tables worth knowing

| Table | Holds |
|---|---|
| `profiles` | The person. Also `onboarded_via_practice_id` — the revenue attribution, first institution wins |
| `medications` | Name, dose, frequency, `source` (provenance; non-manual is not the patient's to edit), `stopped_by` / `stopped_reported_at` |
| `vitals` | Readings. `source`, `recorded_by_user_id` |
| `schedule_entries` | Doses due and their status — the adherence record |
| `health_documents` | The Vault. `archived_at` (patient put it away), retraction is separate |
| `encounters`, `clinician_guidance`, `internal_notes` | The clinician's account of care |
| `record_change_proposals` | A clinician suggests, the patient accepts |
| `provider_shares`, `practice_shares` | Consent. Revoking is immediate |
| `hipaa_audit_logs` | Who did what to whose record. Written by triggers, never by the client |
| `clinician_patient_records` | Staging for a record the patient has not claimed yet |

Views: `medications_with_status`, `my_retracted_documents`.

## Where the logic lives

- `src/lib/` — pure functions, the easiest place to test. `ai-actions.ts`
  (patient assistant's writes), `clinician-ai-actions.ts`, `patient-risk.ts`,
  `staff-roles.ts`, `search.ts`, `share-permissions.ts`.
- `src/hooks/` — one per resource, TanStack Query. Guards that produce a
  *message* live here; guards that produce *enforcement* live in RLS.
- `supabase/functions/_shared/` — code shared by edge functions.
  `medication-knowledge.ts` is the drug reference; `notification-catalogue.ts`
  is the only list of notification categories that have a real producer.
- `docs/` — `record-corrections-plan.md`, `agreed-not-yet-built.md`,
  `test-strategy.md`, `handbook/`, and `guide/` (which is the public /guide
  page's content, imported at build time).

## Verification — the four commands

```
npm run typecheck        # NOT `npx tsc --noEmit`, which is a no-op here
npx vitest run
./scripts/db-test.sh     # replays all migrations, runs every SQL suite
npm run build
```

`./scripts/db-test.sh <name>` runs one suite. It needs Postgres:
`su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pgtest/pgdata -l /tmp/pgtest/pg.log start"`.
Container restarts kill it; two migrations never replay (pg_cron,
realtime.topic) and that is expected.

Never `pkill` — it kills the shell.

## Where to look first, by question

- *Can this actor read this?* — `pg_policies` in the replayed test database
  beats reading migrations. `psql -d onecare_test -tAc "SELECT policyname, qual
  FROM pg_policies WHERE tablename='x'"`.
- *Is this feature actually wired?* — the `empty-promise-audit` skill.
- *Where does this permission key get honoured?* — `share_grants`, then the two
  helpers, then the policies that call them.
- *Why did my write do nothing?* — `supabase-guardrails`. Almost always a
  zero-row update or a policy that was never there.
- *What did we already decide about this?* — `docs/agreed-not-yet-built.md`
  before proposing anything in the correction, sharing or Vault space.

## Working style that fits this project

The person you are working with reviews closely and pushes back on premises,
not just on code. That is the most valuable signal in the session — when they
question something, check it in the code before defending it. Several real bugs
in this repo were found exactly that way.

They want plain language. Restate a table as prose if it did not read clearly.
Avoid borrowed jargon: it is a **remnant**, not a tombstone. No emoji.

State disagreement plainly and once, with the reason, then follow the decision.
