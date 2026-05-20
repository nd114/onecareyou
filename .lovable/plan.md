# OneCare Housekeeping Audit — May 2026

Audit report only. No code changes. Goal: surface every logic break, dead-end, and missed opportunity before we touch P3 and the UI redesign.

---

## 1. Logic Breaks & Process-Flow Gaps

### 1.1 Patient side


| #   | Severity | Where                                                     | Break                                                                                                                                                                                                                                                                                                                         |
| --- | -------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **HIGH** | `/vitals`, `/schedule`, `/medications`                    | Only `AddMedication` has `FamilyMemberSelector`. Patient can *create* a medication for a child/parent, but **Vitals**, **Schedule**, **Medications list**, **Adherence**, **Health Vault** all show the primary user's data with no member switcher. Data added for family disappears from the main views — looks broken.     |
| P2  | **HIGH** | Dashboard → "Enable Reminders" button (Dashboard.tsx:316) | Button has no `onClick`. Cosmetic only.                                                                                                                                                                                                                                                                                       |
| P3  | MED      | `/care-circle` invite-code flow                           | Patient must copy-paste invite code out-of-band to provider. No "Email this link" or "Generate one-click magic link" — friction at the moment of highest value.                                                                                                                                                               |
| P4  | MED      | `/health-vault`                                           | Empty-state CTA exists but no first-document onboarding nudge from Dashboard. Patients don't know it exists.                                                                                                                                                                                                                  |
| P5  | MED      | `/onboarding`                                             | Single linear flow; no skip/resume. Drop-off lost. No progress saved between steps.                                                                                                                                                                                                                                           |
| P6  | MED      | Medication end_date                                       | Discontinued meds with past end_date still appear active in some queries (per prior `comprehensive-platform-review.md` LG noted, still unfixed).                                                                                                                                                                              |
| P7  | LOW      | Cookie banner                                             | Persists on every visit despite "Accept All" (confirmed in session replay). State not stored or stored under wrong key.                                                                                                                                                                                                       |
| P8  | LOW      | AI Chat FAB                                               | Only on Dashboard. Not on Vitals/Meds/Schedule where a patient is most likely to ask a question.NB: May also be worth having the AI be able to respond to chats about medications and have access to the medication knowledge base that would help it. May need to have some constraints with it. Worth looking into though. |
| P9  | LOW      | Provider share revoke                                     | UI exists but no patient notification or audit-log entry surfaced back to the patient ("Dr. X's access was revoked").                                                                                                                                                                                                         |


NB: we need to note in our plans for future that it may help to include health news or info that may be helpful such as meds that are discontinued, or new breakthroughs in medicine for various conditions. 

### 1.2 Clinician side


| #   | Severity | Where                    | Break                                                                                                                                                                                                                         |
| --- | -------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **HIGH** | Clinician nav            | Only 4 tabs (Dashboard, Patients, Guidance, Alerts). **Practice/Team**, **Templates**, **EHR connections**, **Analytics**, **BAA** are all buried inside Settings or unreachable. Half the product is invisible. Major error. |
| C2  | **HIGH** | Patient Detail tabs      | Vitals/Medications/Adherence load even when permission is denied — produces empty tabs with no "Patient has not shared this" empty-state.                                                                                     |
| C3  | **HIGH** | Guidance creation        | No template picker on `CreateGuidanceDialog` despite `guidance_templates` planned. Clinicians retype the same instructions per patient.                                                                                       |
| C4  | **HIGH** | Alerts page              | Alert *rules* and alert *logs* are co-mingled. No "Triage queue" view: which alerts are unread, which need a callback, which have been acted on. No assignment to team member.                                                |
| C5  | MED      | Bulk import → activation | Imported "managed" patient has no "Send activation link" button visible on the row in `ClinicianPatients` — only inside detail.                                                                                               |
| C6  | MED      | Clinician Onboarding     | `ClinicianOnboardingCard` shows checklist but no in-app tour overlay; "Get Started" leads to a static page.                                                                                                                   |
| C7  | MED      | Patient Detail → Notes   | Notes auto-save state unclear; no "Last saved" indicator. Risk of lost edits.                                                                                                                                                 |
| C8  | MED      | Practice invitations     | `PracticeInvitationsCard` exists but pending invites don't appear in the clinician's notification bell.                                                                                                                       |
| C9  | MED      | Pricing → Checkout       | Enterprise inquiry submits but no email confirmation back; user doesn't know it landed.                                                                                                                                       |
| C10 | LOW      | Session timeout          | 30-min auto-logout fires without a 60-second warning toast — clinician loses in-progress notes silently.                                                                                                                      |
| C11 | LOW      | Empty patient list       | No "Why am I empty? Invite or import" guidance for first-load.                                                                                                                                                                |


