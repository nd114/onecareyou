# Comprehensive Platform Audit & Analysis

## 1. Feature List Accuracy: Free vs Premium Tiers

### Current Free Tier Claims

The Pricing page claims free users get:

- Track up to 3 medications
- Drug interaction warnings
- Daily medication schedule
- Health profile storage
- Mobile-friendly access

### What Free Users ACTUALLY Get (beyond what's listed)

After auditing all routes and gating logic, free users currently have access to **far more** than what the pricing page advertises:


| Feature                                | Actually Available on Free?     | Listed on Pricing?     |
| -------------------------------------- | ------------------------------- | ---------------------- |
| 3 medications                          | Yes (enforced)                  | Yes                    |
| Drug interaction warnings              | Yes                             | Yes                    |
| Daily schedule with mark-taken/skip    | Yes                             | Yes                    |
| Health profile (onboarding)            | Yes                             | Yes                    |
| Mobile-friendly                        | Yes                             | Yes                    |
| **Vitals & lab tracking**              | **Yes - NO gating**             | Listed as Premium-only |
| **Care Circle (provider sharing)**     | **Yes - NO gating**             | Listed as Premium-only |
| **Knowledge Base**                     | **Yes - NO gating**             | Not listed at all      |
| **Medication info lookup**             | **Yes - NO gating**             | Not listed at all      |
| **Adherence reports**                  | **Yes - NO gating**             | Not listed at all      |
| **Patient guidance (from clinicians)** | **Yes - NO gating**             | Not listed at all      |
| **Push notification reminders**        | **Yes - NO gating**             | Not listed at all      |
| **Emergency contacts/info**            | **Yes - NO gating**             | Not listed at all      |
| **Dark mode / theme settings**         | **Yes**                         | Not listed at all      |
| **AI consent management**              | **Yes**                         | Not listed at all      |
| **Medication photo gallery**           | **Yes - NO gating**             | Not listed at all      |
| **Vital trend charts & analytics**     | **Yes - NO gating**             | Not listed at all      |
| **Health data export (PDF/CSV)**       | **Yes - NO gating**             | Listed as Premium-only |
| **AI lab report parsing**              | Unclear - depends on AI consent | Listed as Premium-only |


**Critical Finding**: Vitals tracking, Care Circle, adherence reports, and health data export are listed as Premium-only features on the pricing page but have **zero subscription gating** in the code. Any free user can access `/vitals`, `/care-circle`, `/adherence-report` with full functionality.

### Recommendations

**Option A**: Gate these features behind Premium (add subscription checks)
**Option B**: Make them free and update pricing to reflect reality (better for beta -- attract more users)
**Option C (Recommended for Beta)**: Keep them accessible but update pricing page to honestly reflect what's free vs premium, and add feature limits rather than full lockouts (e.g., "limited vitals tracking" for free, "unlimited" for premium)

### Premium Features That ARE Actually Gated

- Unlimited medications (enforced, limit of 3 on free)
- Family Dashboard (gated behind `hasFamilyAccess` check)

---

## 2. SSOT (Single Source of Truth) Violations

### Pricing/Feature Lists - 3 Separate Sources

Feature lists are hardcoded in **three different places** with inconsistencies:

1. `**src/pages/Landing.tsx**` (lines 79-110) - `pricingPlans` array
2. `**src/pages/Pricing.tsx**` (lines 20-48) - `freeFeatures` and `premiumFeatures` arrays
3. `**src/hooks/useSubscription.ts**` (lines 12-29) - `PRICE_INFO`

The Landing page says free gets "Basic interaction checking" while Pricing page says "Drug interaction warnings" -- slightly different wording for the same feature. Premium features also differ between the two pages.

### Medication Limit - Duplicated

`FREE_MEDICATION_LIMIT = 3` is defined independently in:

- `src/pages/Medications.tsx` (line 32)
- `src/pages/AddMedication.tsx` (line 27)

If you ever change this limit, you must update both files. This should be a single constant exported from a shared file.

### Clinician Tier Info - Well Structured

`CLINICIAN_TIER_INFO` is properly centralized in `useClinicianSubscription.ts` and imported wherever needed. This is good SSOT.

### Recommendations

- Create a `src/lib/pricing-constants.ts` file to hold all tier definitions, feature lists, Stripe price IDs, and limits
- Import from this single source across Landing, Pricing, Dashboard upgrade prompts, etc.

---

## 3. End-to-End Flow Analysis

### Patient Flows


| Flow                                       | Status | Issues Found                                          |
| ------------------------------------------ | ------ | ----------------------------------------------------- |
| Sign Up -> Onboarding -> Dashboard         | Works  | Profile name flicker during load (cosmetic)           |
| Add Medication -> Schedule -> Mark Taken   | Works  | None                                                  |
| Hit 3-med limit -> Upgrade prompt          | Works  | Gating is functional                                  |
| Vitals -> Add -> View Analytics -> Export  | Works  | **No premium gating despite being listed as premium** |
| Care Circle -> Create Share -> Copy Link   | Works  | **No premium gating despite being listed as premium** |
| Family Dashboard -> Premium gate           | Works  | Properly gated                                        |
| Settings -> Manage Subscription            | Works  | Portal opens in new tab                               |
| Knowledge Base -> Topic -> Medication Info | Works  | None                                                  |


### Clinician Flows


| Flow                                 | Status | Issues Found          |
| ------------------------------------ | ------ | --------------------- |
| Clinician Sign Up -> Dashboard       | Works  | None                  |
| Invite Patient -> Patient Accepts    | Works  | None                  |
| View Patient Vitals -> Send Guidance | Works  | None                  |
| Alert Rules -> Vital Alert Triggers  | Works  | None                  |
| Subscription -> Solo/Pro checkout    | Works  | None                  |
| Patient Limit Enforcement            | Works  | Banner shows at limit |


