# Command centres plan — the founder console and the hospital admin console

> Rooted in [OneCare's foundational pillars](../onecare-foundations.md): pillar 1 (no back door, no
> break-glass), pillar 6 (the institution is custodian), pillar 8 (we provide capability, not
> arbitration), pillar 9 (we do not verify clinicians).

Status: proposal, 3 October 2026. Read-only review of the code at this date; nothing built.

## 0. The short answer

1. The founder console is **further along than the brief assumes.** `/admin` already has seven
   working sections (Today, Accounts, Revenue, Reliability, Trust, plus Workshop and tools) and ~35
   `admin_*` SQL functions, all `has_role(admin)`-gated and returning counts, never PHI. What it
   lacks is mostly **metering, a few lifecycle actions, and operator-of-a-regulated-service duties**
   (data-subject requests, breach checklist, kill-switches) — not more dashboards.
2. The hospital admin console **does not exist as a console.** Tenant admin is one 707-line page
   (`/practice`, `PracticeAdmin.tsx`) bolted to the clinician app, plus offboarding and handover
   pieces. Recommendation: build **one shell at `/org`**, capability-gated by tier, separate from
   the clinician workspace for hospitals and a lite subset for practices. Move existing pieces in;
   do not rebuild them.
3. The role model is the real prerequisite: **`has_practice_capability` is advisory today** (no RLS
   policy calls it; see hospital-groups-plan §2.3). An IT-admin or auditor role is only honest once
   the database, not the screen, enforces it. That is Phase 0 for Part 2.
4. Do not build network monitoring, a SIEM, a ticketing system, a BI tool, or staff impersonation.

---

## Part 1 — Founder command centre

### 1.1 Inventory (what exists)

| Area | Where | What it does today | PHI? |
| --- | --- | --- | --- |
| Shell + vitals rail | `AdminShell.tsx`, `useAdminToday` | Left rail; four always-on readouts (needs you, failures 24h, new accounts 24h, assistant 24h); `admin_live_pulse`, `admin_movement_metrics`, `admin_metric_series` | No |
| Today / attention queue | `AdminOverviewPanel`, `AdminAttentionQueue`, `AdminDigestCard`; `admin_attention_queue`, `admin_digest_snapshot`, `send-admin-digest` fn, `admin_attention_dismissals`, `admin_digest_preferences` | Ranked "needs you" list, dismissals, emailed digest | No |
| Tenants | `AdminTenantsCard`, `AdminTenantDetail` (`/admin/tenants/:id`), `CreateTenantDialog`, `AdminTenantRowActions`, branding + contact cards; `admin_create_tenant`, `admin_update_tenant`, `admin_tenant_overview/detail/members`, `admin_set_tenant_branding/contact`, `admin_invite_tenant_owner`, `admin_list/cancel_tenant_invitations`, `set_practice_suspension` | Create tenant, invite owner, suspend, edit branding/contact, see team/patients/storage/rev-share | No |
| Accounts | `AdminAccountsPanel`; `admin_accounts_directory`, `admin_account_detail` | One directory of tenants/clinicians/patients; name, email, activity counts; search floor (no browse without a term, mig. `20261006`) | Identity only |
| Revenue | `AdminRevenuePanel`, `useAdminRevenue`; `admin_revenue_overview`, `admin_revenue_tenants`, `admin_extend_trial` | Tier counts, owed/at-risk, lapsing trials, per-tenant billing row, extend trial | No |
| Reliability | `AdminReliabilityPanel`; `admin_reliability_overview`, `admin_sync_failures`, `admin_requeue_ehr_exports`, `system-health` fn | 24h/7d failures by kind from DB-visible signals (EHR sync, snapshot jobs, alerts, KingsChat logins); requeue | No |
| Trust | `AdminTrustPanel`; `admin_trust_overview`, `admin_access_log_search`, `admin_audit_export`, `admin_recent_actions`, `admin_revoke_patient_share` | Consent/share shape (existence, never content), platform-wide access-log search and export (details column withheld), admin action trail | No |
| Admin access | `AdminAccessPanel`; `admin_list_platform_admins`, `admin_grant/revoke_platform_admin`, `admin_access_reviews` | Who is a platform admin, grant/revoke, access review | No |
| Support intake | `AdminBugReportsPanel`, `AdminApplications` (careers), `beta_bug_reports`, `contact_submissions`, `enterprise_inquiries`, `notify-*` fns, `sync-bug-to-notion` | Bug triage; job applications; contact/enterprise emails are **sent**, but there is no queue UI for them | No |
| Content / tools | Workshop, Careers, Changelog, Docs, Import, Demo data (`AdminDemoDataCard`, `reset-demo-accounts`, `seed-demo-*`) | Operational tooling | Demo only |
| Flags | `_shared/features.ts` (+ `src/lib/features.ts`) | Code constants (e.g. `CAREGIVERS_ENABLED=false`); change = deploy | n/a |
| Tests | `supabase/tests/admin_command_centre.test.sql` | Refusal of non-admins asserted | n/a |

