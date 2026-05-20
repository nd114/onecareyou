# OneCare Platform - Comprehensive Review

**Latest update:** May 20, 2026 (housekeeping audit + quick-fix pass)

This document tracks every audit cycle. Most-recent audit at top; historical
notes below.

---

## May 2026 Housekeeping Audit

Full audit lives in `.lovable/plan.md` (approved May 2026). Summary below.

### Logic breaks identified

**Patient app:**

- **P1 (HIGH):** Vitals / Schedule / Medications / Adherence / Health Vault
  have no family-member switcher. Only AddMedication has one. Data saved
  against a family member disappears from main views. Fix queued as P3 item #1.
- **P2 (HIGH):** Dashboard "Enable Reminders" button had no `onClick`.
  ✅ Fixed in this pass — now links to `/settings?section=notifications`.
- **P3 (MED):** Care Circle invite codes are copy-paste only. No email/magic
  link. Queued for messaging feature.
- **P4 (MED):** Health Vault has no first-document nudge on Dashboard.
- **P5 (MED):** Onboarding flow has no skip/resume; progress not saved.
- **P6 (MED):** Discontinued meds with past end_date still show as active in
  some queries.
- **P7 (LOW):** Cookie banner — Privacy Policy link was broken (`/privacy-policy`
  vs `/privacy`). ✅ Fixed.
- **P8 (LOW):** AI Chat FAB only on Dashboard. Should be persistent.
  Future: give it scoped access to drug-lookup edge function with safety
  constraints (see `docs/tech-and-process-opportunities.md` §1).
- **P9 (LOW):** Provider share revoke has no audit-log surfaced back to patient.

**Future patient-facing content (queued):**

- Health news digest: surface FDA recalls, MHRA alerts, NIH research relevant
  to the patient's medications and conditions. See
  `docs/tech-and-process-opportunities.md` §1 "Health news & breakthrough digest."

**Clinician app:**

- **C1 (HIGH):** Top nav only has 4 tabs. Practice/Team, Templates, EHR,
  Analytics, BAA are unreachable from nav (buried in Settings or not at all).
  Will be fixed during clinician shell rebuild (`docs/ui-redesign-plan.md`
  Phase B). User flagged as "major error."
- **C2 (HIGH):** Patient Detail tabs already show empty-state copy when
  permission is denied — verified in this pass. ✅ No change needed.
- **C3 (HIGH):** Guidance creation has no template picker. Queued for P3 #3.
- **C4 (HIGH):** Alerts page mixes rules + logs; no triage queue. Queued for P3 #3.
- **C5 (MED):** Managed-patient row already has `InviteToOneCareButton`.
  ✅ Verified in this pass; no change needed.
- **C6 (MED):** Clinician onboarding has no in-app tour overlay.
- **C7 (MED):** Patient notes had no "Last saved" indicator, and the init
  used `useState(() => {...})` instead of `useEffect` — meaning notes from a
  different patient could persist across navigation. ✅ Both fixed.
- **C8 (MED):** Practice invitations don't surface in notification bell.
- **C9 (MED):** Enterprise inquiry submits with no confirmation email back.
- **C10 (LOW):** Session timeout already has 2-min warning toast.
  ✅ Verified in this pass; no change needed.
- **C11 (LOW):** Empty patient list could use clearer first-run guidance.

**Guest / marketing:**

- **G1 (HIGH):** Landing hero shows hardcoded mock dashboard numbers. User
  decision: **leave for now** while in beta; revisit when out of beta.
- **G2 (HIGH):** No standalone `/for-clinicians` landing page. Queued for
  redesign Phase D.
- **G3 (HIGH):** `/pricing` is patient-only; clinician pricing buried at
  `/clinician/pricing`. Queued for redesign Phase D (unified pricing).
- **G4 (MED):** `/features` mixes audiences. Queued for redesign.
- **G5 (MED):** `/contact` and `/help` are static — no live chat, no calendly,
  no form analytics. Queued to fix during redesign Phase D.
- **G6 (MED):** No blog/content engine; zero organic traffic. Queued.
- **G7 (MED):** No trust signals. ✅ Added security badge strip to Footer
  in this pass (HIPAA-aligned, AES-256, TLS, RLS). Testimonials/case studies
  to come after first clinician customers.
- **G8 (LOW):** `/careers` has unclear job-status messaging.
- **G9 (LOW):** Footer had duplicate Help/Features/Pricing link groups.
  ✅ Fixed — Resources column replaced with "For Clinicians" column.

**Cross-cutting:**

- Mobile-first pass on clinician dashboard, patient detail, and settings
  (all desktop-first today). Queued for redesign Phase B/C.
- Loading and error states inconsistent. Queued for redesign Phase A.
- i18n: language toggles are non-functional. User flagged as needing fix.
  `react-i18next` wired during redesign Phase A; Spanish + French ship in
  Phase D.

### Quick fixes applied in this pass

- ✅ Dashboard "Enable Reminders" button wired to settings deep-link.
- ✅ Cookie banner Privacy Policy link corrected (`/privacy`).
- ✅ Footer de-duplicated; Resources → For Clinicians column.
- ✅ Footer trust strip added (HIPAA-aligned + encryption indicators).
- ✅ Clinician notes: "Last saved" indicator + fixed `useState`/`useEffect` bug
  that could leak notes between patients.
- ✅ Verified existing good behavior: session timeout warning, permission-denied
  empty states, managed-record activation button.

### Market positioning summary

**OneCare's defensible wedge:** the only platform where patient and
clinician share one continuous record, with the patient deciding what's
shared. See `docs/tech-and-process-opportunities.md` §4 for the threat
model.

**Biggest competitive gaps:** in-app secure messaging (Spruce/SimplePractice
parity), appointment scheduling + telehealth, native mobile apps, RPM device
integrations. Sequenced into P3 + future roadmap.

**Biggest tech opportunities:** ambient clinical scribe, vision models for
med reconciliation, voice-first patient entry, QHIN/TEFCA integration. See
the opportunities doc for the full list.

---

## Historical: January 27, 2026 review

Earlier version of this document. Key items below; the full prior review has
been folded into the current audit above and into `docs/clinician-gaps-implementation-plan.md`.

### Still-open items from January review

- INV-001: Push notifications reliability across browsers/devices (MED).
- INV-002: Care alert email delivery monitoring (MED).
- LG-002: No automatic cleanup of expired provider shares (MED).
- LG-003: Clinician license numbers stored but not validated (MED).
- LG-004: Adherence calculation timezone handling (MED).
- LG-005: Care alert thresholds don't reset after acknowledgment (MED).

### Closed since January review

- BUG-001 IDD import duplicate brand names — fixed.
- BUG-003 Em-dash typography sweep — fixed.
- Patient avatar upload — shipped with sharing consent model.
- Clinician avatar upload — shipped.
- Care Circle multi-caregiver — caregiver_access table + delegated permissions live.
- LG-001 Family member subscription limits — pricing constants in place; full
  enforcement TBD.
- Clinician subscription system — Stripe + tiered limits live.
- Guided clinician onboarding — `ClinicianOnboardingCard` checklist live;
  tour overlay still pending.