### 1.3 Guest / marketing


| #   | Severity | Where               | Break                                                                                                                                                                                  |
| --- | -------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **HIGH** | `/` Landing         | Hero mock dashboard shows hardcoded numbers (87%, 6, 4, 2) — looks like demo data not a screenshot. Weakens credibility. Leave for now, in beta.                                       |
| G2  | **HIGH** | Clinician marketing | No clinician-specific landing page at root. Provider link is one small sentence under the patient hero. Provider acquisition leak.                                                     |
| G3  | **HIGH** | `/pricing`          | Patient-only. Clinician pricing is at `/clinician/pricing` — not linked from main pricing or nav. Confusing dual model.                                                                |
| G4  | MED      | `/features`         | Mixes patient + clinician features in one list. Doesn't speak to either audience clearly.                                                                                              |
| G5  | MED      | `/contact`, `/help` | Static. No live chat, no calendly, no contact form analytics. Fix.                                                                                                                     |
| G6  | MED      | SEO                 | Authenticated routes correctly `noindex`. But marketing pages have generic meta; no blog/content engine for organic growth (zero organic traffic confirmed in prior analytics review). |
| G7  | MED      | Trust signals       | No "as featured in", no clinician testimonials, no security badges, no HIPAA-statement above the fold. Can include security badges and HIPAA compliance for now.                       |
| G8  | LOW      | `/careers`          | Live but no jobs marked "active" visibly; mixed messaging.                                                                                                                             |
| G9  | LOW      | Footer              | Two duplicate "Help"/"Features"/"Pricing" link groups (lines 59 & 108, 27 & 113).                                                                                                      |


### 1.4 Cross-cutting

- **Mobile**: Dashboard cards adapt, but `ClinicianDashboard` (683 lines, dense), `ClinicianPatientDetail`, and `Settings` (934 lines) were built desktop-first. Tablet/phone clinician use is rough.
- **Loading states**: Inconsistent — some pages show full-page spinner, some skeletons, some nothing.
- **Error states**: Generic toasts. No retry CTAs.
- **i18n**: Strings hardcoded English everywhere. No infra for Spanish/French even though we're targeting global English-speaking — still relevant for accessibility. Need to fix, means language toggles are nonfunctional.

---

## 2. Market Standing — Global English-Speaking

### 2.1 Where OneCare actually wins today


| Differentiator                                                                                                 | Status                  | Competitor parity                                                                                                      |
| -------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Patient-owned data with 4 sharing models** (Clinician-Managed / Patient-Managed / Collaborative / View-Only) | Live                    | **Unique.** SimplePractice, Practice Fusion, Healthie, Spruce all assume clinician owns the record.                    |
| **Patient + clinician in one product**                                                                         | Live                    | Most competitors are one-sided. Headway/Healthie focus on clinician; Apple Health/MyChart focus on patient. We bridge. |
| **AI assistant with explicit granular consent**                                                                | Live (Gemini 2.5 Flash) | Ahead of SimplePractice (no AI), on par with Suki/Abridge (clinician scribe only).                                     |
| **Hybrid bulk import + activation**                                                                            | Live                    | Practice Fusion needs EHR; we accept CSV → patient claims via invite.                                                  |
| **AES-256, RLS, HIPAA audit log, BAA flow**                                                                    | Live                    | Table stakes — we have it.                                                                                             |
| **AI-summarized Health Vault**                                                                                 | Live                    | Differentiator vs MyChart.                                                                                             |


### 2.2 Where competitors beat us