Design rule already honoured and to be kept: the console says plainly it reports what the database
can see; it never returns `details` columns or any clinical row.

### 1.2 Gaps, ranked

Value = risk reduced or founder time saved. Effort: S < 1 day, M 2-4 days, L 1-2 weeks. **Mig** = needs a migration.

| # | Gap | Why a regulated-health operator needs it | Value | Effort | Mig |
| --- | --- | --- | --- | --- | --- |
| 1 | **Data-subject / deletion request queue** (patient asks to export/close/delete; institution-controlled records route to the institution per pillar 7). Table `data_requests` (subject, kind, status, due_at, handled_by); admin list + due-date clock (30 days GDPR / 30 HIPAA access) | Statutory clocks; today requests would live in email | High | M | Yes |
| 2 | **Breach-response checklist + incident log** (`incidents`: detected_at, scope = tenants affected as counts, notified_at, regulator_notified, status). Pre-filled steps: contain, scope via audit log, notify controllers (hospitals) within contract window, regulators, patients. Controller notification matters most because OneCare is processor for hospital records | A breach with no rehearsed process is the single worst day. Metadata only | High | S-M | Yes |
| 3 | **Usage metering per tenant**: scribe minutes (`clinician_dictations`/encounter-scribe), AI messages (`ai_messages` exists), storage (`storage_ledger` exists), seats (members count). A nightly `tenant_usage_daily` rollup + admin view + cost estimate (price constants in code, like revenue) | Pricing, abuse, and margin are blind without it; scribe/AI is the main variable cost | High | M | Yes |
| 4 | **Platform-admin hygiene**: enforce MFA for `admin` role (check AAL2 in `has_role`-gated RPC wrapper), second-admin approval for grant/revoke and for suspending a tenant, quarterly access review reminder (`admin_access_reviews` exists; add a due date and sign-off row). Every admin RPC writes `admin_recent_actions` (verify none skip it) | Staff are the largest insider risk; auditors ask first | High | S-M | Small |
| 5 | **Lead / inbox queue**: `contact_submissions`, `enterprise_inquiries`, `beta_testers` as one triage list with status (new/replied/won/lost) | Enterprise leads are the revenue; today emailed and forgotten | High | S | Add `status`, `handled_at` columns |
| 6 | **Tenant lifecycle completion**: plan change and seat limits (in `admin_update_tenant`?), **offboard tenant** (suspend -> export window -> retention hold -> purge schedule, never silent delete), reactivation, trial-ending automation | Today: create, invite, suspend, extend trial. Missing the end of the lifecycle, which is where regulated data obligations live | High | M-L | Yes |
| 7 | **Runtime kill-switches** (`platform_flags` table, read by edge fns + client): scribe off, AI off, outbound email/SMS off, per-tenant override. Keep `features.ts` for roadmap-paused features; use DB flags only for *emergency stops* | Today stopping a misbehaving integration needs a deploy | High | M | Yes |
| 8 | **Edge function and delivery health**: failures logged by a thin wrapper (`fn_runs`: name, ok, ms, error class, **no payloads**) so Reliability can show function errors, email/SMS bounce counts, cron job last-success | Reliability sees only DB-visible signals; edge/auth logs are blind. Needed before first hospital SLA | Med-High | M | Yes |
| 9 | **Failed payments / churn signals** beyond current "owed/lapsing": dunning state per tenant (Stripe webhook already feeds subscriptions), logins-down trend per tenant (activity counts only), seats-unused | Revenue early warning | Med | S-M | Maybe |
| 10 | **Share/consent anomaly view**: spikes in revocations, bulk share creation, one clinician reading many patients, reads after revocation attempts. Counts and ids only | Detects the P0-class bugs the Sept audit found, in production | Med | M | Optional (view) |
| 11 | **Announcements / status banner** (`platform_notices`: audience, message, expires). Changelog already exists | Planned maintenance, incident comms | Med | S | Yes |
| 12 | **Failed-login / auth anomalies**: needs Supabase auth log export; DB sees only KingsChat attempts. Treat as an integration (pull via management API on a schedule), not a build-from-scratch | Credential stuffing signal | Med | M | Yes |
| 13 | **Abuse / reports queue** (patient reports a clinician/record, clinician reports a misfiled record). Record corrections plan already covers retraction; this is intake only. Cross-check before building: may duplicate `beta_bug_reports` | Pillar 8: we record, we do not arbitrate; intake is still required | Low-Med | S-M | Yes |
| 14 | **Support: tenant-consented read-only diagnostics** (see 1.4) | Replaces impersonation | Med | M | Yes |

