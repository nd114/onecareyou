# Hospital Groups Plan — a parent tenant over several hospitals

> **Assessed, not started — September 2026.** Written in answer to the question
> "how easy would it be if a group of hospitals wanted OneCare — a master
> tenant and sub-tenants?" Restart when: a group is in a sales conversation, or
> the capability work in phase 0 below is picked up for its own sake.
>
> This document describes an intention, not current work.

Companion documents: `docs/enterprise-hospital-tenancy-plan.md` (the single
hospital), `docs/sharing-access-consent-model.md` (who decides access),
`docs/independent-clinicians-and-hospitals.md` (the two pathways that never
merge).

---

## 1. The short answer

A group can be onboarded **today** as several separate hospitals, with the same
people holding a membership in each. Every hospital keeps its own code, staff,
departments, patients, audit log and revenue-share summary, and a patient's
consent to one hospital gives the others nothing. That is correct, and it is the
hardest part already done.

What does not exist is the **group itself**: nothing in the schema knows two
hospitals belong together, so there is nowhere for a group CMD, group finance
head or group nursing head to stand, no view across the hospitals, and no way to
say "this person runs finance for these four sites but not the fifth".

The pieces to build it are mostly present — departments are already a working
example of "a person scoped to part of a tenant", and a per-tenant role →
capability table already exists. The one real obstacle is that the capability
system is, today, mostly advisory (see §2.3). Fix that first and the group layer
is a moderate build — roughly **eight to eleven weeks** end to end, with a
useful pilot in about four.

## 2. What exists today

### 2.1 The tenant

`practices` is the tenant. It carries `tenant_type` (`practice` or `hospital`,
checked only inside `admin_create_tenant`, not by a constraint), `slug` (the
hospital code, 3–7 characters, and the `<slug>.onecare.you` front door),
`is_active`, branding (`logo_url`, `primary_color`, `brand_logo_url`,
`brand_accent_color`), `allowed_email_domains`, `default_currency`,
`assignment_first_access`, and the commercial columns (`subscription_*`,
`revenue_share_pct`, `storage_limit_gb`, `patient_limit`, `member_limit`), which
`guard_practice_commercial_columns` reserves to platform admins.

Tenants are created by OneCare only, through `admin_create_tenant` on the admin
console, and handed over with `tenant_owner_invitations` →
`accept_tenant_owner_invitation`, which makes the invitee `owner`. There is no
parent, no sibling, and no column that could hold either.

### 2.2 Staff

`practice_members` holds one row per person per tenant, with a `practice_role`
(`owner`, `admin`, `sub_admin`, `provider`, `clinician`, `nurse`, `front_desk`,
`billing`, `staff`, `read_only`) and five boolean flags (`can_view_all_patients`,
`can_invite_patients`, `can_invite_members`, `can_manage_billing`,
`can_manage_settings`). A person may belong to many tenants; the client's
workspace switcher (`useWorkspaceSelection`) picks which one the screens act for.

Around that sit the pieces that make one hospital work:

- **Departments** — `practice_departments`, `practice_department_members` with
  `is_lead`, `practice_patient_departments`. A lead gets `can_manage_department`,
  the staff overview and the tenant audit log for their tenant. This is the only
  existing case of a person scoped to *part* of a tenant, and it is the pattern a
  group generalises.
- **Assignment** — `practice_patient_assignments`, time-bounded, made through
  `assign_practice_patient`, which is the one place a capability
  (`assign_patients`) is checked in the database.
- **Tenant admin** — `can_manage_practice(practice_id)`, true for `owner` and
  `admin` of that exact tenant. Nothing is inherited from anywhere.

### 2.3 Capabilities — present, mostly not enforced

