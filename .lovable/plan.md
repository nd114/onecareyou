# OneCare: Feature Status Audit & Implementation Plan

## Methodology

I cross-referenced all 7 planning documents (`future-roadmap.md`, `ai-implementation-roadmap.md`, `clinician-gaps-implementation-plan.md`, `comprehensive-platform-review.md`, `pricing-roadmap.md`, `launch-plan.md`, `beta-tester-pack.md`) against the actual codebase to classify every planned feature.

---

## Status Summary


| Status                | Count         |
| --------------------- | ------------- |
| Done                  | ~45 features  |
| Partially implemented | ~12 features  |
| Not started           | ~35+ features |


---

## A. PARTIALLY IMPLEMENTED (Built but incomplete)

### 1. Family Member Data Management

- **Done**: Family dashboard, add/edit members, member detail page
- **Missing**: Recording medications/vitals *for* specific family members. The `family_member_id` column exists on `medications`, `vitals`, `schedule_entries` tables but NO page-level UI passes it -- searched `src/pages` and found zero usage. Family members are profiles only; you cannot track their health data separately.
- **Effort**: 3-4 days

### 2. Alert Rules System (Phase 3 of future-roadmap)

- **Done**: `check-vital-alerts` edge function exists, `clinician_alert_rules` table, `alert_logs` table, `CreateAlertRuleDialog`
- **Missing**: Email notifications to clinicians when thresholds breach (`send-clinician-alert` function missing), patient-side emergency modal for dangerous readings, GuidanceInbox component, dashboard badge for pending guidance count, auto-resend guidance (`process-guidance-resends` missing)
- **Effort**: 4-5 days

### 3. EHR Integration

- **Done**: DB tables (`ehr_connections`, `ehr_sync_logs`), `ehr-sync` edge function, `EHRConnectionsSection` UI, `ehr-export`, `ehr-webhook`, `scheduled-ehr-sync` functions
- **Missing**: Real OAuth callback flows, FHIR-to-local schema transformation, LOINC/RxNorm code mapping, conflict resolution UI, actual working connections to Veradigm/HealthBridge (currently stubs)
- **Effort**: 2-3 weeks (enterprise feature, defer)

### 4. Clinician Subscription & Limits

- **Done**: `create-clinician-checkout`, `check-clinician-subscription` functions, `ClinicianPricing` page, `useClinicianSubscription` hook, `SubscriptionManagementCard`, `PatientLimitBanner`
- **Missing**: Actual enforcement of patient limits in `useClinicianPatients`, `clinician_tier_limits` table doesn't exist, no `UpgradeLimitDialog` blocking actions when limits hit, no dunning/failed payment handling
- **Effort**: 2-3 days

### 5. Practice/Team Management

- **Done**: `practices`, `practice_members`, `practice_patient_access` tables exist, `PracticeTeamSection`, `InviteTeamMemberDialog`, `CreatePracticeDialog` components exist
- **Missing**: Shared patient pool UI, practice-level billing, role-based permission enforcement in hooks, functional invite acceptance flow
- **Effort**: 3-4 days

### 6. Patient Subscription/Payment

- **Done**: `create-checkout`, `check-subscription`, `customer-portal` edge functions, Pricing page
- **Missing**: Feature gating enforcement (medication limits for free tier, vitals history time-gating, Care Circle share limits), no upgrade prompt when hitting limits
- **Effort**: 2-3 days

### 7. Hybrid Data Ownership (future-roadmap Phase 2)

- **Done**: `clinician_patient_records`, `data_sharing_agreements`, consent dialog, 4 sharing models
- **Missing**: Revocation behavior (clinician retains notes), historical data snapshots on revocation, patient read-only access to clinician guidance history
- **Effort**: 2-3 days

---

## B. NOT STARTED (Planned but no code exists)

### High Priority (Revenue/Launch Blocking)


| #   | Feature                                               | Source Doc                        | Effort   |
| --- | ----------------------------------------------------- | --------------------------------- | -------- |
| 1   | **Guidance Templates Library**                        | future-roadmap, clinician-gaps    | 2-3 days |
| 2   | **Patient AI Q&A Assistant**                          | ai-implementation-roadmap Phase 1 | 3-4 days |
| 3   | **Extended AI Consent Dialog** (granular per-feature) | ai-implementation-roadmap Phase 1 | 1 day    |
| 4   | **WhatsApp share button on Care Circle**              | launch-plan                       | 0.5 day  |
| 5   | **Regional pricing (NGN tiers / Paystack)**           | launch-plan                       | 3-5 days |


### Medium Priority (Competitive Parity)


| #   | Feature                                                                  | Source Doc                           | Effort   |
| --- | ------------------------------------------------------------------------ | ------------------------------------ | -------- |
| 6   | **Patient Engagement Analytics** (clinician dashboard widgets)           | clinician-gaps                       | 3-4 days |
| 7   | **SMS Notifications** (Twilio)                                           | clinician-gaps, future-roadmap       | 4-5 days |
| 8   | **Practice Branding** (logo, colors)                                     | clinician-gaps                       | 2-3 days |
| 9   | **HIPAA Audit Logging** (`hipaa_audit_logs` table + PHI access tracking) | comprehensive-review, future-roadmap | 2-3 days |
| 10  | **Cookie Policy page** (separate from Privacy)                           | comprehensive-review                 | 0.5 day  |
| 11  | **Session Timeout Controls** for clinicians                              | comprehensive-review                 | 1 day    |
| 12  | **Voice-Guided Navigation**                                              | ai-implementation-roadmap Phase 1    | 2-3 days |


