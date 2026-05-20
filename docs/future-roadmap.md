# OneCare - Future Roadmap

## Overview
This document outlines planned features that are not yet implemented but are part of the product vision.

> **Last verified:** May 20, 2026 — most "Phase 3 → Phase 7" items below have shipped at least partially. Status flags below have been re-checked against the live codebase.

> **Companion docs (read these first for current strategic direction):**
> - [`docs/comprehensive-platform-review.md`](./comprehensive-platform-review.md) — May 2026 audit (logic breaks, gaps, quick fixes applied)
> - [`docs/tech-and-process-opportunities.md`](./tech-and-process-opportunities.md) — 2025–2026 new tech & GTM opportunities
> - [`docs/ui-redesign-plan.md`](./ui-redesign-plan.md) — Deferred full redesign (Phase A–D)

## Confirmed P3 sequence (May 2026)

1. **Family member context-switching** (Vitals/Meds/Schedule/Vault/Adherence) — biggest patient-side credibility bug.
2. **In-app secure messaging** (HIPAA chat) — #1 competitor gap; reinforces "one continuous record" wedge.
3. **Clinician shell improvements** — Templates library + Triage Inbox + expose buried features (Practice/Team/EHR/Analytics/BAA) in nav. UI shell rebuild deferred to redesign plan.
4. **Patient subscription/payment polish** — consistent Stripe checkout surfacing + tier-gated UI prompts.
5. **EHR integration via QHIN** (Particle Health / Health Gorilla) — pivot from per-EHR FHIR to one QHIN integration.
6. **Ambient scribe + voice entry** — defensible AI differentiator.

## NB items captured from May 2026 audit

These were inline annotations on the audit plan; logged here so they don't get lost.

- **AI Assistant — medication knowledge base (from audit P8 NB).** Extend the patient AI Assistant so it can answer medication-specific questions (interactions, side effects, missed doses, food/alcohol cautions) grounded in the existing medication knowledge sources (RxNav, FDA label data, the `medication_info` cache). Hard constraints: no dosage changes, no diagnostic claims, always recommend contacting the prescriber for changes, never override safety alerts. Surface the FAB on `/medications` and `/add-medication` too, not only the Dashboard.
- **Health news & medical updates feed (from audit §1.2 NB).** Curated, opt-in feed surfacing items relevant to the patient's own medication list and conditions: discontinued/recalled medications (FDA enforcement reports), formulation changes, generic availability, and notable new treatments/guidelines. Dashboard widget plus a `/news` page, filtered against the patient's actual meds/conditions. Future: clinicians can pin items to a patient.
- **Additional tech opportunities (from audit §3 NB).** Logged in [`docs/tech-and-process-opportunities.md`](./tech-and-process-opportunities.md) — see "Additional opportunities (May 2026 follow-up)".





## ✅ IMPLEMENTED: Sprint 1 & Sprint 3 (Partial)

### Sprint 1: Emergency Numbers UI ✅
- [x] EmergencyInfoCard component with country-specific numbers
- [x] EmergencySettingsSection in Settings page
- [x] Country selector and personal emergency contact inputs
- [x] Database: country_code column added to profiles

### Sprint 1: Patient Invitation System ✅
- [x] patient_invitations table with RLS policies
- [x] usePatientInvitations hook
- [x] InvitePatientDialog for clinicians
- [x] PendingInvitationsCard for patients to accept/decline

### Sprint 1: Access Audit Logging ✅
- [x] access_audit_logs table with RLS policies
- [x] Logging on invitation acceptance

### Sprint 3: EHR Connection Infrastructure ✅
- [x] ehr_connections and ehr_sync_logs tables with RLS
- [x] useEHRConnections hook
- [x] EHRConnectionsSection in ClinicianSettings
- [x] Provider list (Veradigm, HealthBridge, Generic FHIR, Manual Import)

### Sprint 3: Patient Detail View ✅
- [x] ClinicianPatientDetail page at /clinician/patient/:inviteCode
- [x] Vitals, Medications, Adherence, Guidance, Notes tabs
- [x] Quick stats and risk indicators
- [x] Integration with CreateGuidanceDialog and CreateAlertRuleDialog

---

## ✅ IMPLEMENTED: Bulk Patient Onboarding & Data Ownership