`has_practice_capability(user, capability, practice)` resolves a capability from
the member's role, with a per-tenant override in `practice_role_permissions`
(`practice_id`, `role`, `capability`, `granted`). Thirteen capabilities are
defined: `view_phi`, `edit_clinical`, `send_guidance`, `message_patients`,
`manage_billing`, `manage_team`, `manage_ehr`, `manage_settings`,
`invite_patients`, `export_data`, `bulk_message`, `view_audit`,
`assign_patients`.

Checked against the replayed database:

- **No RLS policy calls it.** The only database caller is
  `assign_practice_patient`. Everywhere else the client's `useClinicianCapabilities`
  uses it to hide buttons.
- **Clinical reads ignore it.** `institution_has_clinical_permission` decides by
  `practice_role_is_clinical(role)`, a hard-coded list, plus assignment or
  `can_view_all_patients`, plus the patient's share. An override setting
  `view_phi = false` for nurses would hide the nurse's screens and leave the
  nurse's database access exactly as it was.
- **Nothing edits the overrides.** `practice_role_permissions` has a manager
  write policy and no screen in `src/`.
- The two-argument form `has_practice_capability(user, capability)` resolves
  against the caller's *first* membership by `created_at`. Nothing calls it now,
  but in a world where one person holds memberships in five sibling hospitals it
  answers for an arbitrary one of them, and should be dropped before a group
  exists.

The direction of the failure is the safe one: an override can hide something,
never grant clinical access. But a configurable role matrix that a group admin
edits and the database does not honour would be rule 6's empty promise, and
"configurable per group without code changes" is exactly what the founder is
asking for. So this is the first thing to fix.

### 2.4 Patient consent and clinical access

A patient shares with **one institution** through `practice_shares`
(`share_all`, `permissions`, `is_active`, `practice_suspended_at`, revocation
fields; never deleted, guarded by `guard_practice_share_terms`). Access is
decided at the moment of the read by:

- `institution_has_patient_access` — an active, unsuspended share with the
  caller's tenant, and the caller either assigned in that same tenant or holding
  `can_view_all_patients`.
- `institution_has_clinical_permission` — the same, plus a clinical role, plus
  the category through `share_grants`. Since `20261009060000` the share, the
  membership and the assignment must all be the *same* practice.

This is what makes a group safe to build: whatever the group layer does, clinical
access remains a question about one hospital and one patient's share with it.

### 2.5 Money, audit, branding

- **Revenue share** — `practice_revenue_share_summary` counts active and paying
  connected patients for one tenant; `profiles.onboarded_via_practice_id` is the
  attribution, first institution wins. `fhir_invoices.practice_id` holds a
  hospital's patient bills; `platform_fee_minor` is always zero. Nothing collects
  money.
- **Audit** — `hipaa_audit_logs` has no practice column.
  `practice_audit_log` infers the tenant: the actor is an active member, and
  (since `20261008000000`) the patient has a share with the tenant, active or
  not. Readable by owners, admins and department leads.
- **Branding** — on the `<slug>.onecare.you` intake page only; behind sign-in is
  the one OneCare design, by decision.

## 3. What a group changes

### 3.1 Reusable as it stands

| Piece | Why it fits a group |
| --- | --- |
| `practices` as the tenant | A group is a tenant with no patients of its own. `tenant_type` is free text with no constraint; adding `group` is one value |
| Per-person, per-tenant membership | Staff who work at several sister hospitals already hold one membership each, and `20261009060000` keeps each one's access inside its own tenant |
| Departments and leads | The working model of "responsible for part of a tenant" — a group role scoped to three of five hospitals is the same shape one level up |
| `practice_role_permissions` | Already a per-tenant role → capability table. The idea is right; it needs enforcement and an editor |
| `guard_practice_commercial_columns` | Contract terms stay OneCare's at the group level too |
| The consent helpers | Unchanged. The group layer should never appear inside them |
| `tenant_owner_invitations` | The hand-over for a group owner works as it is |

### 3.2 Hard-coded to one tenant

- `can_manage_practice` and every admin RPC take one practice id and ask about
  membership of exactly that practice. A group admin is a member of nothing below.
