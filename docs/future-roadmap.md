# OneCare - Future Roadmap

## Overview
This document outlines planned features that are not yet implemented but are part of the product vision.

---

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
- [ ] Multi-patient overview dashboard
- [ ] Bulk guidance sending
- [ ] Patient health trends visualization
- [ ] Appointment scheduling integration
- [ ] **API Connections**: Allow clinicians to connect external platforms via APIs

### EHR Integration - Full Implementation
- [ ] OAuth callback edge functions (ehr-oauth-callback, ehr-refresh-token)
- [ ] Patient sync edge functions (ehr-sync-patients, ehr-sync-vitals, ehr-sync-medications)
- [ ] FHIR ↔ local schema transformation utilities
- [ ] LOINC code mapping for vitals
- [ ] RxNorm mapping for medications
- [ ] Conflict resolution with clinician review flags

### Compliance
- [ ] HIPAA compliance documentation
- [ ] `hipaa_audit_logs` table for sensitive data access
- [ ] Clinician verification system (license validation)
- [ ] OAuth tokens encrypted at rest

---

## Phase 5: Family Member Data Management (PLANNED)

### Features
- [ ] Record medications for family members
- [ ] Track vitals for family members
- [ ] View schedule for family members
- [ ] Context switching in existing pages
- [ ] Caregiver access sharing between family accounts

---

## Phase 6: Clinician-to-Patient Document Sharing (PLANNED)

### Overview
Allow clinicians to email documents to a patient-specific address for automatic platform ingestion.

### Technical Requirements
- [ ] Email receiving service (Resend Inbound Webhooks or SendGrid)
- [ ] `patient_documents` table
- [ ] `patient_inbound_emails` table
- [ ] `process-inbound-email` edge function
- [ ] `patient-documents` storage bucket
- [ ] DocumentsPage, DocumentViewer, DocumentSettings components

---

## Phase 7: Subscription & Payments (PLANNED)

### Stripe Integration
- [ ] Payment processing for subscription tiers
- [ ] Family tier ($9.99/month) - up to 6 family members
- [ ] Premium tier ($19.99/month) - advanced features
- [ ] Enterprise/Clinician pricing for practices
- [ ] Subscription management portal

### Tier Enforcement
- [ ] Feature gating based on subscription
- [ ] Care Alerts tier limits (free: 1 contact, premium: unlimited)

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