### Bulk Import System ✅
- [x] `clinician_patient_records` table for clinician-owned patient data
- [x] `data_sharing_agreements` table for formal consent tracking
- [x] `import-patient-records` edge function (CSV batch processing, deduplication)
- [x] Bulk import UI at `/clinician/patients/import`
- [x] Connected/Managed tabs on clinician patient list

### Patient Activation Flow ✅
- [x] `usePendingClinicianRecords` email-based matching
- [x] `ClinicianDataConsentDialog` with 4 sharing models (Collaborate/Ownership/View-Only/Decline)
- [x] `PendingClinicianRecordsBanner` auto-prompts on patient dashboard
- [x] Data merging: creates `data_sharing_agreements` + `provider_shares`

### Management Enhancements ✅
- [x] Invite to OneCare button per managed record
- [x] Per-patient tag management
- [x] Inline record editing dialog (full CRUD)
- [x] Advanced filtering by tags, conditions, invitation status

---

## Phase 2: Sprint 2 Features (PLANNED)

### Hybrid Data Ownership Implementation
- [x] `clinician_patient_records` table for clinician-owned notes/assessments (done above)
- [ ] Revocation behavior: clinician retains own notes on access revocation
- [ ] Historical data snapshots on revocation
- [ ] Patient read-only access to clinician's guidance history

### Guidance Templates Library
- [ ] `guidance_templates` table (clinician_user_id, title, instruction, category, is_shared, usage_count)
- [ ] GuidanceTemplatesLibrary.tsx component
- [ ] "Save as Template" option in CreateGuidanceDialog
- [ ] Quick-apply from template

### Internal API Framework Scaffolding
- [ ] `api_keys` table (user_id, key_hash, key_prefix, permissions, rate_limit_per_minute)
- [ ] Edge functions: api-patients, api-vitals, api-medications, api-guidance
- [ ] API authentication middleware
- [ ] Rate limiting implementation
- [ ] Standardized API response format

---

## Phase 3: Alert Rules System (PLANNED)

### Backend Work
- [ ] Edge function: `check-vital-alerts` - triggered when vitals are recorded
- [ ] Edge function: `process-guidance-resends` - scheduled function for auto-resend
- [ ] Edge function: `send-clinician-alert` - email alerts to clinicians

### Features
- [ ] AlertRuleBuilder UI component for clinicians
- [ ] Real-time vital checking against threshold rules
- [ ] Email notifications when thresholds breached
- [ ] Emergency prompt system for dangerous readings
- [ ] Patient-side notification of critical readings

### Patient-Side
- [ ] GuidanceInbox component - view pending instructions
- [ ] EmergencyAlert modal - appears for dangerous readings
- [ ] Pre-filled emergency numbers with "Call Now" button
- [ ] Dashboard badge for pending guidance count

---

## Phase 4: Provider Dashboard & EHR Integration (PLANNED)

### Provider Features
- [x] Multi-patient overview dashboard (`/clinician/dashboard`, `/clinician/patients`)
- [x] Bulk guidance sending (per-patient + practice-wide guidance dialogs)
- [x] Patient health trends visualization (Patient Engagement Widgets — Pro+)
- [ ] Appointment scheduling integration
- [ ] **API Connections**: Allow clinicians to connect external platforms via APIs

### EHR Integration - Full Implementation
- [x] Connection management UI + `ehr_connections` / `ehr_sync_logs` tables
- [x] Scheduled sync edge function (`scheduled-ehr-sync`)
- [x] EHR export edge function (`ehr-export`)
- [x] Source-tracking on vitals (manual vs imported)
- [ ] OAuth callback edge functions (per-vendor)
- [ ] Real bidirectional FHIR sync (Veradigm, HealthBridge connectors)
- [ ] LOINC + RxNorm mapping utilities
- [ ] Conflict resolution UI

### Compliance
- [x] HIPAA compliance documentation (`docs/`, BAA flow at `/clinician/baa`)
- [x] `hipaa_audit_logs` table + `useHipaaAuditLog` hook
- [x] Clinician session timeout (`useSessionTimeout`)
- [ ] Clinician license validation against external boards
- [ ] OAuth tokens encrypted at rest (vault wrap)

---

## Phase 5: Family Member Data Management ✅ PARTIAL