### 1.3 Stances (decisions already made by the pillars; the console must embody them)

- **No break-glass, no impersonation, no "view as user".** A platform admin sees identity,
  counts, timestamps, status and error classes. Never a vital, medication, document, note,
  message or audit `details`. Every new `admin_*` function gets the existing refusal test **plus** a
  shape test ("returns no column outside this allow-list").
- **Clinician verification:** the console does not run a verification queue. OneCare states it does
  not verify (pillar 9). Do not add a "verified" toggle, a licence field or a review queue; if ever
  revisited it is a roadmap item, not a console tab.
- **Small cells:** any per-tenant aggregate that could name a person (a tenant with 2 patients) is
  shown as "<5", same rule as the groups plan §4.3.

### 1.4 Safe support alternatives to impersonation

1. **Diagnostic bundle, generated by the tenant admin**: a button in the hospital console
   ("Create support bundle") that produces a time-boxed (72h), read-only metadata page: tenant
   config, member roles, integration status, last 50 error classes, versions. No patient rows.
   The tenant admin shares the link; the founder sees only that.
2. **Reproduce with demo data**: `seed-demo-hospital` exists; support reproduces in the demo tenant.
3. **Screen-share where the customer drives.**
4. If a real record must be looked at, the **patient or institution** shares it with a named
   support clinician account through the normal share path, with the normal audit. No staff exception.

### 1.5 Do NOT build

Impersonation / "log in as"; a general SQL or table browser; any PHI search; a custom APM or log
store (use the platform's logs plus the `fn_runs` summary table); a CRM (use Apollo/Notion, which
are already connected, and keep only the lead status list); a feature-flag product with
percentage rollouts; a clinician credential-verification queue; real-time dashboards beyond the
existing pulse; per-user product analytics of in-app clinical behaviour.

### 1.6 Founder-console phased plan

**Phase F1 (about 1 week, highest value / lowest effort)**
- #5 Leads queue: migration adding `status`, `handled_at`, `handled_by` to `contact_submissions`
  and `enterprise_inquiries`; `admin_inbox()` + `admin_set_inbox_status()`; one new `AdminInboxPanel`
  under Accounts or a new "Inbox" rail item.
