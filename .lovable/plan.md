

## Comprehensive Data Visibility & RLS Audit Results

### Overall RLS Status: Solid Foundation
- All 34 tables have RLS enabled
- No tables missing policies entirely
- Only 1 linter warning (expected: public-read tables like `emergency_numbers`, `international_drug_mappings`, and public-insert for `job_applications`)

---

### Issues Found

#### 1. Stale Demo Data (Most Impactful)
Demo patient vitals and schedule entries mostly end around **Jan 27, 2026** -- over a month ago. This causes multiple visibility problems:

| Patient | Vitals (last 30d) | Vitals (last 90d) | Schedule (last 30d) |
|---|---|---|---|
| demo-patient-1 (James) | 5 | 297 | 24 |
| demo-patient-2 | 0 | 145 | 0 |
| demo-patient-3 | 0 | 149 | 0 |
| demo-patient-4 | 0 | 132 | 0 |
| demo-patient-5 | 0 | 143 | 0 |

**Impact**: The clinician dashboard's `usePatientVitalsSummaries` hook uses a **30-day window**, so 4 out of 5 demo patients show empty vitals and no adherence data on the dashboard. Only James Thompson shows minimal data.

**Fix**: Update `usePatientVitalsSummaries.ts` to use a 90-day window (matching the patient-side vitals page fix already applied), or re-seed demo data with current dates.

#### 2. Clinician Patient Detail Page - Vitals Limit Too Low
`ClinicianPatientDetail.tsx` line 66 uses `.limit(100)` for vitals, but demo-patient-1 has **511 vitals**. This truncates the data significantly. The `get-shared-patient-data` edge function has a similar `.limit(50)`.

**Fix**: Increase limit to 500 or remove the limit and rely on date filtering instead.

#### 3. Clinician Detail Page - Schedule Window Too Narrow
`ClinicianPatientDetail.tsx` line 98 uses a 30-day window for schedule entries. Most demo patients have no data in that window.

**Fix**: Match the 90-day window or make it selectable like the patient vitals page.

#### 4. Network Request Anomaly - Patient Querying Clinician Notifications
The network logs show `demo-patient-1` (user `08ebec6a`) querying `clinician_guidance_notifications` with a clinician filter for their own user ID. This always returns empty because the patient isn't a clinician. This is a wasted query -- the `useClinicianNotifications` hook likely runs even when logged in as a patient.

**Fix**: Add a guard in `useClinicianNotifications` to skip the query if the user doesn't have a clinician profile.

#### 5. Profiles RLS - Redundant Overlapping SELECT Policies
The `profiles` table has two overlapping SELECT policies for clinician access:
- "Clinicians can view basic patient info from shares" (checks provider_shares)  
- "Clinicians can view shared patient profiles with permission" (checks `clinician_has_patient_permission('profile')`)

Both are PERMISSIVE, so they OR together. This isn't a bug, but the first policy grants SELECT on ALL profile columns to any clinician with an active share, regardless of the `profile` permission flag. This means a clinician without `profile: true` can still see sensitive fields like `date_of_birth`, `allergies`, `health_conditions`.

**Fix**: The broader "basic info" policy should ideally be restricted via a view that only exposes `name` and `email`, or removed in favor of the permission-based policy.

#### 6. `get-shared-patient-data` Edge Function - `getClaims` API
The edge function uses `supabaseAuth.auth.getClaims(token)` which may not be available in all Supabase JS versions. If this fails silently, clinicians get 401 errors. The standard pattern is `supabaseAuth.auth.getUser()`.

**Fix**: Replace `getClaims` with `getUser()` for reliable auth extraction.

---

### What's Working Well
- Permission keys in `provider_shares` are now correctly using `vitals`, `meds`, `adherence`, `profile`
- No orphaned shares (all user_ids map to valid profiles)
- `clinician_has_patient_access()` and `clinician_has_patient_permission()` security-definer functions are properly configured
- Vitals, medications, and schedule_entries all have correct clinician-access RLS policies
- `get_current_user_email()` security-definer function prevents auth schema access issues

---

### Recommended Implementation Order

1. **Widen clinician-side data windows** (issues 1, 2, 3) -- highest impact, fixes empty dashboards
   - `usePatientVitalsSummaries.ts`: 30d to 90d
   - `ClinicianPatientDetail.tsx`: vitals limit 100 to 500, schedule 30d to 90d
   - `get-shared-patient-data` edge function: vitals limit 50 to 200

2. **Guard clinician-only queries from patient sessions** (issue 4) -- prevents wasted network calls

3. **Tighten profiles RLS policy** (issue 5) -- security hardening, lower urgency since data is health-related not credentials

4. **Fix `getClaims` in edge function** (issue 6) -- preventive fix for auth reliability

