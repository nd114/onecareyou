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

## 3. Conflicts awaiting a decision

Two of these have a branch per option so they can be reviewed side by side.
**Neither pair should be merged as-is — pick one and close the other.**

### C1. Multi-department scoping — the brief describes a feature that does not exist

The review brief makes "department-scoped clinician access" and "multi-department
readiness (adding a second department should be config, not code)" the top
priority. **There is no department concept anywhere in the repo** — no table, no
column, no UI; the only two matches for "department" are marketing copy on the
pricing pages.

This is not an oversight in the build. The build prompt describes Sub-Admins
overseeing "a group of affiliated clinicians (grouped however the hospital finds
useful, informally)" — deliberately informal grouping, not departments. The repo's
tenancy plan matches the prompt.

So the brief conflicts with both the prompt and the code. **Needs a product call:**
is "department" just another word for the informal Sub-Admin group (in which case
the brief is loose language and nothing is missing), or does OC-LMC actually need
departments as a first-class object with its own scoping? The second is a real
build — a `departments` table, membership, assignment scoping, and an RLS pass —
and it is not what "config, not code" implies today, because there is no config
surface to add a department to.

Closest existing behaviour is C2, which is where per-clinician scoping actually
gets decided.

### C2. Hospital-wide visibility by default — **two branches**

`practice_members.can_view_all_patients` defaults to `true`, inherited from the
original single-practice model, and `institution_has_patient_access()` treats it as
a full bypass. **Today every clinician at a hospital tenant can read every
institution-shared patient's vitals, medications, documents and guidance without
any assignment.** The docs describe the mechanism accurately but never state the
intended default, so this is under-specified rather than wrong.

| | Branch | Approach | Trade-off |
| --- | --- | --- | --- |
| **A** | `claude/oclmc-panel-scope-option-a-assignment-first` | Practice-wide view becomes an admin-only right inside hospital tenants; clinicians need an assignment. | No data migration; a hospital cannot re-widen by flipping the flag. A genuine ward-wide/on-call view would need a new capability. |
| **B** | `claude/oclmc-panel-scope-option-b-hospital-default-false` | Default the flag to `false` for new clinical members of hospital tenants and backfill existing ones; helper unchanged. | Keeps a deliberate escape hatch for on-call cover, at the cost of a default an admin can widen again per person. |

Both are scoped to `tenant_type = 'hospital'`, so Solo and Pro are untouched, and
both were verified against a real database. **Either way this changes what OC-LMC
clinicians can see today** — worth telling the hospital before it ships, since
staff who currently see the whole ward list will stop.

### C3. Default sharing posture by entry channel — **two branches**

The attached consent model (§3) makes the default depend on how the relationship
starts: share-everything through the hospital's own subdomain, granular-by-default
with share-all as an explicit opt-in when the patient starts from inside OneCare.

The repo's own `docs/sharing-access-consent-model.md` omits the distinction
entirely, and `enterprise-hospital-tenancy-plan.md` states a single posture:
"Default is share-everything with a single toggle for a reduced set." The shipped
code follows the repo docs — share-all is the default on both paths.

| | Branch | Approach | Trade-off |
| --- | --- | --- | --- |
| **A** | `claude/oclmc-share-posture-option-a-entry-channel` | Implement the attached policy: in-OneCare starts with nothing selected; subdomain intake keeps share-everything. | Matches the external policy and the private-doctor pathway's own pattern. More friction for a patient connecting from inside the app. |
| **B** | `claude/oclmc-share-posture-option-b-uniform-with-disclosure` | Keep one share-everything default; answer the policy's actual concern with plain disclosure at the moment of connecting. | Fewer clicks during admission, which is when this is used. A patient starting inside OneCare gets a broader default than the private pathway gives them. |

Whichever wins, **the repo's canonical consent doc and the attached one should be
reconciled into one document** — right now they disagree on a consent default,
which is not a safe thing to have two versions of.

### C4. Enterprise pricing is stated three different ways

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
**Needs the v4 model** before any gating logic is written against a number. Nothing
in the code gates on price today, so this is a documentation and commercial
correctness problem rather than a live defect — but it will become one the moment
tier gating is built.

### C5. "Sub-Admin" is documented as shipped but does not exist

`enterprise-hospital-tenancy-plan.md` describes Phase D as shipped, with sub-admins
assigning hospital-shared patients, and the data-model doc repeats it. The
`practice_role` enum has no `sub_admin` value, and assignment is gated on
`can_manage_practice`, which is **owner or admin only**.

