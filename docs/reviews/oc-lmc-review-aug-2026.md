# OC-LMC and platform review — August 2026

Full-codebase review with a focused pass on the hospital-tenant feature, which is
live in front of the first hospital client. Ordered by what affects that client.

**Method.** The repo's own docs were read first and treated as the record of why
things are built the way they are; the externally supplied brief, consent model
and build prompt were read afterwards. Where the two disagree, the disagreement
is written down rather than resolved (see [Conflicts](#conflicts-awaiting-a-decision)).
Access-control claims were verified by replaying the whole migration history into
a local Postgres and querying as each role — RLS is the security boundary, so UI
filtering was not accepted as evidence. Those checks are now committed as
`supabase/tests/institution_access.test.sql`.

**Baseline.** Typecheck clean, 15 tests passing before this work, 24 after.

---

## 1. What matches the spec

Verified as built and behaving as documented:

- **Two independent pathways.** `provider_shares` (private) and `practice_shares`
  (institutional) are genuinely separate tables with separate helpers. Neither
  overrides the other; disconnecting one leaves the other intact.
- **No break-glass.** There is no path for hospital staff to read a record without
  an active share. Confirmed by policy inspection across `vitals`, `medications`,
  `health_documents`, `clinician_guidance`, and by query as an unrelated tenant.
- **Nothing is hard-deleted.** Revocation is a status change with `revoked_at/by/reason`
  preserved. Historical read access for a revoked private clinician is deliberate
  and documented.
- **Authorship survives reassignment.** Guidance stays readable to its author via
  `auth.uid() = clinician_user_id`, independent of any current share — so moving a
  patient between doctors does not rewrite who wrote what.
- **Private notes never auto-file.** The private/patient-facing split is structural
  (`internal_notes` vs `clinician_guidance`), not a flag that could be mis-set.
- **Tenant fallback.** An unknown subdomain falls back to the marketing site rather
  than erroring or leaking a tenant list.
- **Revenue share excludes private patients.** Counted from `practice_shares` only.
- **Platform vs hospital admin layers are separate.** Platform admin is gated on
  server-verified `has_role(admin)`; tenant admin on `can_manage_practice`. Neither
  is inferred client-side.
- **Demo reset is narrow.** `reset-demo-accounts` re-seeds five fixed
  `demo-*@onecare.you` accounts and deletes only by those user ids. An enterprise
  demo tenant would not be caught by it (see §4 for what is still missing).

---

## 2. Fixed in this branch

Each is a defect against the repo's own documentation, the build prompt, or both —
nothing here required a product decision.

| # | Finding | Why it mattered |
| --- | --- | --- |
| 1 | **Granular hospital sharing was advisory only.** The patient's category picker wrote `share_all`/`permissions`, but the institution policies checked only that an active share existed. A patient who shared vitals only still exposed medications and documents. | Consent bypass on the live pathway. Highest-severity finding. |
| 2 | **Cross-tenant assignment bleed.** `is_assigned_to_patient()` matched an assignment from any practice, so being assigned at hospital A satisfied the check for a membership at hospital B. | Access derived from a tenant the patient never shared with. |
| 3 | **A hospital could restart a patient's consent.** The practice-admin UPDATE policy on `practice_shares` had no direction, so an admin could set `is_active` back to true. | Re-sharing must be a fresh patient action. |
| 4 | **Institution shares had no ledger.** `share_events.share_id` was `NOT NULL` against `provider_shares`, so connect/revoke/re-share on the hospital pathway was recorded nowhere. | No audit trail of institutional consent. Now trigger-written, with backfill. |
| 5 | **Hospital-assigned patients never reached the clinician.** `practice_patient_assignments` was written by the Practice page and read by nothing: the patient panel queries `provider_shares` only. Assigning a patient to a doctor had no visible effect for that doctor. | The delegation pathway ended at the database. Panels now merge both sources, tagged Private vs Hospital, named per hospital when a clinician has several. |
| 6 | **Institution patients had no name.** `get_patient_identity()` had no institution path, so patients who arrived through the hospital resolved to no name on the hospital's own screens. | Assignment desk unusable at scale. |
| 7 | **The tenant audit log showed each admin only their own actions.** The RLS policy on `hipaa_audit_logs` is `auth.uid() = user_id`. | "Hospital admin can review their tenant's access log" was not achievable — and it is the first thing a compliance reviewer asks for. Added `practice_audit_log()`, scoped to actors inside the tenant. |
| 8 | **Internal notes did not exist for hospital-assigned patients.** Gated on the private-share helper alone. | The private note type was missing exactly where ward staff need it. |
| 9 | **Multi-hospital affiliation was broken two ways.** `has_practice_capability()` resolved membership with an unordered `LIMIT 1` across all tenants; the UI hook used `maybeSingle()`, which errors on multiple rows and fell through to the "solo clinician" branch that grants every capability. | Multi-affiliation is explicitly supported by the sharing model. Capability checks are now tenant-scoped. |
| 10 | **Branding re-themed the product.** The branded sign-up page painted tenant `primary_color`/`accent_color` over the panel and submit button. | Both the tenancy plan and the build prompt say name/logo only. Colour pickers removed from both branding cards; previews now show the real "{hospital} by OneCare" lockup. |
| 11 | **`?tenant=<slug>` was honoured in production.** Any visitor to `onecare.you?tenant=lmc` got the hospital's branded intake. | The address a patient arrives at is what selects the sharing posture — a query parameter must not stand in for it. Now preview/local only. |
| 12 | **Assign control shown to people who cannot assign.** Gated on `can_view_all_patients` while the RLS policy is `can_manage_practice`, so the write was refused. | Also added the connection-status filter the consent model requires as the way a hospital notices a disconnection. |
| 13 | **Clinical notes silently no-opped.** For a hospital-assigned patient the write matched no row and still reported success. | Mutation now verifies the write landed. |
| 14 | **Revenue share counted non-paying patients.** Every connected patient was multiplied by the premium price. | Overstated what the hospital is owed. Now counts patients actually on a paid plan. |

---

## 3. Conflicts — all now decided

All five were put to the product owner and answered in August 2026. Each entry
keeps the original finding and records the decision and what was done.

### C1. Multi-department scoping — **decided: build departments**

The review brief makes "department-scoped clinician access" and "multi-department
readiness (adding a second department should be config, not code)" the top
priority. **There is no department concept anywhere in the repo** — no table, no
column, no UI; the only two matches for "department" are marketing copy on the
pricing pages.

This is not an oversight in the build. The build prompt describes Sub-Admins
overseeing "a group of affiliated clinicians (grouped however the hospital finds
useful, informally)" — deliberately informal grouping, not departments. The repo's
tenancy plan matches the prompt.

**Decision:** departments are real and first-class. The chief admin creates them
and appoints a sub-admin to run each; sub-admins manage clinician assignment
within their own department.

**Built.** `practice_departments`, `practice_department_members` (with `is_lead`
marking the sub-admin), `practice_patient_departments` for routing, and
`department_id` on assignments. Adding a department is now genuinely config — a
name in a text box — rather than code. Delegation is bounded in RLS and covered
by `supabase/tests/department_delegation.test.sql`.

The chief admin also asked for oversight, which is `practice_staff_overview()`
and `practice_patient_overview()`: every clinician with their departments,
caseload and access basis, and every patient with their department and who holds
them, plus the tenant audit log they already had.

### C2. Hospital-wide visibility by default — **decided: keep it, for now**

`practice_members.can_view_all_patients` defaults to `true`, inherited from the
original single-practice model, and `institution_has_patient_access()` treats it as
a full bypass. **Today every clinician at a hospital tenant can read every
institution-shared patient's vitals, medications, documents and guidance without
any assignment.** The docs describe the mechanism accurately but never state the
intended default, so this is under-specified rather than wrong.

**Decision:** leave the default broad and do not merge either branch yet. The
sub-admins who would route access are not onboarded, so restricting access before
that workflow has anyone running it creates friction with no working mechanism to
route around it. Access is audited, so this is a stated trade-off rather than an
oversight.

**Direction:** option A (assignment-first) is the target once sub-admins are
onboarded and trained. `claude/oclmc-panel-scope-option-a-assignment-first` stays
open as the future state. Option B was closed — not the direction.

**Done:** the reasoning and the revisit trigger are recorded as a column comment
on `can_view_all_patients`, so anyone reading the schema finds it, and the
roadmap carries the switch as a tracked next step.

### C3. Default sharing posture by entry channel — **decided: one posture, disclosed**

The attached consent model (§3) makes the default depend on how the relationship
starts: share-everything through the hospital's own subdomain, granular-by-default
with share-all as an explicit opt-in when the patient starts from inside OneCare.

The repo's own `docs/sharing-access-consent-model.md` omits the distinction
entirely, and `enterprise-hospital-tenancy-plan.md` states a single posture:
"Default is share-everything with a single toggle for a reduced set." The shipped
code follows the repo docs — share-all is the default on both paths.

**Decision:** collapse the channel distinction. Share-everything is the default
on both paths, because clinicians work best with the full picture and a partial
record recreates the asymmetry the platform exists to remove. What makes it
legitimate is disclosure at the moment it happens, plus the patient being able to
deselect any category.

Neither branch matched exactly — A implemented the split, B kept one posture but
was framed as an alternative rather than the rule — so both were closed and the
disclosure was applied on the main line instead.

**Done:** both entry paths now carry the disclosure on the screen where the
patient acts, naming what is shared, that it includes data added from then on,
and that it can be restricted or ended later. The code already defaulted to
share-all on both paths, so behaviour did not change — disclosure and
documentation did. The canonical consent doc now states that it supersedes the
external one on this point.

**Also fixed as a consequence:** the in-app flow exists and is mounted in Care
Circle, so this was not new scope. It is code-entry only, though — a patient
connects by typing the hospital's code, and there is no searchable directory of
hospitals. If "select a hospital" is meant to mean browse-and-pick, that is a
separate build and a listing decision (which hospitals are publicly discoverable).

### C4. Enterprise pricing is stated three different ways — **decided: no change**

- `docs/pricing-roadmap.md` "Proposed tiers" and every revenue table: **$249/month**
- The same file's "Current feature gating" table and regional-pricing section: **Solo $79 / Pro $149 / Enterprise $399+**
- `src/lib/pricing-constants.ts`, named in `platform-documentation.md` as the single
  source of truth for "pricing, tiers and limits": **contains patient pricing only** —
  no clinician or enterprise tier at all. `ClinicianPricing.tsx` renders a tier table
  with no prices attached to it.
- The review brief: **$2,000–$3,500/month** for large Nigerian hospitals, "not the
  earlier $399 figure", referencing an enterprise pricing model (v4) that was not
  supplied with this review.

Four figures, and the file the docs call authoritative does not carry any of them.

**Decision:** nothing public changes. "From $399/month" is a deliberate self-serve
floor with Contact Sales beyond it, not a stale number; large-hospital rates are
negotiated and not published. Clinician pricing and enterprise pricing are
separate products and must not be conflated.

**Done:** the v4 model is now recorded in `pricing-roadmap.md` — size and regional
fee bands (OC-LMC at Nigeria / large hospital, $2,000–3,500), planned regional
patient pricing against the live global rate, the 70/30 split, onboarding, storage
and prepay terms — with the older tables marked as historical drafts. One code
implication is flagged there: the revenue-share card derives the hospital's share
from the global premium price, which holds only while every market pays the same
rate.

### C5. "Sub-Admin" is documented as shipped but does not exist — **decided: build it**

`enterprise-hospital-tenancy-plan.md` describes Phase D as shipped, with sub-admins
assigning hospital-shared patients, and the data-model doc repeats it. The
`practice_role` enum has no `sub_admin` value, and assignment is gated on
`can_manage_practice`, which is **owner or admin only**.

So there was no delegated middle layer: to let a ward lead assign patients, the
hospital had to make them a full tenant admin, which also granted team
management, billing and settings.

**Built.** `sub_admin` is a real role, scoped by the departments it leads (C1). A
sub-admin routes patients, assigns clinicians within their own department, and
reads their department's roster and audit log — and cannot manage the team,
billing, settings, branding or the hospital code. Lead status is guarded by a
trigger as well as policy, so delegation cannot extend itself.

---

## 4. Gaps found, not fixed — need a decision or a bigger build

- ~~**Two shared categories are not actually wired.**~~ **Fixed.** Conditions and
  allergies now reach clinicians through `get_patient_clinical_profile()`, which
  releases each field only if that category was shared — so sharing allergies does
  not disclose conditions, and the profile row itself is never exposed.
  `blood_type` is deliberately still withheld: no category covers it, so no
  patient has consented to it. Allergies and conditions are also now *displayed*,
  above the tabs on the patient record, which they were not for either pathway.
- ~~**Adherence is not shared with hospitals either.**~~ **Fixed.** Dose history
  follows the medications category the patient already chose.
- ~~**Clinician whitelisting does not exist.**~~ **Built.** Approved email domains
  or a hospital-managed allowlist affiliate staff automatically; anyone else lands
  in pending approval holding nothing. CSV bulk import, approve/reject, and
  offboarding that ends hospital access while keeping the clinician's account,
  private patients and authored history. Still true: `practice_name` on clinician
  sign-up is unverified free text — it grants nothing, but it displays as an
  affiliation, and a hospital-facing name should come from the tenant, not a
  self-typed string.
- **The hospital subdomain serves patients only.** The prompt has it serving both
  patient and clinician registration; `TenantHome` renders the patient intake page
  only. Clinicians now have a self-serve route to affiliation
  (`request_practice_affiliation`), but no branded entry point on the hospital's
  own address. Worth adding.
- ~~**Post-login branding is absent.**~~ **Decided: keep it that way for now.** The
  branded sign-up page carries name, logo *and* brand colours — it is the
  hospital's front door. Everything behind sign-in stays Emerald Prestige.
  Recorded in the tenancy plan and tracked on the roadmap as a future option.
- ~~**Subdomain DNS is still a hosting task.**~~ **Live.** `lmc.onecare.you`
  resolves and the hospital has published the link.
- **Per-tenant persistent demo is not built** (prompt §12, deferred as Phase E in
  the repo). The daily reset is narrow enough that it will not destroy a demo
  tenant's data, but there is no way to seed one either.
- **Audit rows are client-written.** `hipaa_audit_logs` INSERT is
  `auth.uid() = user_id`, so the log records what the client chose to report. It is
  sound for the honest-client case and fine for a BAA conversation today, but a
  determined user can omit their own entries. **Carried forward deliberately** —
  now tracked on the roadmap as "server-side audit logging", to be reviewed before
  any formal audit. This matters more now that C2 leaves visibility broad and the
  audit log is the compensating control.
- **`npm ci` fails** — `package-lock.json` is out of sync with `package.json`
  (`picomatch`). The project builds with bun, so this only bites anyone using npm
  in CI. Left alone deliberately: regenerating the lockfile would produce a large
  diff that conflicts with parallel Lovable work.
- **`.env` is committed.** Contents are the Supabase project id, URL and publishable
  anon key — all public-by-design client values, so this is not a credential leak,
  but it is worth a deliberate decision rather than an accident.

---

## 5. What is left

Everything from the original list is done or consciously deferred. What remains:

1. **Onboard and train the hospital's sub-admins**, then switch to assignment-first
   access (C2) from the branch held open for it. This is the one place where the
   live client's staff still see more than the model describes.
2. **Server-side audit logging**, which is the compensating control for that gap.
3. **A clinician entry point on the hospital's subdomain**, so staff registration
   is as branded as patient registration.
4. **Regional pricing**, when it lands, must fix the revenue-share estimate's
   dependence on the global premium price.
5. **EHR integration** and **wearables**, both now planned in their own documents.
   The wearables provenance work is worth doing before any device integration
   exists — retrofitting the clinical/consumer distinction into charts people
   already trust is much harder than building it in.

---

## 6. Documentation corrections made

- `enterprise-hospital-tenancy-plan.md` — Phase D no longer claims clinician panels
  distinguish hospital-assigned patients as shipped, because until this branch they
  did not.
- `handbook/data-model.md` — records the permission-aware institution helper, the
  tenant audit function, and the ledger now covering both pathways.
- `sharing-access-consent-model.md` — notes where the canonical doc and the attached
  policy disagree (C3), rather than silently adopting either.
