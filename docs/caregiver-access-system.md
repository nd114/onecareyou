# Delegated Caregiver Access System

## Status: Planned (Not Yet Implemented)

## Problem Statement

A family member (e.g., parent) may temporarily leave a relative they care for with another person (a "watcher"). The watcher needs to:
1. **Upload health data** (vitals, medications, documents) to the patient's account
2. The family member needs to **see that data remotely** in real-time

Currently, the only way to do this is by sharing login credentials — which is insecure and violates best practices.

## Existing Infrastructure

### Database Table: `caregiver_access`
Already exists with the following schema:
- `id` (uuid, PK)
- `family_member_id` (uuid, FK → family_members)
- `caregiver_user_id` (uuid) — the watcher's account
- `permissions` (jsonb) — `{ "view": true, "edit": false, "manage_meds": false }`
- `granted_by` (uuid) — the account owner who granted access
- `created_at` (timestamptz)

### RLS Policies (Already in Place)
- INSERT: `auth.uid() = granted_by`
- DELETE: `auth.uid() = granted_by`
- UPDATE: `auth.uid() = granted_by`
- SELECT: `auth.uid() = granted_by OR auth.uid() = caregiver_user_id`

### What's Missing

| Component | Status | Description |
|-----------|--------|-------------|
| Invite flow UI | ❌ Not built | Patient sends email invite to caregiver |
| `caregiver_has_access()` function | ❌ Not built | Security definer to check caregiver permissions |
| RLS policy updates | ❌ Not built | `vitals`, `medications`, `health_documents` need INSERT policies for caregivers |
| Caregiver dashboard ("Shared With Me") | ❌ Not built | Caregivers see list of patients they have access to |
| Scoped upload forms | ❌ Not built | Caregiver can add vitals/meds/docs on behalf of patient |
| Invite acceptance flow | ❌ Not built | Caregiver receives email, creates account, accepts |
| Revocation UI | ❌ Not built | Patient can revoke caregiver access instantly |
| Activity log | ❌ Not built | Track what caregivers upload/view |

---

## Proposed Architecture

### 1. Invite Flow
1. Patient navigates to Family Dashboard → selects a family member → "Add Caregiver"
2. Enters caregiver's email and selects permissions (view, edit, manage_meds)
3. System creates a `caregiver_access` record with status `pending`
4. Email sent to caregiver with invite link
5. Caregiver creates account (or signs in) → accepts invite
6. `caregiver_access` record updated to `active`

### 2. Security Definer Function
```sql
CREATE OR REPLACE FUNCTION public.caregiver_has_access(
  _patient_user_id uuid,
  _permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM caregiver_access ca
    JOIN family_members fm ON ca.family_member_id = fm.id
    WHERE fm.owner_user_id = _patient_user_id
      AND ca.caregiver_user_id = auth.uid()
      AND (ca.permissions->>_permission)::boolean = true
  )
$$;
```

### 3. Updated RLS Policies

**vitals** — Add INSERT policy:
```sql
CREATE POLICY "Caregivers can insert vitals for patients they manage"
ON public.vitals FOR INSERT
TO authenticated
WITH CHECK (caregiver_has_access(user_id, 'edit'));
```

**vitals** — Add SELECT policy:
```sql
CREATE POLICY "Caregivers can view vitals for patients they manage"
ON public.vitals FOR SELECT
TO authenticated
USING (caregiver_has_access(user_id, 'view'));
```

Similar policies needed for: `medications`, `health_documents`, `schedule_entries`

### 4. Caregiver Dashboard
- New page: `/caregiver/dashboard` or section in existing dashboard
- Shows: "People I'm caring for" with cards for each patient
- Each card shows: name, relationship, permissions, last activity
- Click through to scoped views of vitals/meds/documents

### 5. Scoped Upload Forms
- When caregiver adds a vital, it sets `user_id` to the patient's ID (not the caregiver's)
- Backend validates via RLS that caregiver has `edit` permission
- Activity logged for audit trail

---

## Complications & Considerations

### Structural Hindrances
1. **`user_id` vs `family_member_id`**: The vitals/medications tables use `user_id` (the account owner) and optionally `family_member_id`. A caregiver would need to know the patient's `user_id` to insert data — this means the invite flow must link `caregiver_user_id` to the patient's `user_id` through `family_members.owner_user_id`.
2. **Existing hooks assume single user**: `useVitals`, `useMedications` always filter by `auth.uid()`. Caregivers would need alternate hooks or a context-based "active patient" selector.
3. **Notification routing**: When a caregiver uploads data, the patient should be notified. Currently no notification system for this exists.

### Advantages
1. **DB table already exists** with correct schema and RLS
2. **Permission model is flexible** — JSONB allows adding new permission types
3. **Family member concept is established** — the `family_members` table provides the bridge between caregivers and patients
4. **Existing patterns**: The `provider_shares` system for clinicians provides a template for the caregiver system

### Security Considerations
- Caregivers should NEVER be able to delete data — only view and insert
- All caregiver actions should be logged in `access_audit_logs`
- Invite links should expire (7 days default)
- Patient can revoke access instantly; RLS enforces this in real-time
- Caregiver access should be scoped to specific family members, not the entire account

---

## Estimated Effort: 3-4 days

### Breakdown
- Day 1: DB function + RLS policies + invite flow backend
- Day 2: Invite UI + acceptance flow + email template
- Day 3: Caregiver dashboard + scoped upload forms
- Day 4: Activity logging + revocation UI + testing

---

## Dependencies
- Email service (Resend) — already configured
- Auth system — already in place
- Family members system — already built
