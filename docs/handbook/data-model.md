# Data model and access control

Written for engineers and for technical reviewers at partner institutions.

## 1. Principles

- Postgres is the security boundary. Every public table has RLS enabled *and* explicit `GRANT`s;
  policies never read `auth.users` directly (use `get_current_user_email()`).
- Cross-user reads go through `SECURITY DEFINER` helpers, never through client-side joins.
- Roles: platform roles in `user_roles` (`has_role`), tenant roles in `practice_members`
  (`has_practice_capability`, `can_manage_practice`, `has_practice_role`).
- Nothing with legal weight is hard-deleted; relationships are soft-revoked and history preserved.

## 2. Core groups of tables

**Identity & profile** — `profiles`, `clinician_profiles`, `user_roles`, `family_members`,
`emergency_numbers`, `legal_acceptances`, `consent_logs`.

**Patient clinical data** — `medications`, `medication_photos`, `vitals`, `schedule_entries`,
`health_documents`, `document_shares`, `patient_action_log`.

**Sharing & consent** — `provider_shares` (patient ↔ individual clinician, JSONB permissions),
`practice_shares` (patient ↔ institution), `practice_patient_access`,
`practice_patient_assignments`, `caregiver_access`, `share_events` (append-only ledger),
`data_sharing_agreements`.

**Clinician work** — `clinician_patient_records` (managed charts, visits/vitals as JSONB),
`clinician_guidance` + notifications, `clinician_dictations`, `encounters`, `clinical_templates`,
`practice_tasks`, `internal_notes`, `referrals`, `clinician_alert_rules`, `alert_logs`.

**Tenancy & billing** — `practices` (tenant record: `tenant_type`, `slug`, `storage_limit_gb`,
`revenue_share_pct`, limits), `practice_members`, `practice_role_permissions`,
`practice_invitations`, `tenant_owner_invitations`, `storage_ledger`, `enterprise_inquiries`.

**Compliance & audit** — `hipaa_audit_logs`, `access_audit_logs`, `platform_admin_actions`,
`baa_agreements`, `legal_documents`.

**Interop** — `ehr_connections`, `ehr_sync_logs`, `ehr_export_queue`, `qhin_imports`,
`qhin_record_provenance`, `international_drug_mappings`.

**Programme** — `beta_testers`, `beta_nda_signatures`, `beta_events`, `beta_bug_reports`,
`job_postings`, `job_applications`.

## 3. Patient access helpers

| Function | Grants |
| --- | --- |
| `clinician_has_patient_access(patient)` | active private share |
| `clinician_has_patient_permission(patient, key)` | that share includes a specific category |
| `institution_has_patient_access(patient)` | active institution share **and** assignment/practice view right |
| `clinician_had_patient_access(patient)` | historical read-only access after revocation |
| `is_assigned_to_patient(user, patient)` | direct assignment inside a tenant |
| `practice_has_patient_access(practice)` | tenant-level check for pooled views |

Patient-side helpers: `get_patient_identity(ids[])` returns names/contact for patients a clinician may
see (used to avoid "Unknown Patient"); `get_clinician_basic_info(ids[])` and
`get_institution_basic_info(ids[])` return only public-safe fields to patients.

## 4. Admin functions

`admin_create_tenant`, `admin_update_tenant`, `admin_invite_tenant_owner`,
`admin_cancel_tenant_invitation`, `admin_grant_platform_admin`, `admin_revoke_platform_admin`,
`admin_list_platform_admins`, `admin_list_tenant_invitations`, `admin_tenant_overview`,
`admin_recent_actions`. All re-check the admin role internally and log via
`log_platform_admin_action`. `EXECUTE` is revoked from `PUBLIC`.

## 5. Storage accounting

- `storage_ledger` holds one row per artefact with byte size, owner and billed tenant.
- Triggers `sync_storage_ledger_document` and `sync_storage_ledger_dictation` keep it current; audio
  size is estimated at 32 kB/s and transcripts are retained instead of recordings.
- `get_user_storage_bytes` and `get_practice_storage_bytes` power the usage cards and quota checks.
- Buckets: `health-documents` (share-gated), `resumes` (private, admin read via signed URL),
  `medication-photos`, `avatars`.

## 6. Edge functions

Deployed with `verify_jwt = false`, so every function validates in code using
`supabase/functions/_shared/auth.ts`:

- `requireUser` — any signed-in user (patient AI, document summarisation, drug lookup).
- `requireServiceRole` — cron/internal only (`scheduled-ehr-sync`, `check-vital-alerts`,
  `check-care-alerts`, demo reset/seed).
- `requireServiceRoleOrAdmin` — admin tooling (`notify-tenant-owner-invite`, imports).

Cron callers additionally present the `x-cron-secret` header validated against `cron_auth`.

## 7. Conventions

- `glucose` is the identifier for blood sugar everywhere.
- Vitals default to a 90-day lookback.
- Date-only values must go through `src/lib/date-only.ts` (avoids the UTC off-by-one).
- New table checklist: `CREATE TABLE` → `GRANT` → `ENABLE ROW LEVEL SECURITY` → policies →
  `updated_at` trigger.
