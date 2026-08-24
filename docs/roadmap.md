# OneCare Roadmap

**What this is.** The single living tracker for OneCare product work: what has shipped and when, what is in flight, what is next, and what is deliberately deferred. Update this file as work lands — do not start new roadmap or tracking documents.

**Last updated:** 20 August 2026

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

- **Doses that are not due yet stopped counting as doses not taken.** Adherence divided taken by
  every scheduled entry in the window, tonight's tablets included. On a seven-day window at two
  doses a day, a patient who had taken every single dose read as 12/14 — **86%** — at nine in the
  morning on the last day, recovering to 100% only once the evening tablets were swallowed. The
  same arithmetic was in six places across both sides: the patient's dashboard (where the number
  fell each morning and climbed back through the evening), their adherence report, the per-drug and
  per-time-of-day breakdowns a clinician sees, and the figure feeding the risk assessment — which
  raises a finding below 80%, so a perfectly adherent patient drifted toward being flagged by the
  clock. One tested function now scores all of them on doses that have actually come due, and
  reports nothing rather than 0% when a schedule has not started. 13 unit tests.

- **One answer to "is this reading normal".** Three surfaces carried their own copy of the vital
  ranges and disagreed. The risk badge scored blood pressure on the systolic alone —
  `secondary_value` was on the interface and never read, so **120/110 registered as normal** — and
  compared a temperature to a Celsius band whatever unit it arrived in, so 98.6°F was reported as
  critical. It also counted any 15% movement as a risk factor, so a glucose falling from 250 toward
  normal was flagged as a warning beside genuine findings. Separately, the vitals report a patient
  exports **for their clinician** graded readings against the patient's *target* band, so it called
  130/80 "High" while the clinician's own screen called it normal, and — reading `value` alone —
  handed a doctor a 120/110 labelled "Normal". The assessment is now one tested pure function
  (`src/lib/patient-risk.ts`) that every surface reads, findings carry the range they breached and
  when the reading was taken, and only trends heading *away* from normal are reported. 27 unit
  tests.

- **The anonymous write surfaces got a limit.** Three tables accept INSERT from the open internet
  on purpose — applying for a job without an account, anonymous beta telemetry, the enterprise
  enquiry form — and none of them had any ceiling, so a loop could put ten thousand names, emails
  and phone numbers into `job_applications` and the only sign would be the table growing. Now
  throttled at the database by `BEFORE INSERT` triggers: per subject (client IP, falling back to
  the email address so one flooder cannot lock out real applicants) and in aggregate, which is the
  only limit that sees a slow spread across many addresses. The refusal is a sentence written for
  the person reading it, and the public forms now show it — they used to catch every failure and
  say "please try again", which is the one piece of advice that cannot work for a throttle.
  The KingsChat callback, a public endpoint with no caller in the app, is switched off behind a
  flag and refuses any callback without `state`. 15 regression assertions, 5 unit tests.

- **A dictation now reaches the record.** The dictation surface transcribed, summarised, and
  stopped: `clinician_dictations.patient_user_id` had existed since the table was created and
  nothing ever set it, so the visit had to be typed again into the encounter. Filing a dictation
  now creates a draft encounter on a chosen patient, with readings, patient instructions and a
  team note extracted from the transcript — each shown beside the verbatim phrase it came from,
  and nothing written without a tick. The badge that said "Filed" the moment you clicked approve
  now distinguishes approved from filed. Underneath, `vitals` accepted INSERT only from
  `auth.uid() = user_id`, so *every* clinical route into a patient's readings dead-ended, not
  just this one; a clinician who shares vitals can now record one, attributed and add-only.
  13 regression assertions.
- **Visit summaries reach the patient, and documents travel both ways.** A clinician recorded an
  encounter and the patient could not read a word of it. `encounters` had carried a patient policy
  all along — `USING (patient_user_id = auth.uid())` — that nothing used, which is the only reason
  it never mattered: RLS is row-level, so it handed over the ambient-scribe transcript, the billing
  codes and every note still being typed. Replaced by `my_visit_summaries()`, which returns signed
  notes and the summary columns only. Signing now asks whether to share, defaulting to yes.
  Separately, `health_documents` accepted inserts only from the row's owner, so a referral letter
  had no route to the patient at all; a clinician can now add to a patient's Vault, and only add.
  16 regression assertions.
- **Both kinds of clinician note became entries.** "Notes" was a single free-text column on the
  share row, rewritten wholesale — a fortnight of observations as one undated block. Both surfaces
  are now entries with a `visibility` column deciding who reads them, labelled "My notes" and
  "Team notes" because who can read it is the only difference there is. Team notes say who wrote
  them; editing an entry is new to both. Old blobs were carried across. 10 regression assertions.
- **Alert thresholds across a panel, and import files refused rather than imported crooked.**
  One threshold set on many patients at once, replacing rather than duplicating an existing rule;
  a malformed CSV is now rejected with the specific problem named instead of importing sideways.

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
5. **Server-side audit logging — half done.** Writes are covered: six `AFTER INSERT OR UPDATE`
   triggers record changes to guidance, encounters, internal notes, managed records and both share
   tables server-side, so a change to a patient's record is logged whatever the client reports
   (August 2026). What is still client-written is *reads* — `useHipaaAuditLog` and
   `useProviderShares` insert `hipaa_audit_logs` rows from the browser, so a PHI read is recorded
   only if the client chooses to say so. Finish this before a formal audit. It matters more since
   tenant visibility was deliberately left broad — the audit log is the compensating control for
   that decision.
6. **Rate limiting — anonymous writes done, sign-in outstanding.** The three tables the anonymous
   role can INSERT into (`job_applications`, `beta_events`, `enterprise_inquiries`) are throttled
   at the database by `BEFORE INSERT` triggers, per subject and in aggregate, keyed on the client
   IP with a fall back to the email address (August 2026). The KingsChat callback — a public
   endpoint with no caller — is switched off behind `KINGSCHAT_LINKING_ENABLED` and refuses to run
   without a `state` value, so account linking cannot ship without the session binding.
   Still outstanding: **sign-in**, which is Supabase Auth's own endpoint and is limited in the
   dashboard rather than in a migration — confirm the configured limits and record them.
7. **KingsChat account linking — with `state` and PKCE.** The callback exchanges a code correctly
   but nothing binds it to the browser session that started the flow, and nothing in the app starts
   one: there is no client code building an authorization URL, so the endpoint has no caller. It is
   now closed by default and rejects any callback without `state`, so the requirement is enforced
   in code rather than recorded in a document (August 2026). Whoever builds the linking design has
   to build the issuing half first, which was the point.
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