- `practice_role` is a fixed enum and `practice_role_is_clinical` a fixed list,
  mirrored in `src/lib/staff-roles.ts`. "Group Finance Head" or "Matron" cannot
  be added without a migration.
- Capabilities are advisory (§2.3).
- `practice_patient_overview` and `practice_staff_overview` return names and
  emails; they are per hospital and must not be what a group screen is built on.
- The audit log's tenant is inferred. A clinician who works at two sister
  hospitals, treating a patient who has shared with both, produces one row that
  both hospitals' logs claim — correct for each today, ambiguous for a group
  roll-up.
- `onboarded_via_practice_id` is first-wins across the platform; a patient moving
  between sister hospitals stays attributed to the first.
- Managed records (`clinician_patient_records`) belong to their creating
  clinician and are not visible to a hospital admin at all (roadmap, Next up 11),
  let alone a group.
- Tenant creation, branding and contact are platform-admin operations, one tenant
  at a time.
- One database, one region. There is no per-tenant data location.

## 4. The design questions, and a recommended answer to each

### 4.1 Does a patient consent to the group or to each hospital?

**To each hospital.** The consent model says a patient shares with an
institution, and the institution that treats them is the hospital. A group is an
owner of hospitals, not a place anyone is cared for, and "I shared with Lagos
Island" cannot be read as "I shared with every hospital this company owns now or
buys later".

What a group legitimately needs is to make sharing with several of its hospitals
**easy**, not implicit:

- On connect, the patient may tick sister hospitals by name — "also share with
  Ikeja and Lekki" — and one action creates one `practice_shares` row per
  hospital. The disclosure lists the names, as `HospitalShareCard` already does
  for one.
- A hospital joining the group later gets nothing from existing shares.
- Revoking one is revoking one; the patient can see and end each separately.

This reuses the existing object entirely (rule 7): no group share, no second
permission set, and `institution_has_*` does not change. The group context is
recorded in `share_events` so the patient's ledger shows the choice was made
together.

### 4.2 Moving a patient between sister hospitals

A transfer is the receiving hospital asking the patient, not the sending
hospital handing the record over. Two cases:

- **Patient already shared with both** — nothing to do; the receiving hospital
  assigns a clinician.
- **Patient has not** — the sending hospital raises a transfer, which reaches the
  patient as a request to share with the named receiving hospital, pre-filled
  with the categories they gave the sender. This is the "refer into the
  hospital" flow that `independent-clinicians-and-hospitals.md` §5 already says
  is missing, and it should be built once for both.

No break-glass, by the existing rule. An emergency transfer where the patient
cannot consent is covered by next of kin, as for a single hospital.

### 4.3 Group roles that see operations, not charts

The group CMD, finance head, operations head, nursing head and HR head need
figures across hospitals. None of them needs a chart to do that, and a group role
must never be a path to one.

- A **group membership** is a `practice_members` row on the group tenant. It is
  never a clinical membership: `institution_has_*` never looks at the group, and
  the group tenant has no `practice_shares`, so there is nothing for it to match.
- A group official who also treats patients — a group CMD who operates at one
  site — holds an ordinary clinical membership at that hospital as well, which
  the patient's share with that hospital governs. The two memberships are listed
  separately so the difference is visible.
- Group screens read **aggregate functions only**: counts, rates and totals per
  hospital, with no patient identifiers, and small cells (fewer than five)
  suppressed so a figure cannot name a person. Examples: connected patients,
  new connections, assignment coverage, open tasks and their age, alert response
  times, staff by role and department, storage, revenue share, invoice totals by
  status.
- Anything a group official reads about a *named* patient requires them to be a
  member of that hospital, with that hospital's audit.

### 4.4 Group roles and local roles — configurable, not coded

Groups will organise differently. One has a group nursing head who hires matrons;
another lets each hospital run nursing. The model has to absorb that as data.

