# OneCare Roadmap

**What this is.** The single living tracker for OneCare product work: what has shipped and when, what is in flight, what is next, and what is deliberately deferred. Update this file as work lands — do not start new roadmap or tracking documents.

**Last updated:** 13 August 2026

**Companion docs** (deep dives kept separate on purpose):

- [`qhin-integration-plan.md`](./qhin-integration-plan.md) — national network records (Particle Health first)
- [`whatsapp-integration-plan.md`](./whatsapp-integration-plan.md) — messaging transport plan
- [`enterprise-hospital-tenancy-plan.md`](./enterprise-hospital-tenancy-plan.md) — hospital tenancy phases
- [`reviews/oc-lmc-review-aug-2026.md`](./reviews/oc-lmc-review-aug-2026.md) — codebase review findings and decisions
- [`ehr-integration-plan.md`](./ehr-integration-plan.md) — external EHR import, then narrow write-back
- [`wearables-plan.md`](./wearables-plan.md) — patient device connections and provenance
- [`sharing-access-consent-model.md`](./sharing-access-consent-model.md) — consent + access matrix
- [`pricing-roadmap.md`](./pricing-roadmap.md) — tiers, packs, storage economics
- [`platform-documentation.md`](./platform-documentation.md) — system reference
- [`branding.md`](./branding.md), [`caregiver-access-system.md`](./caregiver-access-system.md)
- [`beta-tester-pack.md`](./beta-tester-pack.md), [`beta-nda.md`](./beta-nda.md)
- [`funding-strategy.md`](./funding-strategy.md), [`strategy/`](./strategy)

---

## Now (in flight)

0. **OC-LMC review follow-ups — decisions taken, work landed.** See
   [`reviews/oc-lmc-review-aug-2026.md`](./reviews/oc-lmc-review-aug-2026.md). Departments and
   sub-admins, clinician whitelisting, and the full set of share categories are built. What
   remains open is listed under "Next up" and "Deferred".
1. **Mobile-first sweep (patient + clinician).** Scripted 390x844 / 768x1024 passes over every pillar and sub-tab; fix P0 broken flows first, then overlap between bottom nav, FAB stack and sticky sub-tabs, then polish.
2. **Surface budget discipline.** Every new feature must replace a surface or justify itself against the four pillars per side.

### Mobile sweep findings (13 August 2026, 390x844 + 768x1024)

| Route / surface | Severity | Symptom | Status |
| --- | --- | --- | --- |
| All audited public + admin routes | — | No horizontal overflow at either viewport | Pass |
| Patient + clinician routes as an admin | — | Correctly redirect to `/admin`; no cross-role leakage | Pass |
| `/admin` header nav | P1 | Five links did not wrap or collapse below `md`; destinations were cut off | Fixed — collapses into one labelled menu |
| `/for-clinicians` | P2 | Console error `Error checking subscription: FunctionsFetchError` | Sandbox-only (edge function unreachable locally); handled gracefully, no user-facing break |
| Authenticated patient/clinician pillars | — | Not reachable by the audit browser without a signed-in preview session | Outstanding — rerun with a signed-in preview session |



## Shipped log (newest first)

### August 2026

- **Departments and sub-admins.** A hospital's chief admin creates departments, appoints
  sub-admins to run them, and sees a roster of every clinician's departments, caseload and access
  basis alongside every patient's department and assigned clinicians. Sub-admins route and assign
  inside their own departments only — bounded in RLS and covered by 16 database assertions.
- **Clinician whitelisting, bulk onboarding and offboarding.** Approved email domains or a
  hospital-managed allowlist affiliate staff automatically; anyone else waits in pending approval
  with no access. CSV import for bulk staff. Offboarding ends hospital access immediately while
  keeping the clinician's account, their private patients and their authored history.
- **Every share category now shares something.** Conditions and allergies reach the clinician
  through a field-gated accessor, adherence follows the medications category, and allergies and
  conditions are shown on the patient record where a clinician cannot miss them.
- **Tenant hospital codes from the console.** Platform admins can set or change a tenant's hospital code after creation (same availability check as the practice-side card) and see the reserved `<code>.onecare.you` address; the wildcard DNS/cert for `*.onecare.you` remains a hosting task.
- **Enterprise cards hidden for solo practices.** The hospital code and institution-shared patient cards no longer render on the Practice page unless the tenant is a hospital (or already has a code/shares), keeping the solo clinician surface small.
- **Admin console overview + audit search.** Console opens on an Overview tab showing tenants against their storage allowance (with over-90% warnings) and the newest accounts; a new Audit tab searches the platform-wide access log by action, clinician email or patient email, paginated and read-only. Both are admin-gated security-definer lookups.

- **Admin header on small screens.** The console navigation collapses into a single labelled menu below `md`, so no destination is cut off on phones.
- **Dedicated admin experience.** Platform admins are routed to `/admin` and never see patient pillars; admin console has its own header/shell (Console · Careers · Docs · Changelog · Import), and the patient bottom nav is suppressed for admins.
- **Platform admin operations.** Tenant create/edit (type, location, tier, storage allowance, revenue share, hospital code), tenant-owner invitations with email delivery and in-app acceptance on the Practice page, platform-admin delegation by email with last-admin protection, and an admin action log — all through admin-gated security-definer functions.
- **Internal documentation.** Five-part handbook (patient, clinician, admin, data model, operations runbook) plus architecture reference, readable in-app at `/admin/docs`.
- **Admin discoverability.** Admin entry in the signed-in account menu; admins land on the console after sign-in.


