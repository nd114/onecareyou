# Operations runbook

For whoever is on call. Keep answers short and reversible.

## 1. Environments

- **Preview** — the working build; used for QA sweeps and Playwright checks.
- **Production** — `onecare.you` / `www.onecare.you`. Publishing is a deliberate action after a
  milestone, never mid-refactor.
- Backend (database, auth, storage, functions) is Lovable Cloud. There is no separate self-hosted
  server; do not add backend processes to the repo.

## 2. Deploy checklist

1. Typecheck and tests pass (`bunx vitest run`).
2. Migrations reviewed: every new public table has grants, RLS and policies.
3. Edge functions redeployed if their code changed.
4. Sanity pass on the affected surface at mobile width.
5. Publish, then confirm the affected route on production.

## 3. Frequent failure modes

| Symptom | Likely cause | First action |
| --- | --- | --- |
| Table reads fail with a permission error | missing `GRANT` on a new public table | run the grant from the error's HINT |
| Clinician sees "Unknown Patient" | identity read not going through `get_patient_identity` | fix the hook, do not widen RLS |
| Patient list empty for an institution clinician | patient shared with the institution but not assigned | assign on Practice → institution patients |
| Edge function 401 | caller not validated / wrong gate | check `_shared/auth.ts` usage for that function |
| Invitation email not received | Resend key missing or address bounced | check function logs; re-send from the console |
| Dates off by one day | raw `new Date('yyyy-mm-dd')` somewhere | route through `src/lib/date-only.ts` |
| Stale UI after an approved AI action | missing query invalidation | invalidate the affected query keys |
| Offline writes not appearing | IndexedDB queue not drained | check the offline banner and `src/lib/offline/queue.ts` |

## 4. Incident handling

1. **Contain** — if patient data could be exposed, revoke the path first (disable the policy, function
   or route), then investigate.
2. **Record** — note time, surface, affected users. Access to PHI is already logged in
   `access_audit_logs` / `hipaa_audit_logs`; pull the relevant window.
3. **Fix forward** — migrations only; never edit data by hand without a written note in the incident
   log.
4. **Notify** — for any confirmed PHI exposure, follow the breach clauses in the BAA. Affected
   institutions are told before anything is published.
5. **Close** — add a regression test or scanner rule so the same class cannot recur.

## 5. Scheduled jobs

`scheduled-ehr-sync`, `check-vital-alerts` and `check-care-alerts` run on pg_cron and authenticate
with the `x-cron-secret` header validated against `cron_auth`. If they stop firing, verify the secret
row exists before touching the functions.

## 6. Secrets

Managed through the platform secret store; never committed and never logged. Currently in use:
Resend (transactional email), Stripe, Cal.com, Notion (bug sync), ElevenLabs (voice), AI gateway.
Service-role keys and the database password are not retrievable — if something needs them, it needs to
run as an edge function instead.

## 7. Backups and durability

Multi-zone replication with point-in-time recovery, a weekly independent export, and documented
restore drills. Restore drills are recorded in the compliance pack so institutions can see the date of
the last successful test.

## 8. Demo and beta accounts

Demo patient/clinician accounts are reset by the `reset-demo-accounts` function (internal callers
only) and seeded by `seed-demo-data`. Beta testers are gated by NDA signature before a booking is
confirmed; bookings run through Cal.com and bug reports sync to Notion.
