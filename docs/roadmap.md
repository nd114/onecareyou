# OneCare Roadmap

**What this is.** The single living tracker for OneCare product work: what has shipped and when, what is in flight, what is next, and what is deliberately deferred. Update this file as work lands — do not start new roadmap or tracking documents.

**Last updated:** 17 August 2026

**Companion docs** (deep dives kept separate on purpose):

- [`qhin-integration-plan.md`](./qhin-integration-plan.md) — national network records (Particle Health first)
- [`whatsapp-integration-plan.md`](./whatsapp-integration-plan.md) — messaging transport plan
- [`enterprise-hospital-tenancy-plan.md`](./enterprise-hospital-tenancy-plan.md) — hospital tenancy phases
- [`reviews/oc-lmc-review-aug-2026.md`](./reviews/oc-lmc-review-aug-2026.md) — codebase review findings and decisions
- [`reviews/product-and-mobile-audit-aug-2026.md`](./reviews/product-and-mobile-audit-aug-2026.md) — feature gaps, mobile readiness, patient UX
- [`reviews/security-review-aug-2026.md`](./reviews/security-review-aug-2026.md) — red-team pass, findings and accepted risks
- [`reviews/language-literacy-telehealth-hospital-profile.md`](./reviews/language-literacy-telehealth-hospital-profile.md) — the four product questions, answered, with links to the plans below
- [`language-support-plan.md`](./language-support-plan.md) — eleven languages, staged (plan only, not implemented)
- [`low-literacy-support-plan.md`](./low-literacy-support-plan.md) — Simple Mode: preference shipped, depth deferred
- [`telehealth-plan.md`](./telehealth-plan.md) — async consults first, video last (logged, not started)
- [`hospital-profiles-plan.md`](./hospital-profiles-plan.md) — public hospital directory, published opt-in
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
| Authenticated patient/clinician pillars | — | Not reachable by the audit browser without a signed-in preview session | Closed — rerun signed-in on 15 August, see below |

### Signed-in bug sweep (15 August 2026, patient / clinician / admin / guest / tenant)

Every route in `App.tsx` was walked with a real session per role, at 1280x1800 and 390x844, watching
console errors, failed requests, HTTP >=400 and horizontal overflow.

| Route / surface | Severity | Symptom | Status |
| --- | --- | --- | --- |
| Every authenticated route, all roles | P0 | White screen: `MobileBottomNav` ran a `useEffect` after an early return, so the hook count changed between renders and the shell crashed | Fixed — visibility computed before the effect |
| `/clinician/reports` | P1 | 400 from the Data API: unhandled-alert tile filtered `alert_logs.acknowledged`, a column that does not exist (the table uses `acknowledged_at`) | Fixed — filters `acknowledged_at is null` |
| `MobileBottomNav` public routes | P2 | Marketing exception listed `/medical-disclaimer`; the real route is `/disclaimer`, so the tab bar showed over that page | Fixed |
| All in-app `<Link to>` / `navigate()` / nav-IA targets | — | Cross-checked against the route table: no broken destinations | Pass |
| Cross-role redirects | — | Clinician and admin sessions are bounced off patient surfaces and each other's consoles; guests are sent to `/sign-in` | Pass |
| Tenant intake (`?tenant=lmc`, `/staff`, legacy `/i/lmc`) | — | Branded patient and staff intake render; legacy path redirects to the tenant host | Pass |
| Horizontal overflow, all roles, both viewports | — | None; wide audit/admin tables already scroll inside their own container | Pass |
| Radix `Function components cannot be given refs` warning | P3 | Dev-only warning raised inside Radix's own portal internals (Dialog/Popover/Dropdown), not app code | Won't fix |
| `/clinician/dictations` demo row | P3 | Signed-URL request 404s for one seeded dictation whose audio object was never uploaded; page still renders | Demo data, not code |




## Shipped log (newest first)

### August 2026

