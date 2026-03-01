

## Comprehensive Platform Audit & Fix Plan

### Critical Bug: RLS "permission denied for table users" (affects ALL logged-in users)

The network logs show **every request from demo-patient-1** to `profiles`, `clinician_profiles`, and `clinician_profiles_public` returns **403 with "permission denied for table users"**. This means:

- **Patient cannot load their own profile** (name shows from JWT metadata only, not DB)
- **Patient dashboard may show incorrect/missing data**
- **Clinician notifications, guidance settings, and profile fetch all fail for patients**

**Root cause**: Multiple RLS policies across tables contain direct subqueries like `(SELECT email FROM auth.users WHERE id = auth.uid())`. The `authenticated` role does not have SELECT permission on `auth.users`, so when PostgreSQL evaluates these policy expressions, the entire query fails -- even if a simpler policy (like `auth.uid() = user_id`) would grant access.

A `get_current_user_email()` SECURITY DEFINER function already exists to solve exactly this, but many policies were created later without using it.

**Affected policies (must be rewritten):**

| Table | Policy | Direct `auth.users` reference |
|---|---|---|
| `profiles` | "Clinicians can view basic patient info from shares" | `ps.provider_email = (SELECT email FROM auth.users...)` |
| `profiles` | "Clinicians can view shared patient profiles with permission" | calls `clinician_has_patient_permission` which uses auth.users |
| `profiles` | "Patients can view clinician names from guidance" | subquery via `clinician_guidance` (indirect, may be safe) |
| `clinician_profiles` | "Patients can view clinician profiles from pending records" | `(SELECT email FROM auth.users...)` |
| `clinician_profiles` | "Patients can view clinician profiles from guidance" | subquery in `clinician_guidance` |
| `clinician_patient_records` | "Patients can view pending records by email" | `(SELECT email FROM auth.users...)` |
| `clinician_patient_records` | "Patients can accept or decline pending records" | `(SELECT email FROM auth.users...)` |
| `patient_invitations` | "Patients can view invitations by email" | `(SELECT email FROM auth.users...)` |
| `patient_invitations` | "Patients can accept or decline invitations" | `(SELECT email FROM auth.users...)` |
| `practice_invitations` | "Practice members can view invitations" | `(SELECT email FROM auth.users...)` |
| `practice_invitations` | "Practice managers can update invitations" | `(SELECT email FROM auth.users...)` |
| `job_applications` | "Applicants can view their own applications" | `(SELECT email FROM auth.users...)` |
| `clinician_profiles_public` (view) | likely inherits from `clinician_profiles` | same issue |

Also check: `clinician_has_patient_access()` and `clinician_has_patient_permission()` functions already use `auth.users` safely inside SECURITY DEFINER, so those are fine. The issue is only with policies that directly embed the subquery.

**Fix**: A single SQL migration that drops and recreates all affected policies, replacing `(SELECT email FROM auth.users WHERE id = auth.uid())` with `get_current_user_email()`.

---

### Bug 2: ClinicianWhyOneCare page missing key features

The "Why OneCare" page for clinicians lists 6 advantages and a 9-row comparison table, but several implemented features are absent:

**Missing from the page:**
- **Bulk Patient Import** (CSV onboarding with deduplication)
- **Clinician-Managed Records** (data ownership framework)
- **Patient Guidance System** (bidirectional clinical instructions with status tracking)
- **Vital Alert Thresholds** (automated clinician alerting on out-of-range vitals)
- **Team/Practice Management** (multi-clinician practices with RBAC)
- **BAA/HIPAA Compliance** (built-in Business Associate Agreement)

**Fix**: Add these features to the `uniqueAdvantages` array and the `comparisonData` comparison table.

---

### Implementation Steps

1. **SQL Migration** -- Replace all direct `auth.users` references in RLS policies with `get_current_user_email()`. This is a single migration touching ~12 policies across 6 tables. This fixes the 403 errors for all users.

2. **Update ClinicianWhyOneCare.tsx** -- Add missing clinician features (bulk import, managed records, guidance, alerts, team management, BAA) to both the advantages grid and comparison table.

3. **Verify** -- After the migration, all profile/clinician_profiles queries should return 200 for both patient and clinician demo accounts.

---

### Technical Detail: The Migration

```sql
-- For each affected policy:
-- 1. DROP POLICY "policy name" ON table;
-- 2. CREATE POLICY "policy name" ON table FOR <cmd> TO authenticated
--    USING (...replace (SELECT email FROM auth.users WHERE id = auth.uid())
--           with get_current_user_email()...);
```

This is safe because:
- `get_current_user_email()` is SECURITY DEFINER and does the same thing
- It already exists and is used by some policies (e.g., `provider_shares`)
- No data changes, only policy expression rewrites