- #4 Admin hygiene: MFA (AAL2) required inside the admin gate; `admin_access_reviews` gets a sign-off
  table and a "review overdue" attention-queue item. Audit that every mutating `admin_*` writes
  `admin_recent_actions`.
- #2 Incident log + breach checklist (table, one panel under Trust, static checklist copy).
- #11 Platform notice banner (small).

**Phase F2 (about 2 weeks)**
- #3 Usage metering: `tenant_usage_daily` + nightly job; Revenue gets a usage column and margin
  estimate; scribe/AI minutes and storage per tenant; seat counts.
- #1 Data-request queue with due dates (and wire patient "export / close my account" to create a row).
- #8 `fn_runs` wrapper in `_shared/` adopted by the 5 most important functions first
  (`check-care-alerts`, `care-record-snapshots`, `encounter-scribe`, `ehr-sync`, notify fns).

**Phase F3 (about 2 weeks)**
- #6 Tenant offboarding lifecycle and plan/seat changes.
- #7 `platform_flags` kill-switches (read helper in `_shared/features.ts`, checked in edge fns).
- #10 anomaly view; #9 dunning/churn; #12 auth-log pull; #14 support bundle (needs Part 2 shell).

Everything with a migration follows the supabase-guardrails skill and gets a SQL test that
fails when the rule is broken (pillar 11).

---

## Part 2 — Hospital (tenant) admin console

### 2.1 Inventory (what a tenant admin has today)

| Capability | Where | Notes |
| --- | --- | --- |
| Team / roles / invitations | `/practice` "Clinicians and staff" (`practice_members`, `practice_invitations`, `change_practice_member_access`, `end_practice_membership`, `practice_staff_overview`, `practice_member_directory`) | Roles: owner, admin, provider, clinician, nurse, front_desk, billing, read_only |
| Administrative accounts | `/practice` card | Owner/admin listing |
| Departments | `practice_departments`, `practice_department_members`, `practice_patient_departments`, `practice_delete_department` | Working example of a scoped membership |
| Patients, sharing and assignment | "Patients" card; `practice_patient_overview`, `assign_practice_patient`, `practice_patient_assignments` | Admin assigns hospital-shared patients |
| Routings to review | card; `practice_tasks`, `practice_pending_affiliations`, `set_practice_affiliation_status` | Routing/affiliation oversight |
| Offboarding + handover | `offboarding_impact`, `practice_handover_queue`, `tell_patient_of_handover`, `resolve_departed_draft`, `useOffboarding`, `src/lib/offboarding.ts`; plan `clinician-offboarding.md` | Shipped Oct 2026 (migration `20261010070000`) |
| Activity / audit log | "Activity log" card; `practice_audit_log` | Search; CSV export exists on the clinician `ClinicianAudit` page, not on the admin card |
| Branding, code, contact | `set_institution_slug`, `practice_set_name`, `practice_set_contact`, `practice_contact_details`; branding via platform admin only | |
| Storage, rev-share | `get_practice_storage_bytes`, `practice_revenue_share_summary` | Read-only |
| Billing / plan | `Billing.tsx`, `ClinicianPricing`, `ClinicianInvoices`, `create-clinician-checkout`, `customer-portal`, `check-clinician-subscription` | Lives in the clinician app |
| EHR / FHIR integration | `manage_ehr` capability, `ehr-sync`, `scheduled-ehr-sync`, `ehr-webhook`, `ehr-export`, `ehr_sync_logs` | Per-clinician settings pages, no tenant health view |
| Compliance docs | `ClinicianBAA`, `ClinicianCompliance` | Pages |
| Security policy (MFA enforcement, session timeout, IP allowlist), SSO/SCIM, API keys, retention settings, SIEM streaming | **Nothing** | Phase E in tenancy plan covers SSO only |
| Capability matrix editor | **Nothing** (`practice_role_permissions` table, no UI, mostly unenforced) | See hospital-groups-plan §2.3 |

