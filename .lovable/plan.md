# Clinician Depth Plan + PWA/Mobile Hardening

Goal: take the clinician side from "subscription + dashboard + patient list" to a credible tool for both a **solo private practice** and a **multi-clinician group**, without straying into EHR-vendor scope. Anchored to existing docs (`clinician-gaps-implementation-plan.md`, `future-roadmap.md`, `qhin-integration-plan.md`, `tech-and-process-opportunities.md`, `comprehensive-platform-review.md`, `implementation-tracking.md`).

Strategic-but-out-of-scope items are not dropped — they get a dedicated doc so we can sell against them.

---

## Part A — What's missing today (gap synthesis)

From audit + code review of `ClinicianPractice.tsx`, `useClinicianSubscription.ts`, `PracticeTeamSection.tsx`, `nav-ia.ts`:

1. **Roles are flat.** `practice_members.role` exists ("owner | admin | member") but nothing in the app branches on it. No physician vs nurse vs front-desk vs billing vs read-only-observer distinction. A larger practice cannot safely add staff.
2. **No patient-to-clinician assignment inside a practice.** All practice members see all patients (or none) — there's no panel/PCP concept, no "my patients today" view, no coverage/handoff.
3. **No clinical workday surface.** Today tab = generic dashboard. There is no inbox / triage queue combining: new messages, unacknowledged alerts, pending guidance acks, lab/document arrivals, overdue follow-ups. Each lives on its own page.
4. **No encounter/visit object.** Notes are per-patient free text. There is no visit timeline, no SOAP structure, no time-stamped encounter the rest of the workflow can hang off (billing, follow-up, referrals, dictations).
5. **Dictations and guidance live separately** from any visit; clinician has to mentally stitch them together.
6. **Templates are starter-only.** No DB-backed `guidance_templates`, no per-practice library, no specialty packs, no template for assessments/intake/discharge.
7. **Practice operations are missing.** No internal tasks/to-dos, no shared inbox, no patient queue, no broadcast to practice staff, no recurring-task scheduling (e.g. "call all CHF patients weekly").
8. **No referral / coverage / second-opinion flow** — even within OneCare clinicians.
9. **Audit + compliance surface is invisible to the practice owner** (we log to `hipaa_audit_logs` but no UI to review).
10. **Patient detail is read-heavy, action-light.** No "order labs request," no "send to specialist," no "schedule follow-up," no "request RPM data window."
11. **Practice settings = one page.** Subscription, EHR, BAA, team, branding all stacked. Owner cannot delegate billing without giving full admin.
12. **PWA gaps** — `manifest.json` `start_url: /dashboard` (patient route, wrong for clinicians); no separate clinician shortcut; icons are a single 11 KB favicon scaled to 192/512 (will look bad on install); no `share_target` / `shortcuts`. Service worker is the kill-switch only (correct), but installability today routes a clinician install into the patient dashboard <<< needs to be fixed.

---

## Part B — In-scope build (clinician depth, 4 phases)

Each phase is self-contained, ships independently, and each respects existing tier gating in `pricing-constants.ts` / `useClinicianSubscription.ts`. No backend tech swaps.

### Phase 1 — Roles, panels, and the workday surface  *(highest leverage)*

**1.1 Real RBAC inside a practice.** Extend `practice_members.role` enum to: `owner`, `admin`, `clinician`, `nurse`, `front_desk`, `billing`, `read_only`. Add a `practice_role_permissions` table (role × capability matrix: `view_phi`, `edit_clinical`, `send_guidance`, `manage_billing`, `manage_team`, `manage_ehr`, `export_data`, `bulk_message`). All clinician hooks check via a new `useClinicianCapabilities()` and a SECURITY DEFINER `has_practice_capability(user, capability)`; UI hides actions instead of just erroring.

**1.2 Patient panels.** New `practice_patient_assignments` (patient_id, clinician_user_id, role: `primary | covering | consulting`, effective_from/to). `ClinicianPatients` gains "My panel / Practice panel / Unassigned" tabs. "Coverage mode" lets a clinician temporarily inherit another's panel (with a banner + audit log).

**1.3 Today / Triage Inbox.** Replaces the current `ClinicianDashboard` hero. Single queue combining:

- unread messages (patient → me / panel)
- unacknowledged alerts (vital, adherence, care-alert)
- guidance not yet acknowledged after N days
- documents/labs arrived (Vault + future QHIN imports)
- overdue follow-ups (from 1.4)
Each item is a row with patient name, "why surfaced," and a one-tap action drawer (snooze, assign, resolve, open patient). This is the daily home.

