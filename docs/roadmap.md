# OneCare Roadmap

**What this is.** The single living tracker for OneCare product work: what has shipped and when, what is in flight, what is next, and what is deliberately deferred. Update this file as work lands — do not start new roadmap or tracking documents.

**Last updated:** 8 September 2026

**Companion docs** (deep dives kept separate on purpose):

- [`enterprise-hospital-tenancy-plan.md`](./enterprise-hospital-tenancy-plan.md) — hospital tenancy phases
- [`sharing-access-consent-model.md`](./sharing-access-consent-model.md) — who may see what, and how consent is checked
- [`record-corrections-plan.md`](./record-corrections-plan.md) — the three classes of correction
- [`plans/`](./plans/) — intentions that are paused or not started, each with a status banner
- [`archive/`](./archive/) — point-in-time reviews and finished programmes, kept for their dates
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

- **The audit log stopped being writable by the accounts it describes.** `hipaa_audit_logs` took
  INSERT straight from the browser under a policy whose only check was that the actor named
  themselves — so a signed-in clinician could record an access they never made, against a patient
  they had no relationship with, label a real access with a milder action, or bury a genuine entry
  under any volume of noise. Nothing verified that the access being recorded was one the caller
  could have made. That log is the compensating control for tenant visibility being deliberately
  broad, and it is what a BAA conversation points at, so it had to be evidence rather than
  testimony. Direct INSERT, UPDATE and DELETE are revoked; reads are recorded only through
  `log_record_access()`, which takes the actor from `auth.uid()`, verifies access first, and
  accepts an action only from a fixed set. Two client-side writers went with it — one was dead
  code that the changelog nonetheless cited as proof of "HIPAA audit logging on every PHI
  interaction", and the other duplicated a trigger's row with a weaker, client-authored version.
  Both changelog claims corrected. 13 regression assertions.

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

- **The chart says whose chart it is.** A patient's record is fifteen tabs deep, and two things
  scrolled away together: the actions, which sat in the page header, and the patient's name.
  Somebody writing an encounter note two screens down had nothing on screen naming the patient, and
  wrong-patient documentation does not need an unusual sequence of events to happen. An action rail
  now sticks under the header carrying Send guidance, Set alert and jumps to the tabs a clinician
  reaches for, and reveals the name and risk chip the moment the header above leaves the viewport.
  It sits in the normal flow rather than floating, which keeps it clear of the mobile tab bar — the
  collision between bottom nav, FAB stack and sticky sub-tabs that item 1 flags. Rendering it caught
  what reading it did not: at 390px the name was crushed to a single letter by the buttons beside
  it, which is the one thing the strip exists for, so below `sm` the name takes the room and the
  chip stands down. It replaces an `lg`-and-up sidebar card that carried Start encounter, Add task
  and Refer — all three are in its menu, and reachable on a phone now, which they never were.
- **The risk badge now shows its working.** "High risk" over two moderate findings and nothing
  critical looked like the badge knew something it had not shown — the rule that produces the level
  was two lines of code and nowhere on screen, and a score a clinician cannot check is one they
  learn to skip. The panel states it against this patient's counts ("High because 3 findings are
  outside their normal range — two or more moves the level up even with nothing critical"), and
  names what it did **not** weigh: a measurement with no reference band, a total cholesterol of 400
  among them, used to leave the badge reading Stable with nothing saying it had never been
  considered. 10 assertions on top of the engine's existing 38, plus 3 on the rail.
- **A Coverage tab that says who is falling through the gaps.** The rosters already answered "who
  works here" and "who are our patients"; nothing answered the question an administrator actually
  has, which is who is between the two. The tab reports patients sharing their record with the
  hospital and assigned to nobody first — a person nobody is looking after outranks an
  organisational tidy-up — then un-routed patients, departments with no lead, departments with
  nobody in them, and clinicians carrying no caseload. Alongside it, owner KPIs and a caseload
  spread (median against average, busiest against lightest), and a long-format CSV carrying figures
  and findings in one file so the report can be sent on. Two rules keep it honest: a gap is only a
  gap where the structure exists, so a hospital that has not created departments is not told its
  patients are un-routed; and only clinical roles carry patients, mirroring
  `practice_role_is_clinical`, so a receptionist assigned to nobody is a receptionist rather than an
  idle clinician. The one that needed care: a single-doctor hospital, where the owner has both the
  hospital-wide view and the whole caseload — excluding everyone with that view would have reported
  zero clinicians and zero of everything else. Computed entirely from rows the page already fetches,
  so the tab costs no queries. 26 assertions.