| Gap                                                   | Who has it                        | OneCare status                        |
| ----------------------------------------------------- | --------------------------------- | ------------------------------------- |
| Native e-prescribing (Surescripts)                    | Practice Fusion, DrChrono, Kareo  | Not started. Regulatory heavy.        |
| In-app secure messaging (HIPAA chat)                  | Spruce, SimplePractice, Klara     | **Not started.** Biggest single gap.  |
| Appointment scheduling + telehealth video             | SimplePractice, Healthie, Doxy.me | Not started.                          |
| Insurance billing / claims                            | Kareo, AdvancedMD                 | Not in scope yet.                     |
| RPM device integrations (Dexcom, Omron, Apple Health) | Validic, Vivify, MyChart          | Manual entry only.                    |
| Native mobile apps (iOS/Android)                      | All majors                        | Capacitor configured but not shipped. |
| Established brand + clinician network                 | Epic MyChart, Practice Fusion     | Beta.                                 |


### 2.3 Strategic positioning

OneCare's defensible wedge: **"The only platform where the patient and clinician share one continuous record, with the patient deciding what's shared."** That's the story for both sides.

Risks to the wedge:

- Apple/Google could absorb the patient side via Apple Health + provider integrations.
- SimplePractice could add patient-owned mode (unlikely — kills their billing moat).
- A "Plaid for health records" startup (e.g. Particle Health, Flexpa) could commoditize FHIR connectivity.

Our window: 12–18 months to lock in a clinician installed base before larger players bolt on patient-ownership features.

---

## 3. New Tech & Process Opportunities (2025–2026)

These are things that didn't exist or weren't viable when OneCare was first scoped.

### 3.1 AI / model layer


| Opportunity                                            | Why now                                                                               | OneCare fit                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Ambient clinical scribe** (Whisper-3 or Gemini Live) | Real-time speech-to-SOAP is now <2s latency and HIPAA-deployable                      | Add to clinician patient detail: tap mic, get structured note + auto-tag vitals/meds mentioned. Massive time saver. |
| **Vision models for med reconciliation**               | GPT-5 / Gemini 3 Pro Image read a pill bottle or hospital discharge sheet in one shot | Replace OCR + manual matching with a single vision call. We have `identify-pill` stub; expand.                      |
| **Voice-first patient entry (elderly)**                | Web Speech API + Lovable AI is good enough now                                        | "Hey OneCare, log my blood pressure" — huge for chronic-disease populations.                                        |
| **Per-patient predictive risk scoring**                | Small models can fine-tune on a patient's own vital trends                            | Surface in clinician's PatientRiskIndicator with explanation, not just color dot.                                   |
| **Auto-generated patient-friendly summaries**          | Already have document summarization                                                   | Extend to: lab result → "What this means for you" card.                                                             |


### 3.2 Interop & data


| Opportunity                              | Why now                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SMART on FHIR launch from EHRs**       | Epic and Cerner both support standalone+EHR-launch apps. We can be installable from inside Epic, bypassing IT procurement.                              |
| **TEFCA / QHIN go-live (US, 2024–25)**   | A QHIN intermediary like Particle Health or Health Gorilla can pull a patient's history from 90% of US providers via one API. Skip per-EHR integration. |
| **Apple Health + Google Health Connect** | Both expose vitals/medications via simple SDK now. One integration ≈ device coverage.                                                                   |
| **Carequality + CommonWell**             | Document exchange standards now reliable enough for production.                                                                                         |


### 3.3 Process / GTM (not tools)


| Opportunity                                 | Description                                                                                                                                                                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Clinician-led patient acquisition**       | Stop selling to patients directly. Sell only to small clinics; they bring 50–500 patients each. CAC drops 10×.                                                                                                                          |
| **Specialty wedge**                         | Pick *one* specialty (cardiology, endocrinology/diabetes, post-discharge CHF) and own it. Generic "health tracking" loses to MyChart. Cardiology + diabetes both have measurable RPM CPT reimbursement codes — clinician sells himself. |
| **Reimbursement-aware features**            | Add features that map to CPT codes 99453/99454/99457 (RPM), 99490 (CCM). Clinician revenue justification = our pricing justification.                                                                                                   |
| **Open-source the patient-owned model**     | Publish the 4-model data-sharing schema as an open standard. Becomes defensible IP and a PR moment.                                                                                                                                     |
| **Embedded BAA + click-through onboarding** | Solo practitioners hate paperwork. We're already 80% there; finish + market it as "Sign up in 5 minutes, BAA included."                                                                                                                 |
| **Public AI safety/transparency page**      | Patients increasingly want to know what AI does with their data. Be first to publish a clear AI report card.                                                                                                                            |