**1.4 Encounter / Visit object.** New `encounters` table (patient, clinician, started_at, ended_at, type: `in_person | virtual | message | review`, status, summary, billing_code_hint). Dictations, notes, guidance, and order-requests link to an encounter. Gives us a real timeline on patient detail and the hook future RPM/CPT billing will plug into.

**1.5 Tasks.** Lightweight `practice_tasks` (assignee, patient_id optional, due_at, status, source). Surfaced in Today. Auto-created by alerts ("Call patient about BP 195/110") and by guidance ("Follow up on new med in 7 days").

### Phase 2 — Templates, workflows, and group operations

**2.1 Templates library (DB-backed)** as per gap doc §5. `guidance_templates` + `template_categories`, scoped: `private | practice | platform-curated`. Specialty packs seeded for cardiology, endo/diabetes, post-discharge CHF (matches GTM "specialty wedge" in `tech-and-process-opportunities.md` §3).

**2.2 Visit templates** (intake, follow-up, discharge, RPM monthly review) — pre-fills encounter + a checklist.

**2.3 Bulk + cohort actions.** From `ClinicianPatients`: filter by tag/condition/risk → send guidance template, schedule task, request vitals window, export. Honors per-tier limits.

**2.4 Internal practice messaging.** Reuse `messages` infra with a `thread_type: 'internal'`. Practice members can DM each other and tag a patient ("FYI on John's BP") without contaminating the patient-facing thread.

**2.5 Referral & coverage (intra-OneCare).** `referrals` table: from_clinician → to_clinician (or external email), patient, reason, status. External recipient gets a time-boxed share link reusing `document_shares` machinery. Strategic precursor to the cross-practice network.

### Phase 3 — Practice ops & compliance surface

**3.1 Split Practice page** into sub-routes (`/clinician/practice/team`, `/billing`, `/branding`, `/ehr`, `/audit`, `/compliance`) so `billing` role can land on billing without seeing team management. Each is `useClinicianCapabilities`-gated.

**3.2 Audit & access viewer.** Owner/admin-only page over `hipaa_audit_logs` + `access_audit_logs`: filterable timeline, who-viewed-which-patient, export to CSV/PDF. Already-logged data; just needs a UI. Big enterprise-sales unlock.

**3.3 Compliance pack.** One-click export bundle (BAA, audit log range, data-handling description, encryption attestation). Realizes the "embedded compliance pack" item in opportunities §6.3.

**3.4 Owner reports.** Practice-level KPIs: active patients per clinician, alerts handled, avg time to ack message, guidance ack rate, panel growth, MRR (if owner). Pure read on existing tables; no new infra.

### Phase 4 — Patient-detail action layer & QHIN hand-in

**4.1 Action rail on Patient Detail.** Persistent right-side action column: Message, Send Guidance (template picker), Order Vitals Window, Start Encounter, Request Records (QHIN), Refer, Add Task, Flag for Review. Today the same actions exist but scattered across modals.

**4.2 Network Records tab** — UI shell only, wired to the existing `qhin_imports` + `qhin_record_provenance` tables. Empty-state until Particle BAA signs; the screen ships now so the QHIN flip is one secret-add (matches `qhin-integration-plan.md` §3 and `implementation-tracking.md` §10).

**4.3 Risk explanation drawer.** `PatientRiskIndicator` already exists; this turns the dot into a panel that lists *which* signals fired (vital trend, missed meds, message latency, document age). Sets up §1 ambient-scribe / per-patient predictive scoring from opportunities doc.

---

## Part C — Strategic but out-of-scope (documented, not built)

Captured as a new doc `docs/clinician-strategic-roadmap.md` so we can quote it to investors/clinicians without scope-creeping the build. Each item gets: pitch, fit, why-not-now, dependency.

- **Ambient clinical scribe** (opportunities §1) — needs voice infra + clinical accuracy bar; defer to after Phase 1–2.
- **e-Prescribe (Surescripts/EPCS)** — regulatory + per-state DEA; partner, don't build.
- **Lab/imaging orders** — depends on Health Gorilla; sequence after Particle is live.
- **CDS Hooks 2.0** (opportunities §6.1) — needs problem-list + ICD-10 first.
- **SMART-on-FHIR launch from Epic/Cerner** — only if a target customer's IT demands it; QHIN gives most of the value with one integration.
- **External public API + webhooks** (gap doc §12) — gate behind first 2 Enterprise customers asking.
- **SLA dashboard, status page** — Better Stack embed when we have paying Pro+ accounts.
- **Telehealth video** — partner (Daily.co / Twilio Video) when we have an Encounter object (Phase 1.4) to anchor it.
- **Pharmacy & device webhooks** (Dexcom, Omron, Withings) — patient-side win; sequence after QHIN.
- **Cross-practice referral network** — Phase 2.5 is the substrate; flip to network once we have >5 practices.

