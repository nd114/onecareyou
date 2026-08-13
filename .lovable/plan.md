# Platform overview, mobile audit, real admin panel, single roadmap

## What I verified before writing this

- The last plan's enterprise work is present in code: hospital code card, revenue-share card, pooled storage card, institution-shared patient assignment card, the granular patient share picker, the tenant-overview hook and the `/admin` console page and route (guarded by the server-verified admin gate).
- `founder@onecare.you` does hold the platform `admin` role in the database, so the gate itself works.
- Gap confirmed: **nothing in the signed-in UI links to `/admin`.** There is no admin entry in the header, the account menu or Settings — the only way in is typing the URL. That matches what you described.
- The admin console today is read-only oversight plus links to careers, import and changelog. It cannot create a tenant, set a hospital code, invite a hospital owner, or delegate admin access.
- `docs/` holds 22 markdown files plus 2 under `docs/strategy`, with overlapping roadmaps (`future-roadmap.md`, `ai-implementation-roadmap.md`, `clinician-gaps-implementation-plan.md`, `implementation-tracking.md`, `requirements-implemented.md`, review/QA docs).
- I could not test authenticated mobile flows in this session: the preview reports no signed-in session, so patient/clinician screens are unreachable to the audit browser. Signing in once in the preview makes the session available next turn.

## 1. Mobile-first audit (first work item)

Run a scripted mobile-viewport sweep (390x844 and 768x1024) against the live preview, signed in as a demo patient, a demo clinician and the founder admin. For every pillar and sub-tab: render, tap primary actions, submit one form, confirm no overlap between the bottom tab bar, the FAB stack and sticky sub-tab bars, and capture console/network errors.

Coverage list:
- Patient: Today (Overview, Schedule, Catch-up), My Health (Vitals, Medications, Vault, Adherence), Care Team (Messages, Care Circle, Family), Learn (Ask AI, Knowledge Base), Settings, Simple Mode.
- Clinician: Today, Patients (list, detail, managed record, import), Communicate (messages, guidance, dictations), Practice (team, storage, hospital code, revenue share, assignments), Templates, Audit, Compliance.
- PWA/Capacitor: manifest + icon set, standalone launch routing per role, offline banner and queue drain, safe-area insets on notched devices, back-gesture behaviour.

Output: a findings table (route, severity, symptom) written into the new roadmap, then fixes applied in severity order — P0 broken flows first, then layout/overlap, then polish.

## 2. Usability and "not another EHR" guardrails

Rather than adding surface area, this pass reduces it:
- One primary action per screen on mobile; everything else moves behind a sheet or the action rail.
- Clinician Practice page split into digestible cards with progressive disclosure — enterprise-only cards hidden entirely for solo clinicians.
- Patient pages keep the calm editorial look (emerald/cream/gold, Fraunces headlines, eyebrow labels); no dense grids, no clinical jargon, plain-language labels.
- A short "surface budget" section in the roadmap: any new feature must either replace an existing surface or justify itself against the four pillars.

## 3. Real platform admin panel

Make `/admin` the actual operations console, discoverable and capable.

Discoverability
- Admin entry in the signed-in account menu and in Settings, rendered only when the server-verified admin check passes.
- After sign-in, an admin lands on `/admin` rather than the patient dashboard.

Sections
- **Overview** — existing cross-tenant metrics, plus recent sign-ups and storage nearing allowance.
- **Tenants** — create a practice or hospital tenant (name, type, city/country, tier, storage allowance, revenue-share rate); edit those fields; set or change the hospital code (slug) with the existing availability check; deactivate a tenant.
- **Tenant owner invitations** — invite the person who will run a hospital by email; on acceptance they become that tenant's owner with full practice-level admin, without OneCare staff holding their credentials.
- **Delegated platform access** — grant or revoke the platform `admin` role for a OneCare staff member by email, with every grant/revoke written to an audit log and the last admin protected from removal.
- **Careers**, **Changelog**, **Import** — existing tools moved under the console shell instead of loose routes.
- **Audit search** — cross-tenant read-only view of admin actions and access logs.

Subdomains (`<slug>.onecare.you`)
- The console will own the slug, validate it and show its resolved URL, so the record is ready. Actual wildcard DNS + certificate for `*.onecare.you` is a hosting-side setup outside the app; the app side will read the slug from the hostname when that is in place. I will flag it in the roadmap as a hosting task rather than pretend it is app work.

Backend
- New tables for platform-admin action logging and tenant-owner invitations, with grants, RLS and admin-only policies; security-definer functions for tenant creation, slug assignment and role delegation, all admin-gated. Delivered as one migration for your approval.

## 4. Docs consolidation

- Rename `docs/future-roadmap.md` → `docs/roadmap.md` as the single living tracker. Header states its purpose: what is shipped, when, what is next, what is deliberately deferred.
- Structure: Purpose · Now (in flight) · Shipped log (dated, newest first) · Next up (sequenced) · Deferred with reasons · Guardrails · Companion docs.
- Fold in and delete: `ai-implementation-roadmap.md`, `clinician-gaps-implementation-plan.md`, `clinician-strategic-roadmap.md`, `implementation-tracking.md`, `requirements-implemented.md`, `comprehensive-platform-review.md`, `qa-report-jul-2026.md`, `ui-redesign-plan.md`, `tech-and-process-opportunities.md`, `launch-plan.md`.
- Keep as standalone, linked from the roadmap: `qhin-integration-plan.md`, `whatsapp-integration-plan.md`, `enterprise-hospital-tenancy-plan.md`, `sharing-access-consent-model.md`, `pricing-roadmap.md`, `platform-documentation.md`, `branding.md`, `caregiver-access-system.md`, beta pack/NDA, `funding-strategy.md`, `strategy/`.
- Update the roadmap's status flags against the code as it actually is now (enterprise tenancy, clinician depth phases, AI assistants, storage metering, beta flow, Google sign-in).

## Sequence

1. Mobile/PWA audit sweep + findings table.
2. P0 functional fixes, then layout/overlap fixes.
3. Admin panel migration, then console build-out and discoverability.
4. Roadmap consolidation and doc deletions.

## Technical notes

- Admin gating stays server-side via `has_role(auth.uid(),'admin')`; no client-side role assumptions.
- Tenant creation and role delegation go through security-definer functions rather than direct table writes, so RLS stays strict and every action is logged.
- Audit browsing needs a signed-in preview session; sign in once as the founder account in the preview and the authenticated sweep runs on the next turn.