### 2.2 Opinion: separate shell, one codebase, capability-gated

**Yes to a separate admin console for hospitals. No separate console for small practices; give
them the same shell with fewer sections.** Reasons:

- A hospital admin or IT lead has a different job (govern, audit, provision, pay) from a clinician
  (treat). Mixing them is why `/practice` is a 700-line page inside a clinical app. Separation
  also lets us give an IT person access that **contains no clinical route at all**.
- A single operator running a three-person practice is the same human as the clinician and will not
  want two apps. So: one shell, **`/org`**, gated by "holds an admin-class membership", and sections
  appear by **capability and tenant tier**, not by a second codebase. A practice's `/org` shows
  Team, Billing, Activity, Offboarding; a hospital's adds Departments, Integrations, Security,
  Access reviews, Audit export, API/SIEM.
- Reuse the founder `AdminShell` pattern (rail + vitals strip + collapsible), re-skinned with the
  tenant brand accent only on the sign-in front door (existing decision: no post-login branding).
- The clinician app keeps one link, "Organisation admin", visible to admin-class members; the old
  `/practice` route redirects to `/org/team`. Hospital groups later add a `/group` shell on the same
  pattern (groups plan §4.3: aggregates only).

Vitals rail for `/org`: needs-attention count (handover queue + pending invites + routings to
review), seats used/limit, storage used/limit, integration failures 24h.

### 2.3 Role model implications

Today: owner, admin, provider, clinician, nurse, front_desk, billing, read_only. Hard-coded
`practice_role_is_clinical(role)` decides clinical read access.

Proposed additions (non-clinical by construction: not in the clinical list, so
`institution_has_*` never matches them):

| Role | Sees | Never sees |
| --- | --- | --- |
| **owner** | Everything in `/org`; transfer ownership; delete tenant request | Patient records unless also holds a clinical membership with assignment/share |
| **admin** | Team, departments, assignment, offboarding, audit, settings | same |
| **it_admin** (new) | Integrations, API keys, SSO/SCIM, security policy, log streaming, system status, member provisioning | Patient names/records, audit `details`, assignment lists; member email only |
| **billing_admin** (rename/split of `billing`) | Plan, seats, invoices, usage, payment method | Everything else |
| **auditor** (new, read-only) | Audit log, access reviews, export, role/permission history, consent-event counts | Patient content; cannot change anything |
| clinical roles | unchanged | admin console except what their capabilities grant |

Rules: (1) **No role gains PHI by being administrative.** An owner who must see a patient holds a
clinical membership (separate, visible, audited), as the groups plan already specifies for group
officials. (2) The console reads **aggregate and metadata functions only**; audit `details` is
withheld exactly as in the founder console, and the tenant-admin audit view shows who/when/action
and patient *pseudonym or id only if the viewer is a clinical member*. (3) The IT-admin's patient
count is a number, never a list. (4) **Prerequisite:** make capabilities enforced. Add `is_org_admin_class()`
and have every `/org` RPC check `has_practice_capability(uid, cap, practice_id)` with the explicit
practice (drop the two-argument form), and add a test per capability proving the database refuses.
(5) At most one `owner` removal at a time; ownership transfer needs the second owner or the
founder (support-assisted) — never a silent last-owner loss.

### 2.4 Scope tiers and gaps (ranked within tier)

**Tier A — everyone with an admin** (practices get a subset)