- **The assistant answers about medicines from the label, not from memory.** A patient asking
  "what are the side effects of my metformin?" or "can I take ibuprofen with my lisinopril?" used to
  get an answer out of the model's own recollection, with nothing behind it and nothing to cite —
  while the medications page answered the same question from RxNorm plus the offline table, under a
  rule that the app never says "safe" while any source disagrees. Two answers to one question, and
  only one of them grounded. The assistant now has two lookups (`look_up_medication`,
  `check_interactions`) that read the FDA label and both interaction sources before it replies, and
  the reply carries the source underneath it. Every gap is stated rather than left blank: the tool
  hands back "the label does not answer this" so a missing section is a fact the model was given,
  not a hole it fills in. A failed interaction check reads as a failed check, never as nothing found.
  Missed-dose guidance is extracted as the label's own sentences rather than falling back to the
  dosage section — which on a prescriber's label is a titration table, and handing that to an
  assistant told not to discuss doses is handing it the doses. The knowledge itself moved to one
  import-free module read by the page, the drug lookup and the assistant alike; two bugs fell out of
  the merge, a name normalisation that dropped separators (so "Vitamin-K" missed the warfarin
  warning that "Vitamin K" raised) and an interaction check that reported "clear" for a single drug
  it had never checked. 37 assertions.
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
2. ~~**Cross-tenant audit search** in the admin console.~~ **Done** — `admin_access_log_search`
   backs a read-only panel on the console, searchable by action, clinician email or patient email,
   newest first and capped at 200 results.
3. **Post-login tenant branding** — the hospital's name and logo behind sign-in as well as on the
   sign-up address. Deliberately deferred (Aug 2026): the branded intake page carries name, logo
   and brand colours, and everything after sign-in stays Emerald Prestige. Revisit if a hospital
   asks for it.
4. ~~**Assignment-first access.**~~ **Done as a tenant switch** (September 2026).
   `practices.assignment_first_access`, off by default, with `practice_set_assignment_first()`
   applying it to existing non-admin members and auditing both directions. Not a global flip: at a
   hospital where assignments have not been made, that would empty every clinician's panel in one
   deploy — the objection that deferred it the first time. Owners and admins keep the wide view as
   the administrative right the plan describes, and new members inherit the tenant's choice through
   a BEFORE INSERT trigger. 8 assertions against Postgres.
5. ~~**Server-side audit logging.**~~ **Done** (August 2026). Changes are recorded by six
   `AFTER INSERT OR UPDATE` triggers in the same statement as the change. Reads go through
   `log_record_access()`, which takes the actor from `auth.uid()`, verifies the access before
   recording it, and accepts only a fixed set of actions. The table itself is no longer writable
   by the client at all — the open `WITH CHECK (auth.uid() = user_id)` INSERT policy that let a
   clinician author arbitrary entries, against any patient, is gone. What remains is a product
   question rather than a gap: nothing in Postgres knows a page was rendered, so a read is
   reported by the client and the guarantee is that a report cannot be forged or misattributed —
   only withheld.
