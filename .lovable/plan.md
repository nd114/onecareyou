## Implementation Plan: Health Vault Fixes, Feature Gating & Platform Improvements

### Issues Found in Current Implementation

**1. Upload "Failed to fetch" Bug**
The storage bucket and RLS policies exist and look correct. The most likely cause is that the `health-documents` bucket has no UPDATE policy on `storage.objects` — the Supabase storage client performs an upsert which requires both INSERT and UPDATE. Additionally, the upload might fail if the user's auth token expired mid-session. Fix: add a storage UPDATE policy and add better error handling with auth-state checks before upload.

**2. Health Vault is listed in "Coming Soon" but already built**
`pricing-constants.ts` line 50 still lists `'Health Document Vault'` in `COMING_SOON_FEATURES`. It should be moved to `PREMIUM_FEATURES` since it's now a real feature.

**3. AI Summarization is automatic — not opt-in**
The upload hook (`useHealthDocuments.ts` line 112) fires `summarize-health-document` immediately after every upload with no user choice. This should be opt-in via a toggle in the upload dialog and a "Summarize" button on existing documents.

**4. No connection between Health Vault and Vitals upload**
The Vitals page has a lab report upload feature (`AddVitalDialog.tsx`) that parses lab images for vital values. Health Vault stores documents. These are separate systems with no cross-reference. Documents uploaded via vitals should optionally also appear in Health Vault. e.g. "Add to health vault" toggle or "Add to health vault?" with an optional tick or something defaulted to 'on' or ticked.

**5. No premium gating on Health Vault**
The Health Vault page has no subscription check — any free-tier user can upload unlimited documents.

---

### Implementation Tasks

#### Task 1: Fix Storage Upload Bug

- Add missing UPDATE storage policy for `health-documents` bucket
- Add auth-state validation before attempting upload (check `user` and `session` are valid)
- Improve error message to distinguish auth errors from network errors

#### Task 2: Make AI Summarization Opt-In

- Add a "Use AI to categorize & summarize" toggle (default off) in `UploadDocumentDialog`
- User should be explicitly notified of implications to doing this with AI by a reconfirmation or sth similar
- Only call `summarize-health-document` edge function when opted in
- Add a "Summarize with AI" button on `DocumentCard` for existing documents without summaries
- Check AI consent status (`useAIConsent`) before allowing AI features, showing `AIConsentDialog` if needed

#### Task 3: Premium Gate the Health Vault

- Move "Health Document Vault" from `COMING_SOON_FEATURES` to `PREMIUM_FEATURES` in `pricing-constants.ts`
- Add subscription check on `HealthVault.tsx` — free users see a teaser/upsell instead of the full vault
- Free users can view up to 3 documents; uploading more requires Premium
- AI summarization is Premium-only

#### Task 4: Consolidate Vitals Uploads with Health Vault

- When a user uploads a lab report image in AddVitalDialog, offer to also save it to Health Vault as an `imaging` or `lab_result` category document
- Add a `source_context` column to `health_documents` (e.g., `'vitals_upload'`, `'direct'`) to track origin
- User can unselect not to add it to vault from prompt that is preselected as to be added as mentioned above
- Show a badge on Health Vault documents that came from vitals uploads

#### Task 5: Update Pricing Copy

- Remove "Health Document Vault" from Coming Soon
- Add "Health Document Vault" and "AI Document Summaries" to Premium features list
- Update Landing page premium features to include vault

---

### Technical Details

**Database migration** (Task 1 + Task 4):

```sql
-- Add missing UPDATE storage policy
CREATE POLICY "Users can update their own health documents"
ON storage.objects FOR UPDATE
USING (bucket_id = 'health-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add source tracking column
ALTER TABLE health_documents ADD COLUMN source_context text DEFAULT 'direct';
```

**Files to modify**:

- `src/hooks/useHealthDocuments.ts` — add `aiSummarize` param to upload, add `triggerSummarize` method
- `src/components/documents/UploadDocumentDialog.tsx` — add AI opt-in toggle with consent check
- `src/components/documents/DocumentCard.tsx` — add "Summarize with AI" button
- `src/pages/HealthVault.tsx` — add premium gate with upsell banner for free users
- `src/lib/pricing-constants.ts` — move vault to premium features
- `src/pages/Pricing.tsx` / `Landing.tsx` — reflect updated feature lists
- `src/components/vitals/AddVitalDialog.tsx` — add "Save to Health Vault" option after lab report parsing