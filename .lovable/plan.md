# OneCare: Feature Completion Status

## All Partial Features — Verified Complete

### 1. ✅ Family Member Data Management
- `FamilyMemberSelector` in AddMedication, AddVitalDialog, UploadDocumentDialog
- `family_member_id` passed through all hooks (`useMedications`, `useVitals`, `useHealthDocuments`)
- `FamilyMemberDetail` shows filtered medications, vitals, and schedule per member
- Schedule tab shows active medications with times instead of "Coming Soon"

### 2. ✅ Alert Rules System
- `check-vital-alerts` edge function sends emails via Resend on threshold breach
- `alert_logs` table tracks all sent alerts with deduplication
- `CreateAlertRuleDialog` lets clinicians set thresholds per patient/vital type
- Auto-trigger: `addVital()` now invokes `check-vital-alerts` in background after every vital save
- `PatientGuidance` page is the patient-side guidance inbox (acknowledge/complete flow)

### 3. ✅ Clinician Subscription Limits
- `PatientLimitBanner` shows at 80%+ usage on Dashboard and Patients pages
- `InvitePatientDialog` disabled when at limit with explanation text
- `UpgradeLimitDialog` blocks actions when limits hit
- `check-clinician-subscription` edge function validates tier and patient counts

### 4. ✅ Practice Team Management
- `usePractice` hook: create practice, invite/accept/decline, RBAC permissions
- `PracticeTeamSection` in ClinicianSettings for managing members
- `PracticeInvitationsCard` in ClinicianSettings for accepting invitations
- `practice_members` table with `add_practice_owner` trigger for auto-owner on create

### 5. ✅ Patient Subscription/Payment
- `useSubscription` hook: checkSubscription, createCheckout, openCustomerPortal
- `create-checkout` and `check-subscription` edge functions wired to Stripe
- Free tier limits enforced: 3 medications, 3 Health Vault documents
- Pricing page with upgrade CTAs throughout the app

### 6. ✅ Hybrid Data Ownership
- `ClinicianDataConsentDialog`: patient chooses collaborative/patient_managed/view_only model
- `PendingClinicianRecordsBanner` renders on patient Dashboard for unlinked records
- `data_sharing_agreements` table tracks all consent decisions
- `clinician_patient_records` supports `data_sharing_model` and `linked_user_id`

### 7. EHR Integration — Deferred
- DB tables and edge functions exist but no real OAuth/FHIR connections
- Will implement when actual EHR partnerships are established

---

## Upcoming Work
- Caregiver Access System (documented in `docs/caregiver-access-system.md`)
- AI features (Patient Q&A, voice navigation)
- Regional pricing / Paystack
- Cookie Policy page
- Error tracking integration
