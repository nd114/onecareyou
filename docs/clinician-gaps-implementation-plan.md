# Marpe - Clinician Feature Gaps & Implementation Plan

## Overview
This document identifies gaps in Marpe's clinician offering compared to competitors and outlines an implementation plan prioritized by revenue impact.

**Last Updated:** January 2026
**Analysis Scope:** Clinician-focused features, subscription system, enterprise capabilities

---

## Gap Analysis Summary

### Competitive Landscape

| Feature | Marpe (Current) | Practice Fusion | SimplePractice | Kareo |
|---------|-------------------|-----------------|----------------|-------|
| Clinician Subscriptions | ❌ None | ✅ $149/mo | ✅ $99/mo | ✅ $110/mo |
| Patient Limits | ❌ Unlimited (no enforcement) | ✅ Tiered | ✅ Tiered | ✅ Tiered |
| Multi-Seat/Team | ❌ Not implemented | ✅ Built-in | ✅ Built-in | ✅ Built-in |
| Practice Branding | ❌ Not implemented | ✅ Full | ✅ Limited | ✅ Full |
| EHR Integration | ❌ Not implemented | ✅ Native | ✅ Via API | ✅ Built-in |
| Guidance Templates | ❌ Not implemented | ✅ Library | ✅ Templates | ✅ Built-in |
| HIPAA/BAA | ❌ No documentation | ✅ Full | ✅ Full | ✅ Full |
| API Access | ❌ Not implemented | ✅ Enterprise | ✅ Enterprise | ✅ Yes |
| SMS Notifications | ❌ Not implemented | ✅ Yes | ✅ Yes | ✅ Yes |

**Key Insight:** Marpe is currently offering clinician access for free with no resource limits, missing significant revenue opportunity.

---

## Priority Matrix