6. ~~**Rate limiting.**~~ **Done, with a stated limit** (September 2026). Anonymous writes were
   throttled in August; sign-in now goes through `check_signin_allowed()` before the form calls
   Supabase — ten attempts per address and fifty per IP in fifteen minutes, keyed on both because
   either alone misses a real attack. Being precise about the boundary: this covers the sign-in
   form, and cannot see a request posted straight to `/auth/v1/token`. Nothing in the database can.
   The limits that cover that are dashboard settings, listed with the checks that prove them in
   [`handbook/auth-hardening.md`](./handbook/auth-hardening.md) — **the record of what is actually
   configured is still blank and needs filling in from the project settings.** 5 assertions.
   Superseded detail: **Rate limiting — anonymous writes done, sign-in outstanding.** The three tables the anonymous
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
8. **Simple Mode — toggle withdrawn, decision open.** The preference stored a value and promised
   bigger text, fewer things per screen and plainer wording; no interface read it, so turning it on
   changed nothing. The control is out of Settings and onboarding (September 2026) and
   `profiles.simple_mode` is left in place, because the people who already chose it chose something.
   Still to decide: what Simple Mode should be, and whether the five changes in
   [`low-literacy-support-plan.md`](./low-literacy-support-plan.md) are the right five. Read-aloud
   and a type scale are the cheapest two if it comes back.
9. **Voice-first actions** — say it once, review one screen, approve once. Scoped against the
   existing approve-before-write machinery in
   [`voice-first-actions-plan.md`](./voice-first-actions-plan.md): entity resolution first, then the
   review screen, then clinician action breadth, then continuous capture. Prescribing and the
   pharmacy side are split out as their own track, gated on a legal answer rather than an
   engineering one.
10. **Family-member targeting for the patient assistant.** Every tool and the record snapshot are
   scoped to the signed-in user with `family_member_id` null, so a parent managing two children
   cannot log anything for either of them by voice or by chat. A scoping change rather than new
   machinery, and the case the assistant most obviously fails.
11. **Enterprise coverage cannot see managed records.** `clinician_patient_records` — the profiles
   staff create for people not on the platform — is RLS-scoped to its creating clinician, so a
   hospital administrator cannot read them at all and the Coverage tab reports on platform patients
   only. Widening this means deciding whether a chief admin may read records another clinician
   created privately (`data_sharing_model = 'clinician_managed'` suggests deliberately not), so it
   needs a product decision before a migration.
12. **Departments stay enterprise-only, by decision.** An independent practice cannot create one and
   that is now intended rather than incidental (September 2026). The tier below enterprise is meant
   to be a lightweight system that sits alongside a practice's existing EHR rather than reorganising
   it — see [`ehr-integration-plan.md`](./ehr-integration-plan.md) — so departments there would be a
   second org chart competing with the one their EHR already holds. Revisit when that tier's shape
   is settled.
13. ~~**Notification preferences.**~~ **Rebuilt per category** (September 2026).
   `notification_preferences` rows, a catalogue in code that only lists categories something
   actually sends, and `notification_allowed()` as the single question every sender asks — the old
   design failed because ten senders each had to remember, and a sender that forgets looks exactly
   like one that decided yes. Absence of a row means the catalogue default, never off, so shipping
   a category cannot silently mute mail people rely on. Mandatory categories — account security,
   and a clinician's own threshold alerts — are enforced in the database rather than only in the
   client, and appear in the list marked with the reason rather than being hidden. 13 unit
   assertions and 6 against Postgres. Still to wire: the remaining senders ask nothing yet, because
   the only currently switchable category with an email producer is the care-circle alert.
14. ~~**The interaction check cannot see the full brand dictionary.**~~ **Addressed differently**
   (September 2026), because the dictionary was the wrong answer — see the commit and
   `data/README.md`. Matching now happens on ingredients rather than on the line a patient typed, so
   a combination product's ingredients are each checked, and a curated synonym table lets
   "paracetamol" meet a table written in "acetaminophen". Superseded note: `referenceInteractionsFor`
   resolves brands through a 117-entry table compiled into `_shared/medication-knowledge.ts`, while
   `international_drug_mappings` holds up to 207,544 rows from the same family — because the matcher
   is an import-free pure function with no database access. Closing it means either a lookup before
   the pure matcher, or generating a larger static table at build time from
   [`data/international-drug-names.csv`](../data/international-drug-names.csv).
16. **WhatsApp transport** behind the existing provider interface.

## Deferred (with reasons)

- **QHIN** — suspended at the owner's direction (September 2026), both the live connection and the
  Network Records tab that has nothing to show without one. The reasoning is worth recording because
  it is a position rather than a postponement: QHIN exists to move records between institutions that
  each hold their own copy, and OneCare's premise is that the patient holds theirs. The more the
  platform is adopted the less there is for a QHIN to broker. It comes back later, and when it does
  the target is to be better than QHIN rather than to join it — which means it should be designed
  from what patients need moved, not from what the network already carries.