| # | Section | Exists? | Effort | Mig |
| --- | --- | --- | --- | --- |
| A1 | Team and roles (members, invitations, role change, departments) | Yes, move in | S (relocate) | No |
| A2 | Offboarding and handover queue (as a top-level section with count badge) | Yes | S | No |
| A3 | Sharing and routing overview (connected patients, assignment coverage, unassigned count, routings to review; counts only) | Mostly | S-M | No |
| A4 | Audit trail with filters **and CSV export** from the admin card; read-only auditor can use it | Search yes, export no | S | Maybe `practice_audit_export()` |
| A5 | Seats and usage (members vs seat limit, storage, scribe minutes, AI use for this tenant) | Storage only | M (reuses founder metering F2) | Yes (seat limit, usage rollup) |
| A6 | Billing and plan (move from clinician Billing/Invoices; billing_admin) | Exists elsewhere | S-M | No |
| A7 | Security policies: **MFA required for all staff, session idle timeout, domain-restriction of invitations** | No | M | Yes (`practice_security_settings`, enforced in invite/accept and client session) |
| A8 | Notification settings (who gets handover, deletion batch, integration-failure emails) | No | S | Yes |
| A9 | Data retention settings: **show** the institution's chosen period and export/deletion windows; per pillar 8 the institution decides, OneCare stores and exports | No | S-M | Yes (setting + banner only; no auto-purge until legal confirms) |
| A10 | Capability matrix editor for roles | No | M | No (table exists; needs enforcement first) |

**Tier B — IT-team extras (hospital tier only)**