- **Role definitions become a table**, `practice_role_definitions` (tenant,
  key, label, capabilities, is_clinical), seeded with today's ten roles as
  built-in rows. A group or hospital adds "Group Finance Head" or "Matron" as a
  row. The enum stays for the built-ins during migration and is retired after.
- **`is_clinical` on a definition is settable only by OneCare**, and is never
  settable on a role defined at a group tenant. Whether a role reads charts is a
  clinical-governance decision, not a menu choice for a group administrator.
- **Scope is a list of hospitals.** A group membership carries the child
  hospitals it applies to: all of them (the default), or named ones. "Finance for
  the Lagos sites only" is a scope, not a new role.
- **Local roles stay local.** A hospital's own finance lead is a membership at
  that hospital with a hospital-defined role. The group finance head sees the
  group figures; the hospital finance lead sees their hospital's. Both can exist,
  and a group can choose to use only one.
- **Inheritance is capability-by-capability and declared.** A group role grants
  named capabilities *at* the child hospitals in its scope — for example
  `manage_team` (so group HR can onboard staff at each site) or `view_audit`. It
  never grants clinical access, and every inherited action is recorded against
  the child hospital with the group membership named as the authority.

### 4.5 Group billing

OneCare's contract is with the group; money arrives from one payer. The
commercial columns move to the group row (child values inherit unless
overridden by OneCare), and the admin console shows the group with its hospitals
beneath it. `practice_revenue_share_summary` gains a group form that sums its
children. Patient invoices stay per hospital, and `default_currency` is per
hospital — a group across Nigeria and Ghana is reported per currency, never
summed across them. Everything in `billing-and-payments.md` §3 about who takes
payment is unchanged.

### 4.6 Group branding

A group brand on the group row, applied to each child's intake page unless the
child sets its own. A group code (`evercare.onecare.you`) opens a page listing its
hospitals, each linking to its own code, because the patient still connects to a
hospital. Post-login branding stays deferred.

### 4.7 Group audit

The group audit view is the union of its hospitals' tenant logs, each row
labelled with the hospital it belongs to, readable by group roles that hold
`view_audit`. Two changes make that honest:

- Rows should carry the tenant they were written under, so a sister-hospital
  clinician's action is attributed once rather than claimed by both logs. For
  reads, `log_record_access` can record which practice's share admitted the
  read. Old rows stay inferred and are labelled as such.
- Group-level reads of aggregate screens are themselves logged, as tenant
  activity with no patient.

### 4.8 Data residency