- **Health news feed** — deferred a long way out, at the owner's direction (September 2026). A feed
  filtered against a patient's own medications and conditions is a content pipeline before it is a
  feature: someone has to choose the sources, decide what counts as health news rather than health
  marketing, and own what happens when an article contradicts the patient's prescriber. None of that
  is code. Revisit when there is an editorial answer, not before.
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

---

# Agreed, not yet built

Decisions reached in discussion and not yet in code. Each says what was settled
and what is still open, so the next person picking one up is not re-deciding
it.

Folded in from `agreed-not-yet-built.md`, September 2026 — a third tracking
document, started in breach of the rule at the top of this file.

Decisions reached in discussion and not yet in code. Each says what was
settled and what is still open, so the next person picking one up is not
re-deciding it. September 2026.

Ordered by how much harm the absence does.

---

### 1. Retraction: a window, a remnant, and who arbitrates

**Settled.** Retracting a misfiled document stays possible **forever**. What
changes with time is who has to sign it, not whether it can be done.

| Age of the document | Who can retract | What it is |
|---|---|---|
| First 72 hours | The sender, alone. One action, reason required. | An immediate correction |
| After 72 hours | The sender **or the practice**, with a categorised reason, co-signed by the practice's privacy or admin role | A privacy incident, handled as one |

Why not a hard cutoff after 3 or 7 days. A time limit is right for *undo*,
where the harm is embarrassment and decays. This is a **disclosure**, where the
harm compounds. Misfilings are found late — when the wrong patient asks why
they have this, when the right one says their letter never arrived, when an
audit runs — so a 7-day window closes at roughly the moment discovery
typically happens. And "ask the patient to retract it" cannot be the remedy of
last resort: the practice is the controller and owns the duty, the patient who
was wrongly sent it owes nobody cooperation, and asking may itself require
explaining whose record it is.

The co-signature buys what the clock was meant to buy. A clinician cannot
quietly withdraw a diagnosis letter a patient depends on, because after 72
hours it takes two people. It also fixes something the current sender-only
design gets wrong: **a departed clinician's misfiling is currently unfixable by
anyone.** The practice route closes that.

"Ask the patient" stays available as a message. It is often the right first
move. It is never the only route.

#### The remnant

Not "tombstone" — **remnant**, throughout. No emoji.

```
Discharge summary.pdf — withdrawn 3 September by Dr Adeyemi
Sent in error · Why?
```

"Why?" opens the reason, how long it was visible, whether it had been opened,
and what to do next.

**Two audiences, two fields.** The reason shown to the recipient must not name
the other patient — "belongs to Jane Evans of 14 Acacia Road" is a second
disclosure caused by the remedy for the first. So:

