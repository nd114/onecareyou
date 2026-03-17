

## Health Vault Document Sharing — Patient-to-Clinician

### Current State

- **Health Vault** stores documents in `health_documents` table + `health-documents` storage bucket, owned by patient
- **Provider shares** (`provider_shares`) already gate clinician access to vitals, meds, adherence, and profile — but **not documents**
- The RLS policy on `health_documents` currently lets clinicians view *all* documents if they have the `profile` permission — this is too broad and gives no per-document control
- The clinician patient detail page (`ClinicianPatientDetail.tsx`) has tabs for Vitals, Meds, Adherence, Analytics, Guidance, Notes — but **no Documents tab**

### Design Principles

- **Patient is in control**: Documents are shared individually, not all-or-nothing. This aligns with OneCare's patient-managed data philosophy.
- **Granular, revocable**: Patient selects specific documents to share with specific clinicians, and can revoke at any time.
- **No new permission key**: Rather than adding a blanket `documents: true` to provider_shares permissions (which shares everything), use a dedicated junction table for per-document sharing.

---

### Part A: Patient Side — Sharing Documents

#### 1. New `document_shares` table

```text
document_shares
├── id (uuid, PK)
├── document_id (uuid → health_documents.id)
├── user_id (uuid — document owner, for RLS)
├── provider_share_id (uuid → provider_shares.id)
├── shared_at (timestamptz)
├── revoked_at (timestamptz, nullable)
├── is_active (boolean, default true)
```

RLS policies:
- Patients can INSERT/UPDATE/SELECT/DELETE where `auth.uid() = user_id`
- Clinicians can SELECT where they own the linked `provider_share` and `is_active = true`

#### 2. UI: Share button on DocumentCard

- Add a **Share** icon button (appears on hover alongside Download and Delete)
- Clicking opens a **ShareDocumentDialog** showing a list of the patient's active provider shares (clinician names)
- Each row has a checkbox. Already-shared clinicians are pre-checked.
- Toggle on/off to share or revoke per clinician
- Confirmation toast: "Document shared with Dr. Smith"

#### 3. UI: Shared indicator on DocumentCard

- If a document has active shares, show a small "Shared with N clinicians" badge
- Tapping badge opens the same share dialog for management

#### 4. Health Vault page — bulk share option

- Optional: multi-select mode with a "Share selected" batch action
- Lower priority; individual share covers the core need

---

### Part B: Clinician Side — Receiving and Viewing Documents

#### 1. New "Documents" tab on ClinicianPatientDetail

- Add a 7th tab: **Documents** (icon: FileText)
- Only visible when the patient has shared at least one document with this clinician
- Shows a list of shared documents with: title, category badge, document date, AI summary preview (if available), and a Download button

#### 2. Data fetching

- New query joins `document_shares` → `health_documents` where `provider_share_id` matches the current clinician's share and `is_active = true`
- Clinician gets a signed download URL via an edge function (since the storage bucket is private, the clinician can't access it directly via client-side RLS)

#### 3. New edge function: `get-shared-document-url`

- Accepts `documentShareId`
- Validates: authenticated clinician, active share, document exists
- Uses service role to generate a signed URL from the `health-documents` bucket
- Returns the URL (short-lived, e.g. 5 minutes)
- Logs the access in `access_audit_logs` for the patient's audit trail

#### 4. Clinician document view

- Inline preview for images and PDFs (using `<iframe>` or `<img>` with the signed URL)
- Download button for all file types
- AI summary displayed if available (read-only)
- Category and date metadata shown

#### 5. Notifications (optional, lower priority)

- When a patient shares a document, a lightweight notification could appear on the clinician dashboard
- Could reuse the existing `clinician_guidance_notifications` pattern or a simple toast on next page load

---

### Process Flows

```text
PATIENT FLOW:
Health Vault → Document Card → Share icon → Select clinician(s) → Confirm
                                           ↕ (toggle to revoke)

CLINICIAN FLOW:
Patient Detail → Documents tab → View list → Click document → Preview/Download
                                             → View AI summary
```

### Update existing RLS

- **Remove** the current blanket "Clinicians can view shared patient documents" policy on `health_documents` (the one using `clinician_has_patient_permission(user_id, 'profile')`)
- **Replace** with a policy that checks `document_shares` for per-document access:
  ```sql
  CREATE POLICY "Clinicians can view individually shared documents"
  ON health_documents FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM document_shares ds
      JOIN provider_shares ps ON ds.provider_share_id = ps.id
      WHERE ds.document_id = health_documents.id
        AND ds.is_active = true
        AND ps.is_active = true
        AND (ps.expires_at IS NULL OR ps.expires_at > now())
        AND (ps.clinician_user_id = auth.uid()
          OR ps.provider_email = get_current_user_email())
    )
  )
  ```

### What Makes This OneCare-Unique

- **Per-document granularity** — most platforms share everything or nothing. OneCare lets patients choose exactly which lab result or discharge summary their specialist sees.
- **Revocable in real-time** — toggle off sharing from the same card, no navigation needed.
- **Audit trail** — every clinician download is logged, visible to the patient in their access history.
- **AI-enriched context** — clinicians see the AI summary alongside the document, saving them time without requiring them to run their own analysis.

---

### Implementation Tasks Summary

| # | Task | Scope |
|---|------|-------|
| 1 | Create `document_shares` table + RLS | Migration |
| 2 | Replace blanket document RLS with per-document policy | Migration |
| 3 | Build `ShareDocumentDialog` component | Patient UI |
| 4 | Add Share button + shared badge to `DocumentCard` | Patient UI |
| 5 | Create `get-shared-document-url` edge function | Backend |
| 6 | Add Documents tab to `ClinicianPatientDetail` | Clinician UI |
| 7 | Add `useSharedDocuments` hook for clinician queries | Hook |
| 8 | Log document access in `access_audit_logs` | Backend |