A single database in one region serves every tenant. A group whose hospitals sit
under different data-protection regimes (NDPA in Nigeria, Ghana's Data Protection
Act, Kenya's DPA) may be required to keep each country's records in that country.
That is not a group feature; it is a deployment per region, with the group layer
unable to aggregate across the boundary except through figures that carry no
personal data. Out of scope until a named group needs it, and it should be priced
as such.

## 5. Recommended model, in one paragraph

A group is a `practices` row with `tenant_type = 'group'`; each hospital gains
`parent_practice_id` pointing at it, one level deep and no further. Group
officials are members of the group row with a role from a per-tenant role
definition table and a scope listing the hospitals it covers. Their role grants
declared, non-clinical capabilities at those hospitals and access to aggregate
functions that return no patient identifiers. Clinical access is unchanged: it is
decided per hospital, at the moment of the read, by the patient's share with that
hospital and the reader's membership there. Patients connect to hospitals, and
may connect to several sister hospitals in one step by naming them.

## 6. Build plan

| Phase | What | Size |
| --- | --- | --- |
| **0. Make capabilities real** | Enforce `has_practice_capability` in the database wherever the client already gates on it (team, settings, billing, export, audit), make `view_phi`/`edit_clinical` agree with `practice_role_is_clinical` or remove them from the override set, drop the two-argument form, add the overrides editor. Worth doing with no group in sight | 1–1.5 weeks |
| **1. The group entity** | `tenant_type = 'group'`, `parent_practice_id` with a one-level check, group creation and "add hospital to group" on the admin console, group owner invitation, commercial columns inherited from the parent | 1–1.5 weeks |
| **2. Group roles and scope** | `practice_role_definitions` seeded from the enum, scope on group membership, a group-aware `can_manage_practice` for the capabilities a group role declares, every inherited action audited against the child | 2–3 weeks |
| **3. Group dashboards** | Aggregate functions per hospital and rolled up, small-cell suppression, a group workspace in the switcher with finance, operations, nursing and HR views | 2 weeks |
| **4. Consent across sister hospitals** | Multi-hospital connect in one action, the group landing page, the transfer / refer-in request | 1.5–2 weeks |
| **5. Audit, billing, branding** | Tenant on audit rows, group audit view, group revenue-share and invoice roll-up by currency, group brand inheritance | 1.5–2 weeks |
| Deferred | Enterprise SSO (tenancy plan phase E), per-region deployment for residency | — |

A **pilot** — phases 0, 1 and a first cut of 3 with the fixed built-in roles and
whole-group scope — is about four weeks and answers most of what a group CMD
would ask to see in a demo. Configurable roles (phase 2) are what make varied
process flows fit without code changes, and should come before a second group
signs, because the second group will organise differently from the first.

Every phase lands with SQL suites in the existing style: a group official reads
no chart at any child; a scope of three hospitals grants nothing at the fourth; a
hospital leaving the group takes nothing with it; a new hospital joining gains no
existing share; a group role cannot mark itself clinical.

## 7. Where to be careful

- **The group must never appear inside the consent helpers.** The first time
  someone writes "or the caller is a group admin over the practice" into
  `institution_has_*`, every group official can read every chart in the group.
  The test suite should assert it structurally, not only behaviourally.
- **Aggregates leak at small numbers.** "One patient at Lekki with a positive HIV
  result this week" is a name. Suppression is not optional, and nothing clinical
  should be aggregated without a product decision.
- **A hospital leaving a group** — sold, or the contract ends — must leave with
  its patients, staff and history intact and the group's view of it closed from
  that moment, with the period it was visible recorded.
- **One person, many memberships.** A group official with twelve memberships
  needs the group workspace to be the default, or they will act in a hospital
  they did not mean to.
- **Localised roles can contradict group ones.** If group HR and a hospital
  admin can both change a member's role, the last write wins. Decide which one
  governs each capability, per group, and show the other as read-only.

## 8. Open questions for the founder

1. **Consent default.** Should a patient connecting to one hospital in a group
   be *offered* the sister hospitals (recommended), have them pre-ticked, or
   never see them? Pre-ticking is closer to the "share everything" default and
   further from the patient knowingly choosing each institution.
2. **Clinical oversight at group level.** Does any group role — the CMD, a group
   clinical-governance lead — need to read named patient records across
   hospitals for audit or incident review? If yes, that is a new consent
   conversation with patients, not a role setting, and it should be decided
   before a group contract promises it.
3. **Who owns the relationship commercially** — does the group sign one contract
   covering all hospitals, or does each hospital sign and the group roll up? It
   decides where the commercial columns live and who receives the revenue share.
4. **Group-wide departments.** Does a group want "Cardiology" as one service line
   across hospitals (for reporting), or only per hospital? The first is a label
   mapping; the second is what exists.
5. **Nesting.** Are there groups of groups (a region within a group)? The
   recommendation is one level; a region would be a scope, not a tier.
6. **Residency.** Is there a target group whose hospitals span countries with
   residency rules? If so, that is a deployment decision and a price, and it
   should be known before the first group contract.
7. **Who configures roles** — OneCare during onboarding, or the group's own
   administrator from day one? Starting with OneCare-configured roles is safer and
   still needs no code change.