- a **structured category** (wrong patient / superseded / contains another
  person's data / sent in error),
- **patient-facing text**, constrained,
- an **internal note** only the practice and the audit record see.

The category is structured rather than free text because free text cannot be
counted, cannot raise an alert when one clinician's misfilings spike, cannot be
translated, and cannot be filtered in an incident report. Free text says what
happened once, to one reader. A category says what keeps happening.

#### Dispute — and who arbitrates

**We do not arbitrate, and must not appear to.**

Settled shape: **no dispute inside the first 72 hours.** That window is for
genuine, immediate correction and a dispute mechanism there would only add
friction to somebody fixing their own mistake. The remnant still appears, so
the patient is never left with an unexplained gap.

**After 72 hours the patient may object.** An objection is recorded against
the retraction, attached to the remnant permanently, and routed to the
practice — who is the data controller and the accountable party. OneCare's role
is to hold the record of what was withdrawn, why, when, and that it was
objected to. Not to decide who was right.

Where the patient is unsatisfied, the escalation is the one the law already
provides: their regulator. We surface that route rather than adjudicating.

**Still open:** whether an objection should temporarily restore the patient's
own view of the document. Argument for: they cannot contest what they cannot
see. Argument against: if it genuinely was somebody else's record, restoring it
re-opens the breach to make a point about process. Leaning against, with the
practice able to re-send if the retraction was wrong.

---

### 2. The Vault: scope, order, and where a thing came from

**Settled in principle.** The Vault is the patient's complete record, so it
needs a scope somebody can hold in their head and provenance on everything.

#### What belongs in it

One rule: **anything that is a document about this person's health.** Not a
second store beside the medication list and the readings — those are structured
data with their own screens. The Vault is the unstructured half.

Today: uploads, clinician-sent documents, lab results, discharge summaries,
prescriptions, imaging reports, insurance, vaccination records, referrals,
visit notes, care records, and the patient's own appointment recordings and
their transcripts.

To bring in, because they are documents about this person's health and
currently live elsewhere: AI conversation exports the patient asked to keep,
generated summaries, signed assessments they were given, and the record bundle
produced on export.

#### Organisation

Four axes, and only one of them is a folder:

- **Folders** — the patient's own arrangement. Their words, their order.
- **Category** — what kind of document it is. Fixed vocabulary, already exists.
- **Time** — `document_date` (when it is about), distinct from `created_at`
  (when it arrived). Sorting by the wrong one is why a five-year-old letter
  uploaded today appears first.
- **Source** — who put it there.

The failure to design against is a flat list of two hundred files named
`scan_001.pdf`. Categories and dates are assigned at upload, folders are
optional, and search covers all four.

#### Provenance — "obtainable, not perpetual"

Every item carries, and can always answer:

- who put it there (patient, which clinician, which practice, which import)
- when it arrived, and what it is dated
- how it got here (uploaded, sent by a clinician, imported from which system,
  generated by OneCare)
- if generated: from what, and by which version
- every share it has been part of, and every access recorded against it
- if withdrawn: the remnant

Shown on demand — a "Where this came from" panel — not on the face of every
row. The row shows name, category, date and a source badge. The rest is one tap
away and always available.

Most of this exists: `source_context`, `uploaded_by_user_id`, `created_at`,
`document_date`, plus `access_audit_logs`. What is missing is a **single place
that answers the question**, rather than four tables a developer could join.

**Still open:** whether provenance is a view or an assembled panel. Leaning
view, so the export and the AI context read the same answer the patient does.

---

### 3. People do not report themselves in real time

**Partly built.** `stopped_by` / `stopped_reported_at` and
`medications_with_status` landed with the medication-stopping work. The
principle generalises and the rest is not built:

**Every self-reported fact has two times: when it happened, and when we were
told.** Storing one is how a record comes to say something false while every
individual write was true.

Where it still needs applying:

- **Adherence.** `schedule_entries.taken_at` is when the dose was taken;
  marking it three days late stamps the mark, not the dose. A patient
  back-filling a week is being honest and the record should say so — including
  to the risk engine, which should weight a dose confirmed a week later
  differently from one confirmed at the time.
- **Vitals.** `recorded_at` is settable; nothing records when it was entered.
- **Conditions and allergies.** No date at all for when they began.

**Settled:** report time is recorded everywhere a person can assert something
about the past, the gap is shown when it is material, and the gap is never
presented as an error. "Stopped in August, told us in September" is a true
statement about a real person and displaying it as a data-quality problem
teaches people to lie about dates.

---

### 4. Addenda, and editing them

**Settled.** A patient cannot delete a clinician's note. What they get instead
is an addendum: their own statement, attached to the entry permanently, in
their words. Both sides can write one; a clinician correcting their own note
writes an addendum rather than editing history.

An addendum is never approved or rejected. It is speech, not a change. That is
what makes it safe to grant unilaterally.

**Editing, decided:** editable for **one hour**, then fixed, marked `(edited)`
afterwards — the WhatsApp convention, which people already understand.

This is *not* a conflict with the no-hard-delete rule, provided **prior
versions are retained**. WhatsApp keeps none; a health record must. So: the
displayed text is the latest, `(edited)` says it changed, and the earlier
versions are obtainable the same way document provenance is — available, not
perpetual. Without version retention an edit window would be a way to rewrite
history quietly, which is exactly the thing addenda exist to prevent.

The same one-hour-and-`(edited)` rule should apply to **messages** between
patient and clinician, which currently cannot be edited at all. That means
bringing the chat up to what people expect from any messaging app — edit,
delete-for-everyone leaving a remnant, read state, reply-to. Worth doing as one
piece of work rather than bolting editing onto the current implementation.

---

### 5. Encounters marked entered-in-error

**Settled in shape, not built.** FHIR already has the vocabulary and this
codebase already honours `entered-in-error` on imported observations, so
extending it to clinician-authored encounters is consistent rather than novel.

- The **author** marks it, or the **practice** if the author has left. Reason
  required. No patient acceptance: it is the clinician's own account.
- The row survives, struck through, showing who marked it and when.
- The patient sees it happen.

**The thing that makes or breaks this:** if the status is only a badge, it is
not done. The AI will still summarise the encounter, the risk engine will still
count it, the export will still include it. The status has to remove it from
clinical reads at the view or policy level — not by every caller remembering to
filter. That is where this normally goes wrong.

---

### 6. Merge: two records, one person

**Settled in principle, deliberately last.**

The case: somebody is already on OneCare, and separately their clinician
created a record for them — a different email, a walk-in visit, a bulk import —
so there are two records for one human. Merging joins them.

Rules:

- Merging **links** both records to a single `auth.users.id`. It never mints a
  new one. Three ids for one person is the thing to avoid.
- Both source records stay resolvable afterwards. Nothing is hard-deleted.
- **The attribution problem, plainly.** `record_onboarding_provenance()` stamps
  `onboarded_via_practice_id` on the profile the first time a practice record
  is claimed, and the first institution to introduce somebody keeps the credit.
  That field is what the revenue share with institutions is calculated from. A
  merge that takes the surviving record's attribution would silently move the
  credit — if the hospital-created record is merged into a self-signup profile
  and the merge keeps the profile's (empty) attribution, the hospital that
  actually introduced the patient loses the revenue, with no error and no way
  to notice from inside the app.

  So: **a merge preserves the earliest attribution across both records, not the
  surviving record's.** Write that assertion before writing the merge.

Not to be attempted until 1, 4 and 5 are settled.

---

### 7. Proposals that are never answered

**Settled.** No silent expiry. A proposal the patient never answers stays
pending and **ages visibly**: "waiting since 3 September" on both sides, and it
groups on the clinician's list as needing follow-up.

`created_at` already exists, so this is a display rule and a grouping, not a
schema change.

Two additions agreed:

- a `proposal_waiting` notification category, which slots into the per-category
  preferences already built;
- a **bulk reminder** the clinician can send to everyone with an unanswered
  proposal, because chasing them one at a time is how they stop being chased.

The system says "unanswered". It does not decide what that means clinically —
that judgement stays with the clinician.

---

### 8. Remove the sharing-model selector from the clinician's dialog

**Settled, small.** `EditManagedRecordDialog` lets a clinician pick a
`data_sharing_model` — including `patient_managed`, which no longer exists
anywhere else — on a record the patient has not claimed.

On an unclaimed record that field is a note about intent, not enforcement. It
becomes real only when the patient claims the record and chooses for
themselves. So the dialog is pre-selecting an answer to a question that is the
patient's to answer, and doing it in permission-shaped language that implies
otherwise.

Remove the selector. The patient chooses at claim time. If a clinician wants to
record intent, that is a note.


---

# Deferred, with what would restart it

Decisions taken in review that are not being built now. Each says what it is,
why it is deferred, and what would have to be true to start.

---

### Positioning: "a patient-controlled longitudinal record with a clinician workspace on top"

Marked for reuse. It is accurate, it explains the product in one line to
someone who knows healthcare software, and it avoids the EHR comparison we lose
— an RFP scored on feature count against Epic is not a contest worth entering.

It is also consistent with the homepage argument, which an "EHR" claim would
contradict: the whole case is that the record is the patient's, not the
institution's.

**Not scoped:** ONC certification. Explicitly out for now.

---

### Clinical operations we *do* intend to build

Reviewed and disagreed with the earlier framing. These are not hospital ERP and
the incumbents are not obviously ahead:

#### Lab and radiology orders — **highest value of this group**

The argument is a patient one, not a hospital one. Today, someone who goes to a
lab for a test waits for the doctor to receive and interpret the result before
seeing it. If the order lives in OneCare, the result lands in the patient's
record when it is ready, and they have it whether or not the doctor has
looked yet.

That is the product's thesis applied to a workflow, not a feature-parity move.

FHIR resources: `ServiceRequest` for the order, `DiagnosticReport` +
`Observation` for the result. `ServiceRequest` was already on the adapter's
list.

**To start:** decide whether we integrate with labs directly or accept
results as documents first. The second is far cheaper and probably right.

#### Claims

Worth doing, second. Depends on the merchant-of-record decision, which is
still open.

#### Bed management — deferred, but the idea is worth keeping

The version described is more ambitious than bed management: a spatial view of
where every patient and every piece of equipment is, with equipment
provenance. That is a different product and probably a different company. Not
now — but recorded, because it is a genuinely distinctive idea rather than a
catch-up feature.

#### Not building

Rota/scheduling of staff, inventory, payroll. Hospital ERP, low margin,
crowded.

---

### Hospital directory / storefront

Three separable things, deliberately sequenced.

#### 1. Public hospital pages — **do first**

Services, locations, join code, branding. `practices` already carries branding,
contact and a hospital code, so most of the data exists. It is an acquisition
channel we control and it carries no regulatory weight.

#### 2. Search by proximity and services — **do second, without prices**

Recommendation stands: launch with services and locations, **not prices**.
Posted prices that do not match the bill are a legal exposure in several
jurisdictions, and "appropriate cost" varies by insurer, procedure and
complication. Add price ranges only where the hospital publishes them itself
and owns the claim.

**To start:** geocoding for practices, and a services taxonomy. The taxonomy is
the hard part — resist inventing one, look for an existing standard.

#### 3. Hospital broadcast to connected patients — **do third, gated**

The feature is reasonable; the naive version is not. A hospital messaging every
connected patient is one abuse report from being a spam channel, and it inverts
the consent story the product is built on.

Gates, all of them:

- Patients opt in **per institution**, not globally.
- Messages are typed: clinical / administrative / promotional.
- Promotional is **off by default** and separately opt-in.
- Every broadcast is in the audit trail with its recipient count.
- A visible unsubscribe that actually works.

Done that way it is a feature. Done naively it makes "you control your record"
ring hollow.

---

### Agents for onboarding — **worth doing, two sprints out**

See the separate section below for how they would work.

### MCP integration — **stalled, logged**

The idea: let an external AI client read a patient's record over MCP.

**Why it is stalled rather than rejected:** the capability is genuinely useful
and the protocol is the right shape. What is not settled is the consent model,
and that is the part that matters most here.

**The commentary worth keeping:**

An MCP connection is, functionally, *a share*. It gives a non-human party
standing access to a patient's record. If it is built as an "integration" in a
settings page, it becomes a back door that the product's own homepage says does
not exist.

So if it is built, it should be built as a share:

- It appears in Care Circle beside Dr Jane Evans, with the same category
  toggles.
- It is revoked with the same button.
- Every read goes through the same audit trail.
- It expires by default, rather than persisting silently.
- **Read-only to begin with.** Write actions through MCP wait until the
  in-product action-approval flow is proven.

Framed that way it is consistent with everything else. Framed any other way it
is the thing that undermines the argument.

**To start:** the in-app AI action-approval and audit work needs to land first.
It is the same consent machinery, and building it twice would guarantee they
disagree.

---

### Terms of Service and Privacy Policy — **needs a comprehensive review**

Flagged during the recording-consent discussion and correct. The platform has
changed substantially: FHIR export, whole-Vault sharing, an assistant that
reads the record, ambient scribe, institution access, billing, and soon
patient-initiated recording.

The current documents almost certainly do not describe any of that accurately.

This is a legal review, not an engineering task, but engineering owes it an
accurate account of what data is collected, where it goes, who can see it, and
what is retained. The RLS test suite is a good starting point — it is the only
document in the repository that states access rules precisely.

