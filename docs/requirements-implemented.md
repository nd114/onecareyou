# OneCare - Implemented Requirements

## Overview
This document tracks all implemented features and requirements for the OneCare health management platform.

---

## Phase 1: Family Dashboard (IMPLEMENTED)

### Database Schema
- [x] `family_members` table - stores family member profiles under one account
- [x] `caregiver_access` table - manages who can access family member data
- [x] Added `family_member_id` to `medications`, `vitals`, `schedule_entries` tables
- [x] RLS policies for all new tables

### Features
- [x] Family Dashboard page (`/family`) with member overview
- [x] Add Family Member dialog with health profile fields
- [x] Edit Family Member dialog
- [x] Family Member Detail page (`/family/:memberId`)
- [x] Subscription tier gating (Family plan required)
- [x] Maximum 5 family members limit
- [x] Avatar color selection for visual differentiation

### Hooks
- [x] `useFamilyMembers` - CRUD operations for family members

---

## Phase 2: Clinician Portal Enhancement (IMPLEMENTED)

### Database Schema
- [x] `clinician_profiles` table - stores clinician professional info
- [x] `clinician_guidance` table - instructions from clinician to patient
- [x] `clinician_alert_rules` table - vital threshold rules
- [x] `alert_logs` table - history of triggered alerts
- [x] `emergency_numbers` table - country-specific emergency contacts (50+ countries)
- [x] `provider_shares.clinician_user_id` - links shares to clinician accounts

### Features
- [x] Clinician Sign Up flow (`/clinician/sign-up`)
- [x] Clinician Dashboard (`/clinician/dashboard`)
- [x] Patient list view with automatic email-based connection
- [x] Guidance system structure (send instructions to patients)
- [x] Alert rules system structure
- [x] Emergency numbers database with 50+ countries
- [x] Alphabetically sorted countries and specialties
- [x] Clinician-specific navigation (no patient features in menu)

### Hooks
- [x] `useClinicianProfile` - manage clinician professional profile
- [x] `useClinicianPatients` - fetch patients who shared with clinician email
- [x] `useClinicianGuidance` - CRUD for patient guidance
- [x] `useAlertRules` - CRUD for vital alert rules
- [x] `useEmergencyNumbers` - fetch emergency numbers by country

---

## Previously Implemented Features

### Authentication & Profiles
- [x] User sign up/sign in
- [x] Protected routes
- [x] User profiles with health information
- [x] AI processing consent management
- [x] Biodata display in Settings (DOB, gender, blood type, height, allergies, conditions)

### Medications
- [x] Add/Edit/Delete medications
- [x] Medication types and frequencies
- [x] Prescription details (prescriber, pharmacy)
- [x] Medication interaction checker with severity levels
- [x] Interactions tab in Medications page

### Vitals Tracking
- [x] Record blood pressure, glucose, weight, temperature, heart rate, oxygen
- [x] Trend charts with systolic/diastolic clarity
- [x] Unit preferences (mg/dL vs mmol/L, kg vs lbs, °C vs °F)
- [x] Export to CSV/PDF
- [x] Notes field for clinician context (with helpful placeholders)
- [x] Unit conversion applied in charts and history views

### Care Circle
- [x] Share health data with providers
- [x] Invite code generation
- [x] Permission management
- [x] Provider portal view
- [x] Auto-connect clinicians when email matches

### Schedule
- [x] Medication schedule entries (real data, not dummy)
- [x] Mark as taken/skipped with reasons
- [x] Adherence tracking
- [x] Push notification reminders for pending doses
- [x] Automatic scheduling of browser notifications when on today's schedule

### Settings
- [x] Timezone selection with African timezones (GMT+1, etc.)
- [x] Unit preferences
- [x] Push notification settings
- [x] Dark mode toggle
- [x] Link to edit Health Profile

---

## Technical Improvements
- [x] Mobile-responsive UI throughout
- [x] Push notification hooks (browser notifications)
- [x] Unit conversion utilities
- [x] Medical specialty and country lists (alphabetically sorted)
- [x] Header shows Onboarding page
- [x] Mobile menu duplicate fix for clinicians

---

## Clinician Features
- [x] Clinician patient notes (private notes about patients)
- [x] Notes visible only to the clinician who created them

---

## Documentation
- [x] `docs/pricing-roadmap.md` - monetization strategy
- [x] `docs/requirements-implemented.md` - this document
- [x] `docs/future-roadmap.md` - planned features including API connections, Stripe, etc.
