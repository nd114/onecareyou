# Founder Command Center

Turn `/admin` from a tenant list with tabs into the one screen you open every morning: what changed, what needs you, and one click to act on it. Built in four phases.

## The shape

Six areas replace today's six tabs:

```text
Today          growth + health + attention queue, all on one screen
Accounts       tenants, patients, clinicians — one searchable people/org directory
Revenue        subscriptions, storage packs, invoices, trials, churn risk
Reliability    function failures, sync errors, AI spend, slow queries, incidents
Trust          audit search, consent state, access reviews, security findings
Workshop       careers, changelog, docs, imports, demo seeding
```

Every card is actionable: suspend a tenant, raise an allowance, grant a platform admin, resolve an incident, reply to a contact submission, cancel an invitation, revoke access — from the card, with confirmation and an audit entry.

## Phase 1 — Today

The founder home. Replaces the current Overview tab.

- **Attention queue** at the top: things with your name on them. Tenants over 90% storage, pending owner invitations older than 7 days, unanswered contact submissions and bug reports, failed background jobs, tenants on trial past day 14, tenants with zero members after 14 days. Each row has its action and a dismiss.
- **Movement strip**: signups, activated accounts, connected patients, new tenants, documents stored, AI conversations — each with a 7-day and 30-day change and a sparkline, not just a raw count.
- **Live pulse**: last 24h function errors, sync failures, sign-in failures, AI spend.
- Date-range control (24h / 7d / 30d / 90d) that drives the whole page.

## Phase 2 — Revenue and Accounts

- **Revenue**: paying tenants and patients by tier, monthly recurring revenue, trials with days remaining, storage packs sold, unpaid invoices, revenue-share obligations, cancellations with reason where known. Actions: open a tenant, extend a trial, adjust allowance, mark an invoice.
- **Accounts**: one directory across tenants, clinicians and patients with server-side search and pagination. Row opens a profile drawer — role, tenant, connections, storage, last seen, audit trail — with suspend/restore, role grant/revoke, and resend-invitation actions.

## Phase 3 — Reliability and Trust

- **Reliability**: edge function failure counts and last error per function, EHR sync failures per connection, queue backlogs, AI request volume and cost, slow queries, sign-in throttle events. Actions: retry a sync, requeue an export, acknowledge an incident.
- **Trust**: cross-tenant audit search (already exists, extended with export and richer filters), consent state per patient, access reviews of who can see whom, open security findings, legal acceptance coverage. Actions: revoke a share, force an access review, export an audit range.

## Phase 4 — Daily digest email

One email each morning to platform admins: yesterday's movement, the current attention queue, anything that broke, revenue changes. Sent through the existing app-email infrastructure, with a link straight into the relevant Today card. Configurable send hour, and one-click off.

## Technical notes

- Metrics come from new admin-only `SECURITY DEFINER` RPCs (`admin_growth_metrics`, `admin_revenue_overview`, `admin_reliability_overview`, `admin_attention_queue`) that aggregate server-side and return small result sets — no client-side scanning of `profiles`, `provider_shares` or `health_documents`. Each verifies `has_role(auth.uid(), 'admin')` and is granted to `authenticated` only.
- A `platform_metric_daily` rollup table (date, metric key, value) written by a nightly cron job gives real trend lines without repeatedly aggregating history; today's row is computed live.
- Reliability numbers come from a new `admin-platform-health` edge function that reads the analytics log sources (function edge logs, auth logs, postgres logs) with the service role and returns aggregates. The existing `system-health` function is folded into it.
- Attention items are derived, not stored, except dismissals, which go in a small `admin_attention_dismissals` table keyed by item signature and admin.
- Every write action keeps going through `log_platform_admin_action`, so the console's own activity feed stays complete.
- Digest email adds a template in `_shared/transactional-email-templates/`, a `send-admin-digest` scheduled function, and per-admin preference rows. Requires the email domain to be verified before it will send.
- Structure: `src/pages/AdminConsole.tsx` becomes a shell with routed sections (`/admin`, `/admin/accounts`, `/admin/revenue`, `/admin/reliability`, `/admin/trust`, `/admin/workshop`) so each area is linkable and lazily loaded; `AdminHeader` links get the same six entries. Existing panels are moved, not rewritten, where they already work.
- Host gate and admin-role gate stay exactly as they are.

## Not in scope

- Personal/hospital workspace switching (already parked on the roadmap).
- Any surface that lets an admin read patient clinical content directly — the console shows counts, states and audit trails, never diagnoses or documents.