- **Security review and red-team pass.** Seven findings, three of them serious, each reproduced as a
  real caller against a replay of the migration history before being fixed: any patient could set
  their own `subscription_tier` to premium; any hospital admin could rewrite their own commercial
  terms including `revenue_share_pct`; and any clinician could re-activate a share the patient had
  revoked and widen their own permissions. All three were the same root cause — RLS is row-level, so
  a policy written for one column grants every column — and all three are now pinned by BEFORE
  UPDATE guards. Also: `anon` no longer holds Supabase's default blanket privileges on every public
  table (482 grants across 69 tables, now four deliberate surfaces), `drug-lookup` requires a
  caller, and four secret/HMAC comparisons are constant-time. 14 regression assertions. See
  [`reviews/security-review-aug-2026.md`](./reviews/security-review-aug-2026.md).
- **Simple Mode as a stored preference.** `profiles.simple_mode`, offered at onboarding and repeated
  in Settings, with an information control explaining who it is for, what changes and why. Replaces
  a mode that was four taps into the Learn pillar and did not persist. The deeper surface changes
  (photo-led schedules, read-aloud, one question per screen) are deliberately deferred — see
  [`low-literacy-support-plan.md`](./low-literacy-support-plan.md).
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

0. **Hospital profiles.** A public, opt-in directory so patients can find a hospital by name
   instead of only by typing its code — currently the hardest step in patient onboarding. The
   earliest of the current forward plans to pick up; fully specified in
   [`hospital-profiles-plan.md`](./hospital-profiles-plan.md). Open question is editorial
   ownership, not engineering.

1. **Mobile device pass on real hardware.** The structural fixes are in (tab-bar
   clearance, dvh, iOS input zoom, notch insets, PWA colours, Capacitor build
   config); tap targets, keyboard overlap and tablet landscape need real devices.
   Table overflow on the four pages that render real tables is outstanding.
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
   conversation today, but PHI reads should be logged server-side before a formal audit. Raised in
   three consecutive reviews now, and it matters more since tenant visibility was deliberately left
   broad — the audit log is the compensating control for that decision.
6. **Rate limiting on anonymous writes and sign-in.** There is none anywhere in the application
   today; the only 429 handling is for responses *from* the AI gateway. Flagged in the August 2026
   security review as an accepted risk pending a decision.
7. **KingsChat account linking — with `state` and PKCE.** The callback exchanges a code correctly
   but nothing binds it to the browser session that started the flow. Harmless while it does not
   link accounts; an account-takeover path the moment it does. Requirements are written up in the
   security review — settle them as part of the linking design, not afterwards.
8. **Enterprise management depth** — provider/patient rosters, coverage and caseload views, owner KPI reports.
9. **Clinician depth phase 4** — persistent patient-detail action rail, risk explanation drawer, QHIN Network Records tab.
10. **AI medication knowledge base** for the patient assistant (interactions, side effects, missed doses; no dosage changes, no diagnosis).
11. **Health news feed** filtered against the patient's own medications and conditions.
12. **WhatsApp transport** behind the existing provider interface.
13. **QHIN live connection** (Particle Health) beyond the current provenance/import shell.

## Deferred (with reasons)

- **Multi-language support** — a working foundation was built in August 2026 and deliberately
  reverted. Live translation machinery with no translations behind it invites a switcher that does
  nothing and makes every new component a question. The code is about a week; spend it immediately
  before the translation work is commissioned, not a year ahead of it.
  See [`language-support-plan.md`](./language-support-plan.md).
- **Simple Mode depth** — the preference shipped; the five surface changes behind it (photo-led
  medication schedules, time as pictures, read-aloud, voice logging, one question per screen) are a
  rebuild of the patient surfaces and are held for review.
  See [`low-literacy-support-plan.md`](./low-literacy-support-plan.md).
- **Synchronous telehealth (video)** — logged, to be revisited. Async consults as a first-class
  object come first, then scheduling; video is last because the hard parts are bandwidth fallback,
  remote-prescribing rules, recording retention and mid-consult billing, none of which a video
  widget solves. See [`telehealth-plan.md`](./telehealth-plan.md).
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