### Priority 1: CRITICAL (Revenue Blocking)
1. [Clinician Subscription System](#1-clinician-subscription-system)
2. [Clinician Pricing Page](#2-clinician-pricing-page)
3. [Resource Limits Enforcement](#3-resource-limits-enforcement)

### Priority 2: HIGH (Competitive Parity)
4. [Team/Multi-Seat Support](#4-teammulti-seat-support)
5. [Guidance Templates Library](#5-guidance-templates-library)
6. [Clinician Onboarding Flow](#6-clinician-onboarding-flow)

### Priority 3: MEDIUM (Feature Differentiation)
7. [Patient Engagement Analytics](#7-patient-engagement-analytics)
8. [Practice Branding](#8-practice-branding)
9. [SMS Notifications](#9-sms-notifications)

### Priority 4: ENTERPRISE (Sales-Driven)
10. [EHR Integration](#10-ehr-integration)
11. [HIPAA Compliance & BAA](#11-hipaa-compliance--baa)
12. [External API Access](#12-external-api-access)
13. [SLA Monitoring Dashboard](#13-sla-monitoring-dashboard)

---

## Detailed Implementation Plans

### 1. Clinician Subscription System

**Gap:** No support for clinician-specific subscriptions. `useSubscription.ts` and `check-subscription` only handle consumer tiers. Clinicians access all features free.

**Revenue Impact:** HIGH - Clinician tiers represent 81% of projected revenue

**Database Changes:**
```sql
-- Add subscription tracking to clinician_profiles
ALTER TABLE clinician_profiles ADD COLUMN subscription_tier TEXT DEFAULT 'trial';
ALTER TABLE clinician_profiles ADD COLUMN subscription_status TEXT DEFAULT 'active';
ALTER TABLE clinician_profiles ADD COLUMN subscription_ends_at TIMESTAMPTZ;
ALTER TABLE clinician_profiles ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE clinician_profiles ADD COLUMN trial_ends_at TIMESTAMPTZ DEFAULT (now() + interval '14 days');
```

**Stripe Products to Create:**
- `Clinician Solo` - $49/month (price_clinician_solo_monthly, price_clinician_solo_annual)
- `Clinician Pro` - $99/month (price_clinician_pro_monthly, price_clinician_pro_annual)
- `Clinician Enterprise` - $249/month (price_clinician_enterprise_monthly)

**Edge Functions:**
- [ ] `create-clinician-checkout` - Creates Stripe checkout for clinician plans
- [ ] `check-clinician-subscription` - Validates clinician subscription status
- [ ] `clinician-customer-portal` - Stripe customer portal for clinicians

**Frontend:**
- [ ] Update `useClinicianProfile.ts` to include subscription status
- [ ] Create `useClinicianSubscription.ts` hook
- [ ] Add subscription management to `ClinicianSettings.tsx`
- [ ] Create `ClinicianSubscriptionBanner.tsx` for trial/expired notices

**Estimated Effort:** 3-4 days

---

### 2. Clinician Pricing Page

**Gap:** Clinicians see consumer pricing. No UI to subscribe to Solo/Pro/Enterprise tiers.

**Revenue Impact:** HIGH - Directly enables monetization

**Implementation:**
- [ ] Create `src/pages/ClinicianPricing.tsx` with tier comparison
- [ ] Add pricing link to clinician navigation in `Header.tsx`
- [ ] Include feature comparison table
- [ ] Add upgrade CTAs throughout clinician dashboard

**Features per Tier:**
| Feature | Solo ($49) | Pro ($99) | Enterprise ($249) |
|---------|------------|-----------|-------------------|
| Patients | 50 | 200 | Unlimited |
| Alert Rules/Patient | 5 | Unlimited | Unlimited |
| Guidance Templates | 10 | Unlimited | Unlimited |
| Team Members | 1 | 5 | Unlimited |
| Practice Branding | ❌ | ✅ | ✅ |
| EHR Integration | ❌ | ✅ | ✅ |
| API Access | ❌ | ❌ | ✅ |
| Dedicated Support | ❌ | ❌ | ✅ |
| SLA Guarantee | ❌ | ❌ | 99.9% |
| HIPAA BAA | ❌ | ✅ | ✅ |

**Estimated Effort:** 2 days

---

### 3. Resource Limits Enforcement

**Gap:** Clinicians can add unlimited patients and alert rules, contradicting documented tier limits.

**Revenue Impact:** HIGH - Ensures upgrade conversions

**Database Changes:**
```sql
-- Create limits table for easy management
CREATE TABLE clinician_tier_limits (
  tier TEXT PRIMARY KEY,
  max_patients INTEGER,
  max_alert_rules_per_patient INTEGER,
  max_guidance_templates INTEGER,
  max_team_members INTEGER
);

INSERT INTO clinician_tier_limits VALUES
  ('trial', 5, 3, 5, 1),
  ('solo', 50, 5, 10, 1),
  ('pro', 200, -1, -1, 5),
  ('enterprise', -1, -1, -1, -1);
-- -1 = unlimited
```

**Implementation:**
- [ ] Create `useClinicianLimits.ts` hook
- [ ] Add limit checks in `useClinicianPatients.ts`
- [ ] Add limit checks in `useAlertRules.ts`
- [ ] Create `UpgradeLimitDialog.tsx` component
- [ ] Show usage indicators in clinician dashboard

**Estimated Effort:** 2 days

---

### 4. Team/Multi-Seat Support

**Gap:** No "practice" grouping or team member invitations despite being promised for Pro/Enterprise.

**Revenue Impact:** MEDIUM - Key differentiator for Pro/Enterprise upsells

**Database Changes:**
```sql
-- Practices (team container)
CREATE TABLE practices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_clinician_id UUID REFERENCES clinician_profiles(id),
  subscription_tier TEXT DEFAULT 'solo',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Practice members
CREATE TABLE practice_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id UUID REFERENCES practices(id),
  clinician_user_id UUID NOT NULL,
  role TEXT DEFAULT 'member', -- 'owner', 'admin', 'member'
  permissions JSONB DEFAULT '{}',
  invited_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ
);
```

**Implementation:**
- [ ] Create practice management UI in ClinicianSettings
- [ ] Invite team members by email
- [ ] Role-based permissions (view patients, create guidance, manage billing)
- [ ] Shared patient access within practice
- [ ] Practice-level subscription (vs individual)

**Estimated Effort:** 5-7 days

---

### 5. Guidance Templates Library

**Gap:** No ability to save/reuse guidance templates.

**Revenue Impact:** MEDIUM - Time-saver, differentiator for Pro tier

**Database Changes:**
```sql
CREATE TABLE guidance_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinician_user_id UUID NOT NULL,
  practice_id UUID REFERENCES practices(id),
  title TEXT NOT NULL,
  instruction TEXT NOT NULL,
  category TEXT,
  is_shared BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Implementation:**
- [ ] Create `GuidanceTemplatesLibrary.tsx` component
- [ ] "Save as template" option when creating guidance
- [ ] Quick-apply templates in CreateGuidanceDialog
- [ ] Pre-built starter templates for common conditions
- [ ] Template sharing within practice

**Estimated Effort:** 2-3 days

---

### 6. Clinician Onboarding Flow

**Gap:** No guided onboarding or trial experience for clinicians.

**Revenue Impact:** MEDIUM - Improves activation and conversion

**Implementation:**
- [ ] Create `ClinicianOnboarding.tsx` multi-step wizard
- [ ] Steps: Profile setup → Add first patient → Send first guidance → Set alert rule
- [ ] Progress indicators and skip options
- [ ] Trial period banner with days remaining
- [ ] "What's new" modal for feature releases

**Estimated Effort:** 2-3 days

---

### 7. Patient Engagement Analytics

**Gap:** No analytics on patient response rates or guidance completion trends.

**Revenue Impact:** LOW-MEDIUM - Value-add for retention

**Implementation:**
- [ ] Dashboard widgets showing:
  - Guidance acknowledgment rate
  - Average time to acknowledge
  - Patient vital logging frequency
  - Trending vitals across patient population
- [ ] Exportable reports (PDF/CSV)
- [ ] Time-based filtering (7d, 30d, 90d)

**Estimated Effort:** 3-4 days

---

### 8. Practice Branding

**Gap:** No custom branding options for Pro/Enterprise.

**Revenue Impact:** LOW - Nice-to-have for larger practices

**Database Changes:**
```sql
ALTER TABLE practices ADD COLUMN logo_url TEXT;
ALTER TABLE practices ADD COLUMN primary_color TEXT;
ALTER TABLE practices ADD COLUMN custom_domain TEXT;
```

**Implementation:**
- [ ] Logo upload in practice settings
- [ ] Color theme customization
- [ ] Custom domain support (CNAME)
- [ ] Branded patient communications

**Estimated Effort:** 3-4 days

---

### 9. SMS Notifications

**Gap:** SMS not implemented despite being common in competitors.

**Revenue Impact:** MEDIUM - Key for patient engagement

**Implementation:**
- [ ] Integrate Twilio or similar
- [ ] Patient phone number collection
- [ ] SMS for guidance delivery (in addition to email)
- [ ] SMS for vital alerts
- [ ] Opt-in/opt-out management

**Estimated Effort:** 4-5 days

---

### 10. EHR Integration

**Gap:** `ehr_connections` and `ehr_sync_logs` tables, edge functions, and UI not implemented.

**Revenue Impact:** HIGH for Enterprise - Major selling point

**Status:** Already documented in `docs/future-roadmap.md` Phase 4

**Estimated Effort:** 2-3 weeks

---

### 11. HIPAA Compliance & BAA

**Gap:** No BAA generation or audit logging.

**Revenue Impact:** MEDIUM - Required for Pro/Enterprise

**Implementation:**
- [ ] Create `hipaa_audit_logs` table
- [ ] Log all PHI access with user, timestamp, action
- [ ] Downloadable BAA template
- [ ] Clickwrap BAA acceptance for Pro/Enterprise
- [ ] Annual BAA renewal reminders

**Estimated Effort:** 3-4 days

---

### 12. External API Access

**Gap:** No external API for Enterprise customers.

**Revenue Impact:** LOW (niche) - Enterprise differentiator

**Implementation:**
- [ ] API key management in clinician settings
- [ ] Rate limiting per tier
- [ ] REST endpoints for patients, vitals, guidance
- [ ] Webhook support for events
- [ ] API documentation

**Estimated Effort:** 1-2 weeks

---

### 13. SLA Monitoring Dashboard

**Gap:** No uptime monitoring or SLA dashboards.

**Revenue Impact:** LOW - Enterprise requirement

**Implementation:**
- [ ] Integrate with uptime service (Uptime Robot, Better Stack)
- [ ] Display uptime percentage in Enterprise dashboard
- [ ] Historical uptime graphs
- [ ] Incident notifications

**Estimated Effort:** 2-3 days

---

## Implementation Roadmap

### Sprint 1 (Week 1-2): Revenue Foundation
- [ ] Clinician Subscription System
- [ ] Clinician Pricing Page
- [ ] Resource Limits Enforcement

**Expected Outcome:** Clinicians can subscribe, revenue starts flowing

### Sprint 2 (Week 3-4): Competitive Parity
- [ ] Team/Multi-Seat Support
- [ ] Guidance Templates Library
- [ ] Clinician Onboarding Flow

**Expected Outcome:** Feature parity with competitors

### Sprint 3 (Week 5-6): Differentiation
- [ ] Patient Engagement Analytics
- [ ] Practice Branding
- [ ] HIPAA Compliance & BAA

**Expected Outcome:** Unique value propositions

### Sprint 4 (Week 7-8): Enterprise Features
- [ ] SMS Notifications
- [ ] EHR Integration (Phase 1)
- [ ] External API Access

**Expected Outcome:** Enterprise-ready offering

### Sprint 5 (Week 9-10): Polish & Scale
- [ ] EHR Integration (Complete)
- [ ] SLA Monitoring Dashboard
- [ ] Performance optimization

**Expected Outcome:** Production-grade enterprise platform

---

## Quick Wins (Can Implement Today)

1. **Add pricing link to clinician nav** - 10 minutes
2. **Add subscription_tier column to clinician_profiles** - Migration
3. **Create clinician pricing page skeleton** - 1 hour
4. **Add trial_ends_at tracking** - 30 minutes

---

## Success Metrics

| Metric | Current | Target (3 months) |
|--------|---------|-------------------|
| Paying Clinicians | 0 | 25+ |
| Clinician MRR | $0 | $1,725+ |
| Trial → Paid Conversion | N/A | 20%+ |
| Solo → Pro Upgrade | N/A | 20%+ |
| Enterprise Contracts | 0 | 2+ |

---

## Notes

- All tier limits should be easily adjustable via database
- Consider grandfathering early beta clinicians with free access for limited time
- Enterprise deals should be handled via direct sales, not self-service
- SMS costs should be factored into pricing (Twilio ~$0.0075/message)
- EHR integration is complex; consider partnering vs building

---

## Future Feature Gaps (Role-Based Analysis)

### Doctor/Physician Perspective

The following features are commonly expected by doctors but not currently available:

| Feature | Description | Priority | Effort |
|---------|-------------|----------|--------|
| **Differential Diagnosis Notes** | Ability to document and track potential diagnoses for a patient, with reasoning and rule-out notes | MEDIUM | 3-4 days |
| **Visit History / Encounter Logs** | Chronological record of all patient interactions, including virtual and in-person visits | HIGH | 4-5 days |
| **Prescription Writing (e-Prescribe)** | Digital prescription creation with pharmacy integration (EPCS for controlled substances) | HIGH | 2-3 weeks |
| **Referral Management** | Create, track, and receive referrals to/from specialists with status tracking | MEDIUM | 1 week |
| **Lab & Imaging Orders** | Order labs/imaging through the platform with results integration | HIGH | 2-3 weeks |
| **Clinical Decision Support** | Evidence-based alerts and recommendations based on patient data | MEDIUM | 2 weeks |
| **Patient Communication Log** | Audit trail of all communications with patients (emails, calls, messages) | MEDIUM | 2-3 days |
| **Patient Summary View** | One-page overview of patient: conditions, meds, allergies, recent vitals, last visit | HIGH | 2-3 days |
| **Problem List Management** | Active/inactive problem tracking with ICD-10 codes | MEDIUM | 3-4 days |
| **Care Team Assignment** | Assign primary care team to patients (PCP, specialists, nurses) | LOW | 2-3 days |

**Implementation Notes:**
- e-Prescribe requires Surescripts integration (complex, regulatory compliance)
- Lab orders require HL7/FHIR integration with lab networks
- Clinical decision support can start simple (drug interactions) and expand

---

### Cross-Role Missing Features

Features needed across all clinical roles:

| Feature | Description | Priority | Effort |
|---------|-------------|----------|--------|
| **Secure In-App Messaging** | HIPAA-compliant direct messaging between clinicians and patients | HIGH | 1 week |
| **Appointment Scheduling** | Book, reschedule, cancel appointments with calendar integration | HIGH | 1-2 weeks |
| **Consent Form Management** | Create, send, and track signed consent forms digitally | MEDIUM | 4-5 days |
| **Patient Portal Invites** | Invite patients to create accounts and access their data | HIGH | 2-3 days |
| **Multi-Language Support** | UI and content in multiple languages for diverse patient populations | MEDIUM | 1-2 weeks |
| **Voice Dictation** | Speech-to-text for clinical notes and documentation | LOW | 3-4 days |
| **Mobile App / PWA** | Native or progressive web app for mobile clinical workflows | HIGH | 2-3 weeks |
| **Offline Mode** | Continue documenting when internet is unavailable, sync when back online | MEDIUM | 1-2 weeks |
| **Print/Fax Support** | Generate printable documents, send faxes to external providers | LOW | 3-4 days |
| **ICD/CPT Code Lookup** | Search and attach diagnosis (ICD-10) and procedure (CPT) codes | MEDIUM | 3-4 days |
| **Document Scanning/Upload** | Upload and OCR external documents into patient records | MEDIUM | 4-5 days |
| **Export to PDF** | Export patient records, vitals history, medication lists as PDFs | HIGH | 2 days |
| **Audit Trail/Activity Log** | Full audit log of who accessed/modified patient data and when | HIGH | 3-4 days |
| **Two-Factor Authentication** | 2FA for clinician accounts (required for HIPAA) | CRITICAL | 2-3 days |
| **Session Timeout Controls** | Configurable auto-logout for security compliance | HIGH | 1 day |
| **Bulk Actions** | Select multiple patients for bulk operations (send guidance, export) | MEDIUM | 2-3 days |
| **Notification Preferences** | Fine-grained control over when and how to receive notifications | MEDIUM | 2-3 days |
| **Dark Mode** | Dark theme option for clinical settings with low light | LOW | 1 day |

**Quick Wins from Cross-Role:**
1. Patient Portal Invites - Simple email with registration link
2. Export to PDF - Extend existing vitals export
3. Session Timeout Controls - Configure existing auth
4. Dark Mode - Already have theming infrastructure

---

## Related Documents

- [Pricing Roadmap](./pricing-roadmap.md) - Detailed pricing tiers
- [Future Roadmap](./future-roadmap.md) - General feature roadmap
- [Requirements Implemented](./requirements-implemented.md) - Completed features