So there is no delegated middle layer: to let a ward lead assign patients, the
hospital must make them a full tenant admin, which also grants team management,
billing and settings. Not fixed here because "add a role" and "add a role with
group-scoped oversight" are materially different builds, and the second is what
the prompt describes (a Sub-Admin oversees *a group of* clinicians — the same
grouping question as C1).

---

## 4. Gaps found, not fixed — need a decision or a bigger build

- **Two shared categories are not actually wired.** The patient picker offers
  vitals, medications, documents, **conditions** and **allergies**. Only the first
  three have an institution read path; conditions and allergies live on `profiles`,
  which hospital staff cannot read. A patient can consent to sharing them and the
  hospital will never see them. Fixing it means deciding how to expose exactly
  those fields (a narrow security-definer accessor) — deliberately not done here,
  because widening PHI exposure is a product decision even when consent exists.
- **Adherence is not shared with hospitals either.** `schedule_entries` has no
  institution policy. The panel now reports adherence as unshared rather than
  rendering an empty chart that reads as total non-adherence.
- **Clinician whitelisting does not exist** (build prompt §4). No email-domain
  match, no hospital-managed allowlist, no pending-approval state, no CSV bulk
  onboarding, no offboarding action. Joining a tenant is invite-only via
  `practice_invitations`, which is a reasonable substitute for an allowlist at one
  hospital, but it does not scale to bulk staff onboarding and there is no
  self-registration path to hold in review. Separately, `practice_name` on clinician
  sign-up is free text and unverified — it does not grant anything, but it will
  display as an affiliation.
- **The hospital subdomain serves patients only.** The prompt has it serving both
  patient and clinician registration; `TenantHome` renders the patient intake page
  only.
- **Post-login branding is absent.** Hospital name/logo appear on the pre-auth
  intake page only. The nav bar, favicon and auth screens are plain OneCare, where
  the prompt asks for the "{hospital} by OneCare" lockup. The roadmap lists
  whitelabelling under "Next up", so the repo is internally consistent that this
  is unfinished — but it is worth knowing the hospital's staff and patients see
  OneCare branding everywhere after sign-in.
- **Subdomain DNS is still a hosting task.** The tenancy plan's launch checklist
  has this as its one unchecked item. Resolution logic is correct and tested;
  `<slug>.onecare.you` will not resolve until wildcard DNS and a certificate exist.
  If the hospital has already published the link, this is the thing to confirm first.
- **Per-tenant persistent demo is not built** (prompt §12, deferred as Phase E in
  the repo). The daily reset is narrow enough that it will not destroy a demo
  tenant's data, but there is no way to seed one either.
- **Audit rows are client-written.** `hipaa_audit_logs` INSERT is
  `auth.uid() = user_id`, so the log records what the client chose to report. It is
  sound for the honest-client case and fine for a BAA conversation today, but a
  determined user can omit their own entries. Server-side logging of PHI reads
  belongs on the roadmap before a formal audit.
- **`npm ci` fails** — `package-lock.json` is out of sync with `package.json`
  (`picomatch`). The project builds with bun, so this only bites anyone using npm
  in CI. Left alone deliberately: regenerating the lockfile would produce a large
  diff that conflicts with parallel Lovable work.
- **`.env` is committed.** Contents are the Supabase project id, URL and publishable
  anon key — all public-by-design client values, so this is not a credential leak,
  but it is worth a deliberate decision rather than an accident.

---

## 5. Recommended order of work

1. **Decide C2** (hospital-wide visibility) and ship the chosen branch. This is the
   only finding where the live client's staff currently see more than the model says
   they should.
2. **Decide C3** and reconcile the two consent documents into one.
3. Confirm **subdomain DNS** is actually live for the published link.
4. **Get the v4 pricing model in** and make `pricing-constants.ts` genuinely single-source (C4).
5. **Answer C1** — informal groups or real departments — before anything is built
   against either reading.
6. Wire **conditions/allergies** so the picker cannot promise what it does not deliver.
7. Whitelisting and bulk onboarding, when the hospital's staff list grows past
   what invitations handle.
8. Sub-Admin role (C5), which lands naturally once C1 is answered.

---

## 6. Documentation corrections made

- `enterprise-hospital-tenancy-plan.md` — Phase D no longer claims clinician panels
  distinguish hospital-assigned patients as shipped, because until this branch they
  did not.
- `handbook/data-model.md` — records the permission-aware institution helper, the
  tenant audit function, and the ledger now covering both pathways.
- `sharing-access-consent-model.md` — notes where the canonical doc and the attached
  policy disagree (C3), rather than silently adopting either.