| # | Section | Effort | Mig |
| --- | --- | --- | --- |
| B1 | Integration health: FHIR/EHR sync last success, failure counts, webhook status, per tenant (reuses `ehr_sync_logs`, `admin_sync_failures` pattern) | M | Yes (tenant-scoped RPC) |
| B2 | API keys / service accounts with scopes and rotation (scoped to *imports and sync*, never patient reads) | L | Yes |
| B3 | Audit-log streaming to SIEM: **webhook (signed, retried) first; syslog later**; also scheduled export to the customer's bucket | L | Yes (`audit_sinks`, delivery log) + edge fn |
| B4 | SSO (SAML/OIDC) status and config; SCIM provisioning (users and department membership; **never roles above clinician without admin approval**) | L (SSO via Supabase auth if plan allows; SCIM is separate) | Yes |
| B5 | IP allowlist for the admin console and API only (not for patient/clinician sign-in, which must work from clinics and phones) | M | Yes |
| B6 | Status page link and incident notices (reuse founder `platform_notices` #11) | S | Shared |
| B7 | Support bundle (section 1.4) | M | Yes |

**Tier C — do NOT build**
Network traffic or endpoint monitoring, device inventory, DLP, packet/flow analysis, a SIEM or
dashboards of our own, a ticketing/helpdesk, user-behaviour analytics ("who clicked what"), a
patient-record search for admins, bulk data pulls beyond the normal export, and a custom
reporting/BI builder. For anything in this family: **export or stream the events (B3) and let their
tooling do it.** Offer a documented event catalogue instead of UI.

### 2.5 Information architecture of `/org`

Rail (sections shown by tier and capability; practice subset marked P):

1. **Overview** (P) — vitals strip, needs-attention list, last 7 days of activity counts.
2. **People** (P) — Members and roles, Invitations, Departments, Pending affiliations.
3. **Patients and sharing** (P) — Connected patients (counts), Assignment, Routings to review.
4. **Handover** (P) — Offboarding and handover queue, departed-staff drafts.
5. **Audit** (P) — Activity log, Export, Access reviews (hospital), Consent events (counts).
6. **Plan and usage** (P) — Plan, Seats, Storage, Scribe/AI usage, Invoices and payment method.
7. **Security** — MFA, session timeout, invitation domain rules, retention display, notifications (P: reduced).
8. **Integrations** (hospital) — EHR/FHIR health, API keys, Webhooks, SSO/SCIM, Log streaming, IP allowlist.
9. **Organisation** (P) — Name, hospital code, contact, branding view, public profile (hospital-profiles-plan), Support bundle.

### 2.6 Moving existing pieces in

| Piece | Move |
| --- | --- |
| `PracticeAdmin.tsx` cards: Staff, Patients, Routings, Admin accounts, Activity log | Split into `/org/people`, `/org/patients`, `/org/audit` panels; keep RPCs untouched; redirect `/practice` |
| `useOffboarding`, `offboarding_impact`, `practice_handover_queue` | Become the Handover section; add a count badge fed by the queue |
| Departments | Into People; unchanged |
| `ClinicianInvoices`, Billing, Pricing, checkout/portal | Billing section for billing_admin; clinician app keeps only the personal plan |
| `ClinicianCompliance` / BAA | Security section, linked |
| `AdminTenantDetail` (founder view of a tenant) | Stays; shares the same read RPCs, so founder and tenant see one set of numbers |
| `AdminShell` | Extract generic `ConsoleShell` (rail, vitals, collapse) used by `/admin`, `/org`, later `/group` |

### 2.7 Hospital-console phased plan

**Phase H0 (prerequisite, about 1 week):** enforce capabilities in the database
(`has_practice_capability` with explicit practice in every `/org` RPC; remove the two-argument
form; tests); add roles `it_admin`, `auditor`, `billing_admin` (enum/constraint migration, mark
non-clinical in `practice_role_is_clinical`, tests that each is refused every clinical read).

**Phase H1 (about 2 weeks, buildable now):** extract `ConsoleShell`; create `/org` with Overview,
People, Patients and sharing, Handover, Audit (with CSV export and auditor access), Organisation;
redirect `/practice`. Mostly relocation of existing components; migrations are the roles from H0 and
`practice_audit_export`. Link from the clinician app for admin-class members only.

**Phase H2 (about 2-3 weeks):** Plan and usage (reuses founder metering F2: `tenant_usage_daily`,
seat limit column), Security settings (MFA enforcement, idle timeout, invitation domain rule),
notification settings, retention display, capability-matrix editor (now safe), support bundle.

**Phase H3 (hospital contracts drive timing):** B1 integration health, B3 audit streaming
(signed webhook first), B4 SSO then SCIM, B5 IP allowlist, B2 API keys. Do not start until a
signed hospital asks; each is 1-3 weeks. SSO plus audit export are what procurement questionnaires
ask first.

---

## Decisions the founder must make

1. **Shell:** approve one `/org` shell, tier-gated, replacing `/practice` (recommended), versus a tab in the clinician app.
2. **New roles:** approve `it_admin`, `auditor`, `billing_admin` as non-clinical; confirm owner never gets PHI by role.
3. **Capability enforcement first (H0)** before any configurable roles or group layer — accept the delay.
4. **Platform-admin controls:** require MFA and two-person approval for tenant suspension and admin grants? (Recommended yes; you are currently a single point of failure and trust.)
5. **Data-request SLA and owner:** who answers deletion/export requests, and what do we promise (30 days). Needs counsel on the processor/controller split.
6. **Tenant offboarding retention:** how long after contract end do we hold a hospital's data before purge (recommend 90 days read-only export window, then institution-confirmed purge, never silent).
7. **Metering prices:** confirm scribe-minute and AI cost-to-serve tracking will drive tiers/overage, and whether overage is billed or just capped.
8. **Kill-switch authority:** who may flip a platform flag (recommend any one admin to turn OFF, two to turn ON).
9. **Which Tier B items are contractual promises** for the first hospital (SSO? audit streaming?), so we build to a signed need, not a questionnaire wish.
10. **Support model:** confirm impersonation is permanently off the table and tenant-generated support bundles are the alternative.
11. **Practice lite:** confirm practices get Team, Billing, Audit, Handover only, and that security policies are hospital-only.

## Risks and cautions

- Every new `/org` or `admin_*` function must be tested for non-admin refusal, **and** for column allow-list shape; pillar 11 requires seeing each test fail when the rule is broken.
- Group admins (later) reuse `/org` patterns; do not hard-code single-tenant assumptions (use explicit practice ids; groups plan §3.2 lists existing hard-coding).
- Nothing in either console should promise a capability that does not exist (pillar 3): hide retention "auto-delete" and "SSO" cards until built, rather than showing disabled ones.
