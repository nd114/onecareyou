# OneCare - Future Roadmap

## Overview
This document outlines planned features that are not yet implemented but are part of the product vision.

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
- [ ] **API Connections**: Allow clinicians to connect external platforms via APIs (EHR systems, practice management tools)
- [ ] **Hospital Access Permissions**: Role-based access for hospital administrators to manage clinician accounts

### EHR Integration - Veradigm (Vericlaim) & HealthBridge Clinical

#### Database Schema
- [ ] `ehr_connections` table:
  - `id`, `clinician_id` (FK to clinician_profiles), `provider_type` ('veradigm' | 'healthbridge')
  - `provider_name`, `access_token` (encrypted), `refresh_token` (encrypted)
  - `token_expires_at`, `fhir_base_url`, `patient_id_mapping` (JSONB)
  - `last_sync_at`, `sync_status` ('pending' | 'active' | 'error'), `error_message`
- [ ] `ehr_sync_logs` table:
  - `id`, `connection_id` (FK), `sync_type` ('import' | 'export')
  - `resource_type` ('Patient' | 'Medication' | 'Observation'), `record_count`
  - `status` ('success' | 'partial' | 'failed'), `error_details` (JSONB)

#### Edge Functions
- [ ] `ehr-oauth-callback` - Handle OAuth callbacks, exchange codes for tokens, store encrypted
- [ ] `ehr-refresh-token` - Background token refresh before expiry
- [ ] `ehr-sync-patients` - Fetch FHIR Patient resources, map to provider_shares
- [ ] `ehr-sync-vitals` - Bidirectional Observation sync (LOINC code mapping)
- [ ] `ehr-sync-medications` - MedicationRequest/MedicationStatement sync (RxNorm mapping)

#### Frontend Components
- [ ] EHR Connections section in ClinicianSettings.tsx
- [ ] `ConnectEHRDialog.tsx` - Provider selection, OAuth flow initiation
- [ ] `EHRSyncSettings.tsx` - Auto-sync toggle, frequency, resource selection, sync history

#### Provider-Specific Notes
**Veradigm (Vericlaim)**
- Register at Veradigm Developer Portal
- SMART on FHIR launch flow
- Scopes: `patient/*.read`, `observation/*.read`, `medication/*.read`

**HealthBridge Clinical**
- Contact HealthBridge for API credentials
- JWT authentication + FHIR R4
- Practice-specific endpoint configuration

#### Data Flow
- [ ] Patient matching: Check provider_shares by email, create or prompt for match
- [ ] FHIR ↔ local schema transformation utilities
- [ ] Timestamp-based conflict resolution with clinician review flags
- [ ] Audit logging for all imports/exports

### Compliance
- [ ] HIPAA compliance documentation
- [ ] Audit logging for data access
- [ ] Clinician verification system (license validation via medical boards)
- [ ] OAuth tokens encrypted at rest
- [ ] All FHIR API calls server-side via edge functions
- [ ] RLS policies for connection data isolation

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
Allow clinicians to email documents to a patient-specific address, and have those documents automatically appear on the patient's OneCare platform.

### How It Works
1. Each patient gets a unique inbound email address (e.g., `patient-abc123@docs.onecare.app`)
2. Clinicians send documents (PDFs, lab results, care instructions) to that address
3. System receives the email, validates sender, parses attachments
4. Documents appear in patient's "Documents" section on the platform

### Technical Requirements

#### Email Receiving Service
- [ ] **Resend Inbound Webhooks** or **SendGrid Inbound Parse** to receive emails
- [ ] Configure DNS (MX records) for subdomain like `docs.onecare.app`
- [ ] Webhook endpoint edge function to process incoming emails

#### Database Changes
- [ ] `patient_documents` table:
  - `id`, `user_id`, `title`, `file_type`, `storage_path`, `source_type` (email/upload/clinician)
  - `sender_email`, `sender_name`, `received_at`, `is_read`, `clinician_user_id`
- [ ] `patient_inbound_emails` table:
  - `id`, `user_id`, `email_address` (unique generated address)
  - `is_active`, `created_at`

#### Edge Functions
- [ ] `process-inbound-email` - webhook handler for email service
  - Validate sender against known clinicians (provider_shares)
  - Extract attachments
  - Parse PDFs/images if needed (OCR for lab results)
  - Store files in Supabase Storage
  - Create document records
  - Notify patient of new document
- [ ] `generate-patient-inbox` - create unique email address for patient

#### Storage
- [ ] Create `patient-documents` storage bucket (private)
- [ ] RLS policies for patient + their authorized clinicians