### Lower Priority (Future/Enterprise)


| #   | Feature                                          | Source Doc                        | Effort                     |
| --- | ------------------------------------------------ | --------------------------------- | -------------------------- |
| 13  | Internal API Framework (api_keys, rate limiting) | future-roadmap Phase 2            | 1-2 weeks                  |
| 14  | Advisory Panel page (`/advisory-panel`)          | future-roadmap                    | 1-2 days                   |
| 15  | Voice Input for Vitals                           | ai-implementation-roadmap Phase 2 | 3-4 days                   |
| 16  | AI-Assisted Clinical Note Extraction             | ai-implementation-roadmap Phase 2 | 3-4 days                   |
| 17  | Clinician Voice-Driven Vitals Entry              | ai-implementation-roadmap Phase 2 | 5-7 days                   |
| 18  | Secure In-App Messaging                          | clinician-gaps                    | 1 week                     |
| 19  | Appointment Scheduling                           | clinician-gaps                    | 1-2 weeks                  |
| 20  | Multi-Language/Multilingual Support              | clinician-gaps, ai-roadmap        | 1-2 weeks                  |
| 21  | Apple HealthKit / Google Fit sync                | future-roadmap Phase 8            | 2-3 weeks                  |
| 22  | 2FA for clinicians                               | comprehensive-review              | 2-3 days                   |
| 23  | SLA Monitoring Dashboard                         | clinician-gaps                    | 2-3 days                   |
| 24  | e-Prescribe / Lab Orders                         | clinician-gaps (doctor gaps)      | 2-3 weeks each             |
| 25  | Meeting Transcription                            | ai-implementation-roadmap Phase 3 | Very high effort, deferred |


---

## C. COMPREHENSIVE REVIEW OPEN ITEMS (Bugs/Security)


| Item                                                 | Status                   | Priority |
| ---------------------------------------------------- | ------------------------ | -------- |
| Enable leaked password protection                    | OPEN                     | CRITICAL |
| Provider share expiration cleanup job                | NOT BUILT                | HIGH     |
| Medication with past `end_date` still showing active | NOT FIXED                | MEDIUM   |
| Push notification re-registration on expiry          | NOT BUILT                | MEDIUM   |
| Email delivery failure tracking/retry                | NOT BUILT                | MEDIUM   |
| Error tracking (Sentry)                              | NOT INTEGRATED           | HIGH     |
| Unit tests for hooks                                 | MINIMAL (1 example test) | MEDIUM   |


---

## D. RECOMMENDED IMPLEMENTATION ORDER

### Sprint 1: Launch-Critical (1-2 weeks)

1. **Family member data tracking** -- wire family_member_id into medications/vitals/schedule UIs. Complete the build and test all flows. Health Vault functionality can also incorporate family members sharing.
2. **Feature gating enforcement** -- medication limits, vitals history gating, Care Circle limits (patient subscriptions)
3. **Clinician tier limit enforcement** -- patient count caps, upgrade prompts
4. **Alert email notifications** -- `send-clinician-alert` edge function + patient emergency modal
5. **Leaked password protection** -- security fix

### Sprint 2: Competitive Features (1-2 weeks)

6. **Guidance Templates Library** -- save/reuse clinical instructions
7. **Patient AI Q&A Assistant** -- edge function + floating chat UI
8. **Extended AI Consent Dialog** -- granular consent options
9. **WhatsApp share on Care Circle** -- quick win for Nigeria launch
10. **Session timeout for clinicians**

### Sprint 3: Revenue & Growth (1-2 weeks)

11. **Patient engagement analytics** -- clinician dashboard widgets
12. **Practice team invite acceptance flow** -- functional multi-seat
13. **HIPAA audit logging**
14. **Cookie Policy page**
15. **Error tracking integration** (Sentry or similar)

### Sprint 4: Differentiation (2+ weeks)

16. Regional pricing / Paystack integration
17. SMS Notifications
18. Practice branding
19. Voice navigation
20. Advisory Panel page

### Deferred (Post-Launch)

- Internal API framework
- Voice vitals input
- AI note extraction
- In-app messaging
- Appointment scheduling
- EHR real connections
- e-Prescribe / Lab orders
- Meeting transcription
- Wearable integrations
- Multi-language support

---

## Technical Notes

- **Feature gating** is the single most impactful gap -- the pricing tiers are defined and Stripe is connected, but no code actually blocks free-tier users from using premium features. This means zero upgrade pressure.
- **Family member tracking** has the DB schema ready but zero UI integration -- the `family_member_id` is never passed when adding medications or vitals, making the Family Dashboard decorative only.
- **Alert rules** have the backend infrastructure but no notification delivery -- thresholds can be set but never trigger emails or patient alerts.
- All AI features (Q&A, voice nav, consent) from Phase 1 of the AI roadmap are completely unbuilt.
- The `requirements-implemented.md` doc is stale and missing many features that have since been built (Health Vault, Careers, bulk import, clinician subscriptions, SEO, etc.).