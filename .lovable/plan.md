# Hospital administration accounts, Care Circle clarity, and Enterprise pricing tiers

Specialty list already updated (Nuclear Medicine, Radiology added). The rest is grouped into four phases.

## Phase 1 — Patient clarity (Care Circle, Settings, Emergency)

**Care Circle reordering**
- Put "People and organisations I share with" first and largest on `/care-circle`; move the "Active access" panel below it and compact it into a summary strip.
- Add a clear "My hospital" block at the top when the patient has an institutional connection, labelled with the institution's name and logo.

**Hospital mini profile**
- Clicking a hospital or clinician entry opens a details sheet: institution name, registered phone number, email, address, city/state/ZIP, NPI, and department (if assigned).
- Data comes from the existing practice contact source of truth (the contact details the practice sets itself) via a read-only lookup scoped to patients who actually share with that practice — no new writable surface.

**Settings**
- Add a "My hospital" card in Settings mirroring the Care Circle block, with a link through to Care Circle for managing sharing.

**Emergency defaults**
- Country in the emergency section defaults to the country already stored on the patient's profile; no manual re-selection needed.
- Add a personal emergency contact step (name + phone) to onboarding so it is collected up front, pre-filling the Settings fields.

## Phase 2 — Administrative account type (hospital owners and sub-admins)

Today a hospital owner lands on the patient dashboard after accepting an invitation, because the router only knows "patient" and "clinician". We introduce a third surface.

- **Fix the invitation bug**: after account creation from a tenant-owner invitation, the role check resolves before the first redirect so the user lands on the administrative dashboard, never the patient dashboard.
- **New administrative dashboard** at `/practice` (hospital scope, distinct from OneCare's platform admin console):
  - Overview: departments, clinician count, patient count, pending invitations, storage usage.
  - **Clinicians**: create, view, edit, archive (never delete). Archive keeps records for audit.
  - **Patients**: create, view, edit, archive; assign clinicians to patients and patients to clinicians.
  - **Departments**: create, rename, archive; assign leads and members.
  - **Admins**: invite additional administrative accounts, set their departments and RBAC permissions.
- **Account separation**: an administrative account is its own login, issued to one named person. It gets no patient dashboard and no clinical record surface; the header, nav, and route guards reflect that. Every administrative action is written to the audit log with the acting account, so credentials are never shared.
- Existing practice roles (owner, admin, sub-admin, department lead) drive what each administrative account can see and do; department-scoped admins only see their departments.

## Phase 3 — Enterprise pricing tiers

Replace the single Enterprise price with three sizes on `/pricing` (clinician tab) and on the enterprise inquiry page:

| Tier | Shape | Price |
| --- | --- | --- |
| Practice | Single site, up to ~5 clinicians, hundreds of patients | existing $399/mo |
| Mid-sized | Several departments, up to ~50 clinicians, hundreds of patients | from $1,500/mo |
| Large hospital | 10+ departments, 50+ clinicians, thousands of patients | from $3,000/mo |

- One-time onboarding fee of **$2,500** shown on all Enterprise tiers, described as covering multi-department setup and EHR integration scope.
- All values live in the pricing constants file (single source of truth) so the pricing page, enterprise inquiry, and comparison table stay in sync.

## Phase 4 — Roadmap entries (copy only, no billing work now)

Add to `docs/roadmap.md` and the pricing page's roadmap note:
- Storage fees: base allowance included per tier, additional packs purchasable — dated as coming.
- Profit sharing: 2027.
- Regional pricing: late 2026 to early 2027.

## Technical notes

- No new tables needed for Phase 2 beyond what practice roles, departments, and invitations already provide; archiving adds an `archived_at` column pattern rather than deletes.
- Patient-facing institution lookup is a read-only security-definer function gated on an existing share, so no institution contact data leaks to unrelated patients.
- Route guards gain an "administrative" branch alongside patient and clinician; the existing session and audit logging stay unchanged.