#### Frontend Components
- [ ] `DocumentsPage` - view all received documents
- [ ] `DocumentViewer` - in-app PDF/image viewer
- [ ] `DocumentSettings` - manage inbound email address, toggle on/off
- [ ] Patient dashboard widget showing unread document count

### Security Considerations
- [ ] Validate sender email matches authorized clinician in provider_shares
- [ ] Rate limiting on inbound email processing
- [ ] Virus/malware scanning on attachments (via service like ClamAV or cloud scanner)
- [ ] File type whitelist (PDF, JPG, PNG, DOCX only)
- [ ] Max file size limits (10MB per attachment, 25MB total per email)

### Alternative Approaches
1. **Direct Upload Portal**: Instead of email, clinicians upload via web portal
   - Simpler to implement, no email infrastructure needed
   - Less convenient for clinicians used to email workflows
2. **Fax-to-Digital**: Integrate with eFax service for legacy workflows
3. **Hybrid**: Support both email ingest AND portal upload

### Estimated Effort
- Email infrastructure setup: 2-3 days
- Edge function development: 2-3 days
- Database & storage: 1 day
- Frontend components: 3-4 days
- Testing & security review: 2-3 days
- **Total: ~2 weeks**

---

## Phase 7: Analytics Enhancements (PLANNED)

### Chart Features
- [x] Expandable full-screen chart modals with detailed statistics
- [ ] Date range selector (7 days, 30 days, 90 days, 1 year, custom)
- [ ] Export chart as PNG image for sharing with clinicians
- [ ] Zoom and pan for dense data exploration

### Advanced Analytics
- [ ] Overlay multiple metrics on one chart (e.g., glucose + weight correlations)
- [ ] Chart annotations - mark events on timeline (medication changes, lifestyle events)
- [ ] Shareable chart snapshots - generate links/PDFs for clinician review
- [ ] Trend predictions with confidence intervals
- [ ] Weekly/monthly summary reports with key insights

---

## Phase 8: Advanced Features (FUTURE)

### AI-Powered
- [ ] Medication interaction checker (enhanced version with database)
- [ ] Health trend analysis and insights
- [ ] Personalized health recommendations
- [ ] Lab report OCR and analysis (enhanced)

### Notifications
- [ ] SMS notifications (requires Twilio/similar)
- [ ] Scheduled email reports (weekly/monthly)
- [ ] Custom notification schedules

### Integrations
- [ ] Apple HealthKit sync
- [ ] Google Fit sync
- [ ] Pharmacy integration for refills
- [ ] Telehealth appointment booking

---

## Phase 7: Subscription & Payments (PLANNED)

### Stripe Integration
- [ ] Payment processing for subscription tiers
- [ ] Family tier ($9.99/month) - up to 6 family members
- [ ] Premium tier ($19.99/month) - advanced features
- [ ] Enterprise/Clinician pricing for practices
- [ ] Subscription management portal
- [ ] Payment history and invoices

### Tier Enforcement
- [ ] Feature gating based on subscription
- [ ] Grace period handling
- [ ] Upgrade prompts in UI

### Care Alerts Tier Limits
- [ ] Add `max_care_contacts` column to profiles table (default: 1 for free, unlimited for premium)
- [ ] Update CareAlertSettings component to check user's plan/max_care_contacts
- [ ] Show upgrade prompt when limit reached
- [ ] Free users: 1 care contact allowed
- [ ] Premium users: Unlimited care contacts

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

### Documentation
- [ ] API documentation
- [ ] User guide/help center content
- [ ] Developer contribution guide

---

## Notes

### Emergency Numbers
Pre-filled for 50+ countries. For countries not in the database, users should check local emergency services. Sources:
- https://travel.state.gov/content/dam/students-abroad/pdfs/911_ABROAD.pdf
- https://www.dt.com/ca/wp-content/uploads/2017/03/Global-_911_Emergency-Contacts.pdf

### Email Functionality
Currently hidden pending Resend configuration. Re-enable in `ExportDialog.tsx` when ready.

### Clinician Verification
Currently trust-based. Future implementation should validate license numbers with medical boards.

### Clinician API Connections
Clinicians should be able to connect external platforms via APIs for:
- Pulling patient data from existing EHR systems
- Syncing vitals and medications with practice management software
- Integration with lab systems for direct result imports

### Unit Preferences
- [x] Settings page allows changing glucose (mg/dL vs mmol/L), weight (kg vs lbs), temperature (°C vs °F)
- [ ] Apply unit conversion in vitals charts and history views automatically

### Custom Vital Notes for Clinicians
Patients can add notes to vital readings that are visible to clinicians for context (e.g., "Measured after morning exercise", "Urine output: 500ml", etc.)