### July–August 2026

- **Enterprise hospital tenancy (Phases A–D).** `practices` tenancy fields, hospital codes (slug) with availability checks, `practice_shares` institutional consent, patient-level assignment, revenue-share card, pooled storage card, granular patient share picker, `/admin` tenant overview.
- **Storage metering.** `storage_ledger` with sync triggers, per-tenant and per-user usage, tier quotas (Trial 2GB → Enterprise 1TB), usage cards.
- **Managed patient records.** Manual chart entry with dedup, CSV import, visits/vitals/medications chart, clinical summary printout.
- **Care record snapshots.** Immutable, watermarked records of clinician messages/guidance auto-filed to the Vault; nothing is hard-deleted on disconnection.
- **Clinician AI assistant.** Propose → clinician approves → apply → log to `patient_action_log`; never writes before approval.
- **Clinician depth phases 1–3.** RBAC capabilities, Today/Triage inbox, tasks, encounters + SOAP/ambient scribe drafts, clinical templates, audit + compliance pack, internal notes.
- **Navigation IA v2.** 4-pillar headers per side, sub-tab bars, role-aware mobile bottom nav.
- **Beta programme.** Landing page, NDA-gated self-serve booking on Cal.com, tester records, event log, bug-report FAB.
- **Google sign-in** on sign-in and sign-up (first-party redirect, no vendor domains).
- **SEO + LLM discoverability.** Job posting schema, sitemap, `llms.txt`, canonical/noindex policy.
- **Patient assistant.** Gemini-backed chat with granular consent, voice dictation with proof-read before send, file upload into the Vault, Simple Mode (`/assist`).
- **Offline support.** IndexedDB write queue for vitals/meds/schedule plus cached reads and drain toasts.
- **Marketing surfaces.** Emerald Prestige landing, Features "show and tell" grid, unified `/pricing` with audience tabs, `/for-clinicians`.

### Earlier 2026

- Emergency numbers, family health tracking + context switcher, secure patient↔clinician messaging, Health Vault + timeline, document sharing with short-lived signed URLs, vitals source tracking and export, medication scanner/interaction checks, caregiver delegated access, HIPAA audit logging, clinician BAA framework, careers + applications admin.

## Next up (sequenced)

1. **Mobile P0/P1 fixes** from the sweep findings table.
2. **Cross-tenant audit search** in the admin console (admin actions + access logs).
3. **Post-login tenant branding** — the hospital's name and logo behind sign-in as well as on the
   sign-up address. Deliberately deferred (Aug 2026): the branded intake page carries name, logo
   and brand colours, and everything after sign-in stays Emerald Prestige. Revisit if a hospital
   asks for it.
4. **Assignment-first access** — switch `can_view_all_patients` off as the hospital default once
   sub-admins are onboarded and trained, so a clinician sees the patients assigned to them.
   Prepared on `claude/oclmc-panel-scope-option-a-assignment-first`; see review C2.
5. **Server-side audit logging.** `hipaa_audit_logs` rows are written by the client, so the log
   records what the client chose to report. Sound for the honest-client case and fine for the BAA
   conversation today, but PHI reads should be logged server-side before a formal audit.
4. **Enterprise management depth** — provider/patient rosters, coverage and caseload views, owner KPI reports.
5. **Clinician depth phase 4** — persistent patient-detail action rail, risk explanation drawer, QHIN Network Records tab.
6. **AI medication knowledge base** for the patient assistant (interactions, side effects, missed doses; no dosage changes, no diagnosis).
7. **Health news feed** filtered against the patient's own medications and conditions.
8. **WhatsApp transport** behind the existing provider interface.
9. **QHIN live connection** (Particle Health) beyond the current provenance/import shell.

## Deferred (with reasons)

- **Full UI redesign Phase A–D** — deferred until functional gaps close; palette and type system already locked.
- **Native store builds via Capacitor** — config exists; ship after the PWA sweep is clean.
- **Connected EHR write-back** — read/import first; write-back needs partner agreements.
- **Service-worker HTML caching** — deliberately removed; stale shells caused sign-in loops.
- **End-to-end encryption** — AES-256 at rest + TLS in transit only, so clinicians can be served server-side features.

## Guardrails

- Mobile-first for patients; one primary action per screen, secondary actions behind sheets.
- Not another EHR: plain language, calm editorial layout, no dense clinical grids.
- Progressive disclosure: enterprise-only cards hidden for solo clinicians.
- Roles live in `user_roles`; admin checks are server-verified only.
- Every public table gets RLS plus explicit grants; sensitive reads go through security-definer functions.
- Nothing is hard-deleted where there is a legal record.
- `src/lib/pricing-constants.ts` is the single source of truth for pricing, tiers and limits.