### Features
- [x] Record medications for family members
- [x] Track vitals for family members
- [x] View schedule for family members (`/family`, `/family/:memberId`)
- [ ] Context switching directly inside core pages (Vitals/Meds/Schedule)
- [ ] Caregiver access sharing between family accounts (delegated caregiver intent only)

---

## Phase 6: Clinician-to-Patient Document Sharing (PLANNED)

### Overview
Allow clinicians to email documents to a patient-specific address for automatic platform ingestion.
Health Vault upload + per-document sharing already exists; the inbound-email path is what is still missing.

### Technical Requirements
- [x] Health Vault storage (`health-documents` bucket, `health_documents` table)
- [x] Per-document sharing (`document_shares`, 5-min signed URLs)
- [ ] Email receiving service (Resend Inbound Webhooks or SendGrid)
- [ ] `patient_inbound_emails` table
- [ ] `process-inbound-email` edge function

---

## Phase 7: Subscription & Payments ✅ MOSTLY SHIPPED

### Stripe Integration
- [x] Stripe customer + subscription flow for clinicians (`check-clinician-subscription`)
- [x] Clinician tiers: Solo / Pro / Enterprise (single source of truth in `pricing-constants.ts`)
- [x] Subscription success page + Stripe webhook
- [ ] Patient-side Family / Premium tier checkout UI surfaced consistently
- [ ] Subscription management portal (Stripe billing portal entry point)

### Tier Enforcement
- [x] Feature gating (Patient Engagement Analytics, Practice Branding, BAA gated to Enterprise)
- [x] Patient-limit enforcement on Solo/Pro
- [ ] Care Alerts tier limits on patient side (free: 1 contact, premium: unlimited)

---

## Phase 8: Advanced Features (FUTURE)

### AI-Powered — Phase 1 ✅ IMPLEMENTED
- [x] Patient AI Q&A Assistant (text-based, floating FAB on dashboard)
- [x] Voice-Guided Platform Navigation (Web Speech API → AI intent routing)
- [x] Extended AI Consent Dialog (covers Q&A, voice, vitals extraction, vault summarization)
- [x] `patient-ai-chat` edge function with system prompt, consent enforcement, rate limiting
- [x] `useAIChat` hook with message history management
- [x] AIChatDrawer + AIChatFAB components

### AI-Powered — Phase 2+ (PLANNED)
- [ ] Voice input for vitals entry (pre-fill forms via speech)
- [ ] AI-assisted clinical note extraction (clinician text → structured actions)
- [ ] Clinician voice-driven vitals entry with patient matching
- [ ] Enhanced medication interaction checker
- [ ] Health trend analysis and insights
- [ ] Personalized health recommendations

### Notifications
- [ ] SMS notifications (Twilio integration)
- [ ] Scheduled email reports (weekly/monthly)

### Integrations
- [ ] Apple HealthKit sync
- [ ] Google Fit sync
- [ ] Pharmacy integration for refills
- [ ] Telehealth appointment booking

---

## Technical Debt & Improvements

### Performance
- [ ] Optimize database queries for large datasets
- [ ] Implement data pagination
- [ ] Add caching for frequently accessed data

### Testing
- [ ] Unit tests for hooks
- [ ] Integration tests for critical flows
- [ ] E2E tests for user journeys

---

## Notes

### Emergency Numbers
Pre-filled for 50+ countries. For countries not in the database, users should check local emergency services.

### Clinician Verification
Currently trust-based. Future implementation should validate license numbers with medical boards.

### Unit Preferences
- [x] Settings page allows changing glucose (mg/dL vs mmol/L), weight (kg vs lbs), temperature (°C vs °F)
- [ ] Apply unit conversion in vitals charts automatically

---

## Advisory Panel & Governance (PLANNED)

### Clinical Advisory Board Page
- [ ] `/advisory-panel` page showcasing clinical advisors
- [ ] Advisor profile cards with credentials and expertise
- [ ] Integration with Careers page for recruitment
- [ ] Display areas of clinical specialty and guidance contributions

### Product Feedback Panel
- [ ] Display active beta testers and early adopters
- [ ] Testimonials and case studies section
- [ ] Advisory board member bios and photos
- [ ] Rotating featured advisor spotlight
