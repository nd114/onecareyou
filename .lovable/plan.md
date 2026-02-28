# Comprehensive Platform Audit: Claims, Clinician Flows, and Funding Strategy

## What OneCare Is and Why It Matters

OneCare is a patient-centric health data platform that solves the **information asymmetry** between patients and healthcare providers after hospital discharge. When patients leave a clinical setting, their ongoing health data -- vitals, medication adherence, lab results -- becomes invisible to their care team until the next appointment. This gap leads to preventable complications, medication non-adherence, and fragmented care.

OneCare flips the traditional EHR model: **patients own and control their data**, sharing it with any number of providers via secure invite codes. Unlike Epic MyChart or Veradigm, which are practice-owned and siloed, OneCare gives a unified view across all providers, includes family health management, and adds caregiver alerting. This is critical in markets like Nigeria and across Africa where:

- Chronic diseases (diabetes, hypertension) are the leading killers
- Patients often see multiple doctors across unconnected clinics
- There is no EHR infrastructure in most private practices
- Family caregivers are deeply involved in patient care
- Post-discharge follow-up is minimal or non-existent

OneCare is both a patient empowerment tool and a clinician efficiency tool, and its Africa-first launch positions it to address a massive unmet need before expanding globally.

---

## Part 1: Remaining False/Misleading Claims

Several claims were fixed in previous edits, but the following still exist:

### Still Says "Real-time" (NOT Fixed)


