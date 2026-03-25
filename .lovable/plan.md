# OneCare: Sprint 1 Implementation Progress

## Completed in This Sprint

### 1. ✅ Family Member Data Tracking
- Created `FamilyMemberSelector` component for selecting who a medication is for
- Added family member selector to `AddMedication` page — passes `family_member_id` to the database
- Updated `FamilyMemberDetail` page — medications tab now shows actual medications filtered by `family_member_id` instead of "Coming Soon"
- Vitals family tracking deferred to next sprint (requires more extensive hook refactoring)

### 2. ✅ Patient Feature Gating Enforcement
- **Already implemented**: Medication limit (3 for free, unlimited for premium) enforced in `AddMedication` page with upgrade banner
- **Already implemented**: Health Vault document limit (3 for free) enforced in `HealthVault` page
- Care Circle shares remain unlimited (core free feature)

### 3. ✅ Clinician Tier Limit Enforcement
- **Already implemented**: `InvitePatientDialog` disabled when at patient limit
- **Already implemented**: `PatientLimitBanner` shows at 80%+ usage with upgrade CTA
- Created `UpgradeLimitDialog` component for blocking actions when limits hit

### 4. ✅ Alert Email Notifications
- `check-vital-alerts` edge function **already sends emails** via Resend when thresholds are breached
- Fixed branding: "Marpe" → "OneCare", sender address updated to `alerts@onecare.you`
- Deployed updated function

### 5. ⚠️ Leaked Password Protection
- Cannot be configured via available tools — requires Supabase dashboard access
- Recommendation: Enable "HaveIBeenPwned" password checking in Auth settings

---

## Remaining Sprints

### Sprint 2: Competitive Features
- Guidance Templates Library
- Patient AI Q&A Assistant
- Extended AI Consent Dialog
- WhatsApp share on Care Circle
- Session timeout for clinicians

### Sprint 3: Revenue & Growth
- Patient engagement analytics
- Practice team invite acceptance flow
- HIPAA audit logging
- Cookie Policy page
- Error tracking (Sentry)

### Sprint 4: Differentiation
- Regional pricing / Paystack
- SMS Notifications
- Practice branding
- Voice navigation
- Advisory Panel page