---

For section 3, I like it. Document it, and update relevant .mds with these new updates. I think there are a few more though, that we can bring in. 

## 4. UI Redesign — Recommended Approach

You chose "Full redesign both sides". My recommendation for sequencing:

### Phase A — Design system reset (1 sprint, foundational)

1. Define new tokens in `index.css` + `tailwind.config.ts` — color, type scale, radius, spacing rhythm, motion durations.
2. Apply to shadcn primitives (Button, Card, Input, Tabs, Dialog) once — propagates everywhere.
3. Refresh logo treatment + hero illustration system (real product screenshots, not mock).

### Phase B — Clinician shell rebuild (1 sprint, biggest UX win)

1. New left-nav layout (Dashboard, Patients, Inbox, Schedule, Templates, Practice, Settings) — replaces the cramped 4-tab top nav.
2. New "Patient Workspace" page combining Detail + Adherence + Documents + Notes in one focused view with tabs that respect permissions.
3. Triage Inbox replacing Alerts page (unread → action → done).

### Phase C — Patient shell rebuild (1 sprint)

1. Member switcher in header — applies family context globally to Vitals/Meds/Schedule/Vault.
2. New Dashboard: today's actions on top, trends below, AI chat persistent.
3. Mobile-first pass with bottom nav (Capacitor-ready for app stores later).

### Phase D — Marketing site (parallel, 1 sprint)

1. Split landing: `/` for patients, `/for-clinicians` for clinicians (currently `/clinician/why-onecare` is buried).
2. Unified `/pricing` with patient + clinician tabs.
3. Trust strip + real testimonials + security page.
4. Set up a `/blog` for SEO content (zero organic right now).

I'll generate 3 design directions per shell (clinician, patient, marketing) once you approve this audit; you pick one per shell and we implement.

&nbsp;

For the UI/UX Redesign, we'll log the plan in a .md and do later. Let's fix the functionality of the platform first. 

---

## 5. Proposed P3 Sequence (post-audit)

Given the gaps above, here's the recommended order — re-prioritized from the original P3 list:

1. **Family member context-switching** (P1 above) — biggest patient-side credibility bug. ~3 days.
2. **In-app secure messaging** (new — was not in P3 but is the #1 competitor gap and unlocks the wedge story). ~1 week.
3. **Clinician shell redesign + Templates library + Triage Inbox** (Phases A+B above + C3/C4). ~2 sprints.
4. **Patient subscription/payment polish** (original P3). ~3 days.
5. **EHR integration via QHIN/Particle Health** (original P3) — pivot from per-EHR FHIR to one QHIN integration. ~2-3 sprints.
6. **Ambient scribe + voice entry (Phase 2 AI)** — defensible differentiator. ~1 sprint each.

---

## 6. Immediate Quick Fixes (no design work needed)

Status snapshot — May 2026:

- ✅ Wire Dashboard "Enable Reminders" button.
- ✅ Fix cookie banner persistence.
- ✅ De-duplicate Footer link groups.
- ✅ Add "Last saved" indicator to clinician notes.
- ✅ Session-timeout warning toast at 28 min (2-min warning).
- ✅ Empty-state copy for permission-denied clinician tabs.
- ⏳ Replace hardcoded numbers in landing hero (deferred — design pass).
- ✅ "Send activation link" button on managed-patient row (`InviteToOneCareButton`).
- ✅ Empty patient-list state with Invite/Bulk-import CTAs.
- ✅ Guidance templates picker (built-in starter library; DB-backed library remains roadmap).
- ✅ Patient subscription auto-refresh + Premium polish.
- ✅ Discontinued-medication auto-deactivation trigger (P6).

QHIN integration scoped in [`docs/qhin-integration-plan.md`](../docs/qhin-integration-plan.md).

---

## What I need from you next

1. Confirm this audit covers what you wanted, or flag what I missed. - I've made various comments, check them. 
2. Pick P3 sequence — accept the order above or reorder. - go ahead, and start with the quick fixes. As mentioned, defer UI/UX changes to future...document it.
3. Approve the 4-phase UI redesign approach so I can generate design directions for Phase A first.
4. Decide on the 1-day quick fixes pass — do it before redesign starts, or fold into Phase A?