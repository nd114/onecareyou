# Enterprise / Hospital Tenancy Plan

Status: Phases A, B, C (core) and D shipped (Aug 2026). Phase E outstanding.
Owner: platform team. Canonical companion doc: `docs/sharing-access-consent-model.md`.

## 1. Why tenancy exists

A hospital is not "a group of doctors with accounts". When a patient walks into a hospital and
shares their record, the relationship is with the **institution**. The hospital then assigns the
clinician who cares for them. That institutional relationship has to be a first-class object
because:

- Consent is given to the institution, not to an individual, and must be revocable as such.
- Revenue share only works if patients are attributable to a tenant.
- Reassignment (doctor goes on leave, patient moves ward) must not require re-consent.
- Audit and legal preservation happen at the institution level.

A private doctor share remains completely separate and is never overridden by a hospital share.

## 2. Data model (shipped)

| Object | Purpose |
| --- | --- |
| `practices` | The tenant. New: `slug` (subdomain/hospital code), `tenant_type` (`practice` \| `hospital`), `storage_limit_gb`, `revenue_share_pct`. |
| `practice_members` | Per-user role inside the tenant (`owner`, `admin`, `provider`, `clinician`, `nurse`, `front_desk`, `billing`, `read_only`) with capability overrides in `practice_role_permissions`. |
| `practice_shares` | **Patient → institution** consent. `share_all`, granular `permissions`, `is_active`, `connected_at`, `revoked_at/by/reason`. Never hard-deleted. |
| `practice_patient_assignments` | Sub-admin assigns a hospital-shared patient to a clinician. Time-bounded (`effective_from/to`), `assigned_by` recorded. |
| `provider_shares` | Unchanged: private, patient→individual-clinician shares. |
| `storage_ledger` | Per-file byte accounting, attributed to a patient and (for clinician-side artefacts) a tenant. |

Access helpers (all `SECURITY DEFINER`, `EXECUTE` revoked from `PUBLIC`):

- `institution_has_patient_access(patient)` — true when an active `practice_shares` row exists for
  the caller's tenant **and** the caller is either assigned to the patient or holds
  `can_view_all_patients`.
- `find_institution_by_slug(slug)` — patient-facing lookup returning name/city/country/logo only.
- `get_institution_basic_info(ids)` — resolves names for tenants the caller is a member of or has
  shared with.
- `get_practice_storage_bytes(practice_id)`, `get_user_storage_bytes(user_id)`.

RLS on `vitals`, `medications`, `health_documents` and `clinician_guidance` now includes an
institution path in addition to the existing private-share path. No break-glass path exists:
hospital staff can never read without an active share.

## 3. Phases

**Phase A — tenancy core (shipped)**
Tenant entity, roles, slug-based hospital code, storage allowance, revenue-share field, name/logo
overlay only (no re-theme of the emerald/cream/gold system).

**Phase B — hospital-level sharing (shipped, launch scope)**
- Patient connects to a hospital by code from Care Circle → "Hospitals & clinics".
- Default is share-everything with a single toggle for a reduced set (vitals + medications).
- Disconnection is a status change; history and records are preserved permanently.
- Fast-follow: the granular per-category picker, reassignment polish, multi-hospital labelling.

**Phase C — admin surfaces (core shipped)**
- Tenant admin (Practice page): hospital code self-service (`set_institution_slug`, with live
  availability check), team/RBAC management, institution-shared patient assignment, pooled storage,
  branding, and a read-only revenue-share summary.
- OneCare platform admin at `/admin` (`AdminRoute`, server-verified `has_role(admin)`): tenant
  overview via `admin_tenant_overview()` — team size, active patient connections, storage against
  allowance, revenue-share rate — plus links to careers, import and changelog tools.
- Fast-follow: tenant creation from the console (still ops-provisioned), cross-tenant audit search,
  revenue-share statements and payouts.

**Phase D — delegation & assignment (shipped, basic)**
Sub-admins and admins assign hospital-shared patients to clinicians from Practice → Institution-shared
patients. Clinician panels distinguish hospital-assigned from private patients via the assignment table.

**Phase E — deferred**
Enterprise SSO (SAML/OIDC), persistent per-tenant demo environment exempt from the daily reset,
formulary checks only if confirmed needed.

## 4. Launch checklist for the first hospital client

- [x] Institution share pathway live
- [x] Assignment of a clinician to a hospital-shared patient
- [x] Patient-initiated disconnection with preserved history
- [x] Pooled tenant storage metering
- [x] Hospital code self-service (reserves `<slug>.onecare.you`; DNS routing still to do)
- [x] Tenant admin surfaces + platform admin console at `/admin`
- [x] Revenue-share reporting view (estimate; statements/payouts coming soon)
- [ ] Subdomain DNS routing for `<slug>.onecare.you`

## 5. Open items

- Tenant *creation* is still ops-provisioned; codes are now self-service for owners/admins.
- Granular share picker shipped: patients choose vitals / medications / documents / conditions /
  allergies per hospital and can adjust an existing connection at any time.
- Jurisdictional retention (US/EU baseline) to be confirmed with legal counsel.