| File                               | Line   | Current Text                                   | Fix                                                                                                                                                                            |
| ---------------------------------- | ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Features.tsx`                     | 40     | "share them with your care team in real-time"  | Change to "share them with your care team continuously"                                                                                                                        |
| `Features.tsx`                     | 51     | "Real-time analysis of potential interactions" | This one is ACTUALLY TRUE -- drug interaction checks happen synchronously when triggered. Keep as-is.                                                                          |
| `Footer.tsx`                       | 18     | "real-time interaction warnings"               | Change to "automatic interaction warnings"                                                                                                                                     |
| `EHRComparison.tsx`                | 42     | "Real-time Communication"                      | Change to "Continuous Communication"                                                                                                                                           |
| `EHRComparison.tsx`                | 88     | "same real-time data"                          | Change to "same shared data"                                                                                                                                                   |
| `EHRComparison.tsx`                | 119    | "Real-time data access"                        | Change to "Continuous data access"                                                                                                                                             |
| `useClinicianSubscription.ts`      | 21, 33 | "Real-time vital alerts"                       | This is MISLEADING. Alerts are triggered by `check-vital-alerts` edge function, which must be invoked (cron or manual). Not real-time push. Change to "Vital threshold alerts" |
| `ClinicianSubscriptionSuccess.tsx` | 84     | "Real-time Vital Alerts"                       | Change to "Vital Alerts"                                                                                                                                                       |


### "50K+ Drugs in Database" (About.tsx line 34)

Still says `'50K+'` as the stat value. This claim hasn't been validated. Should change to `'Comprehensive'` or verify the actual count.

### "Export to EHR (FHIR)" Button (ClinicianWhyOneCare.tsx line 472)

The button on line 472 is still clickable but non-functional. It should be disabled with a "(Coming Soon)" label.

### "Priority Support" (pricing-constants.ts line 45, 74)

Listed as a feature in both PREMIUM_FEATURES and LANDING_PREMIUM_FEATURES. No differentiated support exists. Should add "(coming soon)" or remove.

### "Dedicated account manager" (useClinicianSubscription.ts line 66)

Enterprise feature. Not implemented. Should add "(coming soon)".

### "EHR/FHIR integration" (useClinicianSubscription.ts line 64)

Listed as Enterprise feature without "(coming soon)". The comparison table in ClinicianPricing.tsx line 218 shows it as a checkmark for Enterprise. Should add "(coming soon)".

### "10x Faster provider onboarding" (EHRComparison.tsx line 118)

Unverifiable claim. Should change to something factual like "Minutes" or "Instant".

### "50+ Countries supported" (EHRComparison.tsx line 121)

Plausible (emergency_numbers table covers 50+ countries) but unverified against IDD drug coverage. Should verify or soften to "Global coverage".

---

## Part 2: "Coming Soon" Features -- Implementation Effort Estimates


| Feature                       | Current State                                           | Effort to Implement                                                                                                                             | Priority          |
| ----------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **Refill reminders**          | `refill_date` column exists, no trigger logic           | 2-3 hours. Add a check in `check-care-alerts` or new edge function that queries medications with `refill_date` approaching, sends notification. | Medium            |
| **Calendar integration**      | Removed from claims (now says "Calendar view of doses") | N/A -- claim was softened. Actual iCal export would be 4-6 hours.                                                                               | Low               |
| **Guidance templates**        | Database schema planned in future-roadmap.md            | 4-6 hours. Create `guidance_templates` table, add "Save as Template" to CreateGuidanceDialog, template picker UI.                               | Medium            |
| **Advanced analytics**        | Basic stats exist on dashboard                          | 6-8 hours. Add trend charts, cohort analysis, export to PDF.                                                                                    | Medium            |
| **Team member access**        | Practice management tables exist with RBAC              | 8-12 hours. UI for practice creation, member invites, shared patient pools. Already has DB infrastructure.                                      | High              |
| **API access**                | Not started                                             | 16-24 hours. Edge functions for each resource, API key management, rate limiting.                                                               | Low (post-launch) |
| **EHR/FHIR integration**      | Stubs + DB tables exist                                 | 40+ hours. Requires real FHIR server testing, OAuth flows, data mapping.                                                                        | Low (post-launch) |
| **Priority support**          | Single contact form                                     | 2-3 hours. Add Intercom/Crisp widget, show only for paid tiers. Or simply add a priority email address.                                         | Easy win          |
| **Dedicated account manager** | Not implemented                                         | Operational, not technical. Assign once Enterprise customers exist.                                                                             | N/A               |


### Easy Wins to Implement Now

1. **Priority support differentiation** (2 hours): Add a "Priority Support" email badge/link visible only to Premium/Pro+ users in Settings.
2. **Refill reminders** (3 hours): Extend `check-care-alerts` to also check `medications.refill_date` approaching within 7 days.
3. **Disable FHIR export button** (5 min): Add `disabled` prop + "(Coming Soon)" tooltip to the Export to EHR button.

---

## Part 3: Clinician Perspective Audit -- Use Cases by Clinician Type

### Private Practice Doctor (GP/Family Medicine)

**Primary use**: Monitor chronic disease patients between visits.
**Flow**: Sign up -> Invite patients via email -> View patient vitals/adherence dashboard -> Send guidance -> Set vital alerts.
**OneCare covers**: Patient invitations, vital monitoring, guidance, adherence analytics, alert rules.
**Gap**: No appointment scheduling, no billing integration, no prescription writing. These are OUT OF SCOPE -- OneCare is a care coordination layer, not an EHR replacement.

### Specialist (Cardiologist, Endocrinologist, etc.)

**Primary use**: Monitor referred patients' vitals between specialist visits.
**Flow**: Patient shares data via invite code -> Specialist views relevant vitals (BP for cardiology, glucose for endocrinology).
**OneCare covers**: Multi-provider data sharing, vital filtering by type, trend charts.
**Gap**: No specialty-specific views or protocols. The vital types cover the basics (BP, glucose, heart rate, weight) but lack specialty-specific panels. **Easy win**: Add preset vital dashboards per specialty (e.g., "Cardiology View" = BP + heart rate + weight).

### Hospital-Based Doctor

**Primary use**: Post-discharge monitoring.
**OneCare covers**: This is OneCare's core value prop. Patient shares data after discharge, doctor sees updates.
**Gap**: No integration with hospital EHR systems (Epic, Cerner). This is the EHR integration roadmap item. Also no multi-seat institutional licensing -- the practice management infrastructure exists but UI is minimal.

### Nurse / Nurse Practitioner

**Primary use**: Patient education, medication management, care coordination.
**OneCare covers**: Guidance tools, adherence monitoring, vital alerts.
**Gap**: No care plan templates, no wound care tracking, no nursing-specific assessments. Care plans are listed as "Coming Soon" in the quick actions dropdown. **Moderate effort** to add structured care plan templates.

### Hospice / Palliative Care

**Primary use**: Family caregiver coordination, comfort medication tracking.
**OneCare covers**: Care Circle alerts, family member profiles, medication tracking.
**Gap**: No end-of-life specific tools, no symptom scoring (e.g., Edmonton Symptom Assessment), no advance directive storage. **Mostly out of scope** for launch but the Care Circle + caregiver alerts are directly relevant.

### Pharmacist

**Primary use**: Medication interaction checking, refill management, patient education.
**OneCare covers**: Drug interaction checker, medication database (IDD + FDA), medication photo ID.
**Gap**: No pharmacy dispensing integration, no refill management workflow, no prescription verification. Pharmacists would primarily use OneCare as a patient-facing companion tool. **Partially in scope** -- the interaction checker and medication database are strong fits.

### Radiologist

**Primary use**: Not a strong fit. Radiologists interpret imaging studies, which OneCare doesn't handle.
**OneCare relevance**: Minimal. Could potentially receive lab report uploads but this is a stretch.
**Verdict**: **Out of scope.** Do not market to radiologists.

### Community Health Worker (CHW)

**Primary use**: Patient sign-up assistance, basic health monitoring, medication adherence support.
**OneCare covers**: PWA mobile access, simple vitals entry, medication reminders.
**Gap**: No offline-first data entry (critical in rural areas), no simplified "CHW mode" with reduced UI complexity. **Important for Africa launch** -- consider a simplified onboarding flow.

### Summary: Clinician Coverage Matrix

```text
Clinician Type          | Fit   | Key Features Used                    | Key Gaps
------------------------|-------|--------------------------------------|---------------------------
Private Practice GP     | HIGH  | Full platform                        | No scheduling/billing
Specialist              | HIGH  | Vitals, multi-provider sharing       | No specialty presets
Hospital Doctor         | HIGH  | Post-discharge monitoring            | No EHR integration
Nurse/NP               | MED   | Guidance, adherence, alerts          | No care plan templates
Hospice/Palliative     | MED   | Care Circle, family profiles         | No symptom scoring
Pharmacist             | MED   | Drug interactions, medication DB     | No dispensing workflow
Radiologist            | LOW   | N/A                                  | Out of scope
Community Health Worker | MED   | Mobile access, simple tracking       | No offline mode
```

---

## Part 4: Funding Strategy Update -- Global Outlook

The current `docs/funding-strategy.md` is overly Africa-centric. OneCare is starting in Africa to prove concept, but the funding document should reflect the global ambition. Key updates:

### Changes to Make

1. **Reframe the narrative**: Change from "African health-tech startup" to "Global health platform proving concept in Africa's underserved markets." This is a stronger pitch -- Africa is a harder market to crack, so if it works there, it works everywhere.
2. **Add global-stage investors** alongside Africa-focused ones:
  - **Phase 1**: Add global health-tech angels (AngelList Health, HAX Bio)
  - **Phase 2**: Add global pre-seed firms (Precursor Ventures, Village Global, Techstars Health)
  - **Phase 3**: Add US/EU health-tech VCs (General Catalyst Health, a]6z Bio, Andreessen Horowitz, Rock Health, Khosla Ventures)
3. **Add global grant programs**:
  - **WHO Digital Health** grants
  - **Wellcome Trust** (global health innovation)
  - **Rockefeller Foundation** (health equity)
  - **UNICEF Innovation Fund** (open-source health tools)
4. **Reframe the "Geographic Misalignment" warning**: Keep it, but add nuance -- the right global investor who understands emerging-market-first strategies (like Stripe starting in Ireland, Flutterwave starting in Nigeria) is actually ideal.
5. **Add a "Pitch Narrative" section**: "We're building the Stripe of patient health data -- starting where the need is greatest. Africa has 1.4 billion people, minimal EHR infrastructure, and the fastest-growing smartphone adoption in the world. If we can solve care coordination here, we can solve it anywhere."
6. **Update valuation benchmarks**: Reference comparable global health-tech valuations (Hims & Hers $2B, Ro $7B, Noom $3.7B at Series F) to show the market potential justifies global investor interest.

---

## Part 5: Implementation Steps

### Step 1: Fix remaining "real-time" claims

Files: `Features.tsx`, `Footer.tsx`, `EHRComparison.tsx`, `useClinicianSubscription.ts`, `ClinicianSubscriptionSuccess.tsx`

### Step 2: Fix remaining false/misleading claims

- About.tsx: Confirm `'50K+'` drug database stat and change to `'Comprehensive'` if significantly less or indicate actual number. 
- ClinicianWhyOneCare.tsx: Disable FHIR export button for now and document for future implementations 
- useClinicianSubscription.ts: Add "(coming soon)" to EHR/FHIR, dedicated account manager
- pricing-constants.ts: Add "(coming soon)" to Priority support

### Step 3: Implement easy wins

- Add priority support email differentiation (2 hours)
- Refill reminder logic in check-care-alerts (3 hours)

### Step 4: Update funding strategy document

Rewrite `docs/funding-strategy.md` to reflect global outlook while maintaining Africa-first launch narrative. Also note various funding sources and amounts and likelihood of obtaining the grant/funding as outlined earlier in this plan. 

### Step 5: Create clinician use-case reference

Add coverage matrix to `docs/clinician-gaps-implementation-plan.md` for internal reference. Also document clinician ICP as mentioned in the plan and those that OneCare is not focused on. Also include clinicians that work on medical trials as a way to track the health of the peoplein the trial - document that as a specific use case that OneCare can support and also include it in future plans docs as something to work on depending on adoption of the platform and what is priority as we progress. 