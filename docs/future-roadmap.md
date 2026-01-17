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

### EHR Integration
- [ ] FHIR-compatible data export
- [ ] Webhook endpoints for external systems
- [ ] OAuth-based API access for bidirectional sync
- [ ] Integration with VeriClaim, HealthBridge Clinical

### Compliance
- [ ] HIPAA compliance documentation
- [ ] Audit logging for data access
- [ ] Clinician verification system (license validation)

---

## Phase 5: Family Member Data Management (PLANNED)

### Features
- [ ] Record medications for family members
- [ ] Track vitals for family members
- [ ] View schedule for family members
- [ ] Context switching in existing pages
- [ ] Caregiver access sharing between family accounts

---

## Phase 6: Advanced Features (FUTURE)

### AI-Powered
- [ ] Medication interaction checker
- [ ] Health trend analysis and insights
- [ ] Personalized health recommendations
- [ ] Lab report OCR and analysis

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
