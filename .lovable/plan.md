

# Implementation Plan: Header UI Fix + Demo Account Provisioning

## Part 1: Header UI Fix

### Issue
The screenshot shows "OneCareHome" appearing concatenated - the brand name "OneCare" and the first navigation link "Home" are visually too close together.

### Root Cause
In `src/components/layout/Header.tsx`, the layout uses a 3-column flexbox with `flex-1` for logo and auth sections, but the gap between the logo container and the centered navigation may be insufficient, especially when the "Home" link is close to the logo.

### Fix
Increase the gap between the logo and navigation, and ensure proper visual separation:

```tsx
// In Header.tsx, line ~164
<nav className="hidden md:flex items-center justify-center gap-6">
```

Change the container layout to ensure proper spacing:
- Add `gap-8` or `gap-10` to the main container
- Ensure the logo section has `shrink-0` to prevent compression
- Add left margin to the nav section or use `ml-6` on the first nav link

**File to modify:** `src/components/layout/Header.tsx`

---

## Part 2: Demo Account Provisioning

### Overview
Create **3 clinician** and **5 patient** demo accounts with:
- Simple, memorable passwords (e.g., `Demo123!`)
- Clearly labeled email addresses (e.g., `demo-patient-1@onecare.you`)
- Realistic prepopulated data including 3 months of vitals history
- Patient-clinician relationships via `provider_shares`

### Demo Account Structure

#### Clinicians (3 accounts)
| Email | Name | Specialty | Password |
|-------|------|-----------|----------|
| demo-clinician-1@onecare.you | Dr. Sarah Mitchell | Internal Medicine | Demo123! |
| demo-clinician-2@onecare.you | Dr. Michael Chen | Cardiology | Demo123! |
| demo-clinician-3@onecare.you | Dr. Emily Williams | Endocrinology | Demo123! |

All clinicians will have:
- `subscription_tier`: "enterprise"
- `subscription_status`: "active"
- `patient_limit`: 1000
- `is_verified`: true
- `onboarding_completed`: true

#### Patients (5 accounts)
| Email | Name | Age | Conditions | Assigned Clinician |
|-------|------|-----|------------|-------------------|
| demo-patient-1@onecare.you | James Thompson | 58 | Type 2 Diabetes, Hypertension | Dr. Mitchell, Dr. Williams |
| demo-patient-2@onecare.you | Maria Garcia | 45 | High Cholesterol | Dr. Mitchell, Dr. Chen |
| demo-patient-3@onecare.you | Robert Johnson | 62 | Mild Kidney Disease | Dr. Mitchell |
| demo-patient-4@onecare.you | Lisa Anderson | 52 | Thyroid Disorder, Hypertension | Dr. Williams |
| demo-patient-5@onecare.you | David Wilson | 48 | Asthma | Dr. Mitchell |

All patients will have:
- `subscription_tier`: "premium" (to showcase all features)
- `onboarding_completed`: true
- Realistic allergies, blood types, and health conditions (non-critical)

### Prepopulated Data

#### Medications (per patient)
- **James Thompson**: Metformin 500mg (twice daily), Lisinopril 10mg (once daily), Vitamin D (once daily)
- **Maria Garcia**: Atorvastatin 20mg (once daily), Aspirin 81mg (once daily)
- **Robert Johnson**: Losartan 50mg (once daily), Omega-3 Supplement (twice daily)
- **Lisa Anderson**: Levothyroxine 50mcg (once daily), Amlodipine 5mg (once daily)
- **David Wilson**: Albuterol Inhaler (as needed), Montelukast 10mg (once daily)

#### Vitals (3 months history - ~90 days)
For each patient, generate realistic vitals data:

| Vital Type | Frequency | Notes |
|------------|-----------|-------|
| Weight | Weekly | Slight fluctuation (+/- 1kg) |
| Blood Pressure | Every 2-3 days | Slight variations within normal/slightly elevated |
| Heart Rate | Every 2-3 days | 60-85 bpm range |
| Blood Glucose | Daily (diabetic patients only) | 90-160 mg/dL range |
| Temperature | Weekly | 36.2-37.0°C |

Patients with specific conditions get condition-relevant vitals:
- **Diabetics (James)**: Daily glucose, quarterly HbA1c
- **Cardiac (Maria)**: Regular cholesterol panels, BP tracking
- **Kidney (Robert)**: Monthly creatinine, GFR, urea
- **Thyroid (Lisa)**: BP, heart rate focus

#### Schedule Entries (Adherence Data - 3 months)
For each medication, generate schedule entries with realistic adherence:
- **80-95% adherence rate** (realistic for demo)
- Mix of "taken", "skipped", and occasional "missed" statuses
- Taken timestamps vary by 0-30 minutes from scheduled time

### Patient-Clinician Relationships

Create `provider_shares` entries:
| Patient | Clinicians | Permissions |
|---------|-----------|-------------|
| James Thompson | Dr. Mitchell, Dr. Williams | vitals, meds, adherence, profile |
| Maria Garcia | Dr. Mitchell, Dr. Chen | vitals, meds, adherence, profile |
| Robert Johnson | Dr. Mitchell | vitals, meds, adherence, profile |
| Lisa Anderson | Dr. Williams | vitals, meds, adherence, profile |
| David Wilson | Dr. Mitchell | vitals, meds, adherence, profile |

This gives:
- **Dr. Mitchell**: 4 patients (comprehensive demo)
- **Dr. Chen**: 1 patient
- **Dr. Williams**: 2 patients

### Implementation Steps

1. **Create auth.users** - Use Supabase Admin API or SQL to create demo users
2. **Create profiles** - Insert patient profiles with health data
3. **Create clinician_profiles** - Insert clinician profiles with Enterprise tier
4. **Create medications** - Insert realistic medications for each patient
5. **Create vitals** - Generate 3 months of historical vitals data
6. **Create schedule_entries** - Generate adherence records
7. **Create provider_shares** - Link patients to clinicians
8. **Create patient_invitations** - Mark as accepted

### Technical Considerations

**User Creation**: Since users need to be created in `auth.users` first, and there's a trigger to auto-create profiles, we have two approaches:

1. **Option A**: Use Supabase Auth Admin API via an edge function to create users programmatically
2. **Option B**: Create users manually via sign-up, then update profiles with SQL

For demo purposes, **Option A** is preferred for automation. A one-time edge function can be created to:
1. Create auth users with known passwords
2. Wait for profile trigger
3. Update profiles with demo data
4. Insert medications, vitals, provider_shares

---

## Summary of Changes

### Files to Modify
1. `src/components/layout/Header.tsx` - Fix spacing between logo and navigation

### Database Inserts (via edge function or SQL)
1. Create 3 clinician auth.users + clinician_profiles
2. Create 5 patient auth.users + profiles
3. Insert 15+ medications across patients
4. Insert ~500+ vitals records (3 months history)
5. Insert ~2000+ schedule_entries (adherence data)
6. Insert 6 provider_shares (patient-clinician links)

### New Files (Optional)
1. `supabase/functions/seed-demo-data/index.ts` - One-time seed function (can be deleted after use)

---

## Password for All Demo Accounts
**Password:** `Demo123!`

This meets common password requirements (uppercase, lowercase, number, special char, 8+ chars) while being easy to remember for testing.