### Edge Cases / Bugs Identified

1. **Profile name flicker**: "demo patient 1" briefly shows before "James Thompson" loads - this is the auth metadata vs profile table load race condition. Cosmetic only.
2. **Landing page says "Join thousands of patients"** (line 388) - misleading for a beta platform with few users. Should say something like "Join early adopters" or "Be among the first."
3. `**/clinician/patient/:inviteCode` route is NOT protected** (App.tsx line 92) - This public route could expose patient data if the invite code is guessed or leaked. The edge function `get-shared-patient-data` should validate access, but the route itself has no auth guard.
4. **Admin import page has no protection** (App.tsx line 205) - `/admin/import` is accessible to anyone who knows the URL.

---

## 4. Security & Data Leak Assessment

### Database Security (Linter Results)

- 1 WARNING: An RLS policy using `USING (true)` or `WITH CHECK (true)` exists. This is an overly permissive policy that should be investigated.
- No ERROR or FATAL level database issues found in recent logs.

### Potential Data Leak Vectors

1. **Unprotected `/clinician/patient/:inviteCode` route**: Anyone with an invite code can potentially view patient data without authentication. The route is public in App.tsx.
2. **Unprotected `/admin/import` route**: The admin import page for IDD data has no auth protection.
3. **Overly permissive RLS policy**: The linter flagged at least one policy with `true` as the condition, which allows unrestricted access.
4. **No EXIF stripping** on uploaded images (previously identified) - metadata in uploaded photos could contain GPS coordinates or other PII.

### What's Secure

- PII stripping in lab report parsing is comprehensive (10+ regex patterns)
- On-device OCR via Tesseract.js for initial processing
- Provider share expiration enforcement in RLS
- Clinician access verification before guidance/alerts
- Consent logging and audit trails
- HIPAA audit logging tables exist

### Uptime

- No database errors in recent logs (zero ERROR/FATAL/PANIC entries)
- Edge functions are deployed and operational
- No obvious crash-inducing bugs identified in the codebase

---

## 5. Should Pricing Be on the Home Page?

### Current State

The Landing page already includes a pricing section (lines 264-328) with a simplified 2-tier comparison (Free vs Premium at $9.99/month).

### Analysis

**Yes, keeping it is the right call for beta**, because:

- Reduces friction: users see value proposition + pricing without extra navigation
- The simplified version on Landing works well (detailed version lives at /pricing)
- Conversion path is clear: hero CTA -> features -> pricing -> sign up

**However**, during beta, consider:

- Emphasizing "Free forever" more prominently since the goal is user acquisition
- Making the Premium upgrade feel optional, not required
- The Landing pricing section doesn't mention annual pricing (only shows $9.99/month) while the full Pricing page has annual toggle -- this is a minor SSOT issue

---

## 6. Value Proposition for Clinicians (Business Case)

Here's how to frame the platform for business-minded clinicians:

### Revenue Generation

- **Patient retention**: Continuous remote monitoring keeps patients engaged between visits, reducing churn to competing practices
- **Upsell premium services**: Offer "connected care" as a value-add service patients pay for (the platform handles the tech)
- **Larger patient panels**: With real-time alerts, clinicians can safely manage more patients without proportional staff increases

### Cost Reduction

- **Fewer emergency visits**: Early vital alerts catch deterioration before it becomes a crisis (e.g., rising HbA1c, BP spikes)
- **Reduced admin overhead**: No manual data entry -- patients self-report vitals digitally
- **No IT infrastructure cost**: $79-$399/month vs tens of thousands for traditional EHR setup/maintenance
- **No hardware**: Patients use their own devices

### Loss Prevention

- **Malpractice risk reduction**: Documented guidance delivery, audit trails, and continuous monitoring demonstrate standard of care
- **Compliance documentation**: HIPAA audit logs, BAA for enterprise, consent tracking -- all built-in
- **Patient non-adherence visibility**: Clinicians can see medication adherence trends and intervene early, reducing adverse outcomes

### Competitive Advantage

- **Differentiation**: "My practice offers continuous connected care" -- a marketing edge over traditional practices
- **Patient satisfaction**: Patients feel monitored and cared for even outside appointments
- **Data-driven care**: Trend charts and analytics give clinicians better insight than periodic snapshots

### Suggested Marketing Angle for Email Outreach

"Stop losing patients between appointments. OneCare gives your practice real-time visibility into patient vitals, medication adherence, and health trends -- for less than your monthly coffee budget. Your patients self-report. You get alerts when something's wrong. No IT team needed."

---

## Implementation Plan

### Priority 1: Fix SSOT Issues

- Create `src/lib/pricing-constants.ts` with all tier definitions, feature lists, and limits
- Update Landing.tsx, Pricing.tsx, AddMedication.tsx, and Medications.tsx to import from the single source
- Remove duplicated `FREE_MEDICATION_LIMIT` declarations

### Priority 2: Update Feature Lists to Match Reality

- Audit every feature against actual gating and update the pricing page accordingly
- Decide which features to gate vs. keep free during beta - I will tell you.
- Update Landing page pricing section to match

### Priority 3: Security Fixes

- Add `ProtectedRoute` wrapper to `/admin/import`
- Investigate the overly permissive RLS policy flagged by the linter
- Review `/clinician/patient/:inviteCode` public route security

### Priority 4: Copy Fixes

- Change "Join thousands of patients" to beta-appropriate language
- Ensure Landing and Pricing page feature descriptions use identical wording