---

## Part D — Mobile / PWA fixes (small, ship with Phase 1)

Codebase already does the right things (kill-switch SW only, `useServiceWorker` no-op, manifest-only install). Fix the rough edges:

1. **Manifest:** keep one manifest, but change `start_url` to `/` (not `/dashboard`) so a clinician install doesn't dump them on the patient dashboard. Add `id: "/"` so future split apps don't collide. Add `scope: "/"` (already correct). Add `shortcuts` for: *Today*, *Patients*, *Messages*, *Add Vital* (patient). Add `display_override: ["standalone", "minimal-ui"]`.
2. **Icons:** generate proper 192 + 512 PNGs (and a maskable 512) from the brand mark instead of reusing the 11 KB favicon. Add them under `public/icons/`.
3. **iOS:** add `apple-touch-icon` at 180×180 (currently points at favicon). Add an `apple-mobile-web-app-status-bar-style="black-translucent"` if dark; keep `default` if light.
4. **Theme color:** already `#3B82F6`. Add a `media="(prefers-color-scheme: dark)"` variant so dark-mode installs look right.
5. **Viewport / safe-area:** already correct (`viewport-fit=cover`). Audit `ClinicianHeader` + `SectionTabs` for `env(safe-area-inset-*)` padding on iOS notch.
6. **PWA route guard:** when launched standalone, route clinicians to `/clinician/dashboard` and patients to `/dashboard` (read `display-mode: standalone` in `App.tsx` and use `profile.role`). Avoids the start_url ambiguity at install time.
7. **Capacitor config:** `capacitor.config.ts` `appName: "OneCare"` ✓; `server.url` points to Lovable preview — keep for dev, but document the production build flow (drop `server.url` for store builds) in `docs/launch-plan.md`.
8. **No new service worker.** Per PWA skill, don't add `vite-plugin-pwa` or offline caching unless user asks. Current offline write-queue (`src/lib/offline`) is independent and stays.

---

## Sequencing & rough effort


| Sprint | Scope                                                       | Effort         |
| ------ | ----------------------------------------------------------- | -------------- |
| S1     | Phase 1.1 RBAC + 1.2 Panels + PWA fixes (Part D)            | 1 sprint       |
| S2     | Phase 1.3 Triage Inbox + 1.5 Tasks                          | 1 sprint       |
| S3     | Phase 1.4 Encounters + Phase 4.1 Action rail                | 1 sprint       |
| S4     | Phase 2.1–2.3 Templates + bulk actions                      | 1 sprint       |
| S5     | Phase 2.4 internal messaging + 2.5 referrals                | 0.5 sprint     |
| S6     | Phase 3.1–3.4 Practice ops + audit viewer + compliance pack | 1 sprint       |
| S7     | Phase 4.2 QHIN tab shell + 4.3 risk drawer                  | 0.5 sprint     |
| —      | Strategic doc (`docs/clinician-strategic-roadmap.md`)       | inline with S1 |


---

## Deliverables of the first build turn (after approval)

1. New doc `docs/clinician-strategic-roadmap.md` (Part C).
2. Update `docs/clinician-gaps-implementation-plan.md` to reference this plan and mark superseded sprints.
3. Update `docs/future-roadmap.md` P3 sequence to slot the 4 phases.
4. Migration: extend `practice_members.role` enum + add `practice_role_permissions`, `practice_patient_assignments`, with GRANTs and RLS via SECURITY DEFINER `has_practice_capability`.
5. New hook `useClinicianCapabilities`; wire `ClinicianPractice` sub-pages & `InvitePatientDialog` to it.
6. PWA fixes from Part D (#1–#6) — manifest rewrite, new icons, `index.html` head, post-login route guard.

Phases 2–7 land in subsequent turns; each is independently shippable.

---

## Open questions before we build

1. Do you want **per-practice subscription** (one bill for the group) or keep **per-seat** as today? Affects Phase 1.1 + 3.1 billing role. <<Keep as per seat for now; can change depending on economies of scale and real unit costs
2. For **panels (1.2)**: should `front_desk` and `nurse` see all patients in a clinician's panel by default, or only patients explicitly co-assigned? <<<They can see patients explicitly co-assigned for the purpose of them (the nurse/front desk) being able to perform their duties, but we still have to give the patient the right over their personal info and of course we also need to keep detailed track of data flow and data access (logs) as well. 
3. For **encounters (1.4)**: are we okay deferring CPT-code suggestion to Phase 2, or do you want it on day one (it ties to RPM revenue narrative)?<<<Phase 2 is okay 
4. For **PWA install routing**: confirm the post-login behavior — should standalone-launched users always land on their role's "Today" pillar, or remember last-visited route? <<<"Today" pillar. 