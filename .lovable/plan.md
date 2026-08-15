# Catch-up, outstanding work, and a full bug sweep

## 1. Where the platform stands (verified against the code today)

Recent landed work confirmed in the repo and roadmap: departments + sub-admin role, clinician
whitelisting/bulk onboarding/offboarding, all share categories now returning data, hospital codes
from the admin console, enterprise cards hidden for solo practices, admin overview + audit search,
mobile structural fixes (tab-bar clearance, dvh, notch insets, PWA colours, Capacitor build config),
branded hospital front door for staff and patients, and the five migrations from the last round
applied with the institution access test passing 14/14.

## 2. Outstanding from the plans (nothing new invented here)

Carried over from the roadmap's "Now" and "Next up", plus the two review docs:

- Authenticated mobile sweep — never run with a signed-in session; still the top open item.
- Table overflow on the four pages that render real tables (`ClinicianAudit`, `ClinicianPricing`,
  `DataProcessing`, `ClinicianWhyOneCare`).
- Manifest orientation locked to portrait, wrong for clinicians on tablets.
- Server-side audit logging (`hipaa_audit_logs` currently written by the client).
- Assignment-first access default for hospitals (branch prepared, not switched on).
- Cross-tenant audit search, enterprise management depth (rosters, caseload, owner KPIs).
- Clinician depth phase 4 (patient-detail action rail, risk drawer).
- Accessibility pass (icon-button labels, alt text, gold-on-cream contrast, 200% font size).
- Simple Mode as a stored preference rather than a buried sub-tab.
- Offline reads for messaging; language priorities (Pidgin/Hausa/Yoruba/Igbo before ES/FR).
- Deferred on purpose: full UI redesign, native store builds, EHR write-back, SW HTML caching, E2EE.

## 3. The bug sweep (the bulk of this task)

Scripted, signed-in passes over each role at 390x844, 768x1024 and desktop, capturing console
errors, failed network calls, and screenshots. For each role: every pillar, every sub-tab, and the
primary write flow on each surface.

- **Patient**: Today, My Health (vitals, medications, vault, family), Care Team (care circle,
  messages, guidance), Learn (knowledge base, assist). Writes: add vital, add/edit/discontinue
  medication, upload document, share document, invite clinician, send message, edit profile.
- **Clinician**: Today/triage inbox, Patients (list, search, pagination, detail, managed record),
  Communicate (messages, guidance, templates), Practice (team, departments, allowlist, storage,
  contact, subscription). Writes: invite patient, create guidance, assign patient, encounter +
  scribe draft, task create/complete, internal note.
- **Platform admin**: Console tabs (overview, tenants, access, activity, audit), tenant detail and
  branding, careers, docs, changelog, import — plus the host restriction behaviour.
- **Guest / tenant host**: marketing routes, pricing audience switch, `/for-clinicians`, beta
  landing + NDA + booking, branded tenant intake (`/` and `/staff` on a tenant host).
- **Cross-role leakage**: each role visiting the other roles' routes must redirect, not render empty.

Also in scope: React key/ref warnings already visible in the console (the `ThemeMenu` /
`DropdownMenuContent` ref warning on every page load), unhandled promise rejections, duplicate or
N+1 queries on the heavier pages, and empty/loading/error states that render as blank.

## 4. How findings are handled

Findings are triaged P0 (broken flow or data leak) → P1 (wrong behaviour, visible error) → P2
(polish). P0 and P1 that are unambiguous get fixed in the same pass. Anything needing a product
decision, a schema change, or real hardware is written up rather than guessed at. Results are
recorded in a single new review doc under `docs/reviews/` and the roadmap is updated in place — no
new tracking documents.

## Technical notes

- Sweep driven by Playwright scripts under `/tmp/browser/`, using a minted preview session per role
  so authenticated surfaces are actually reachable this time (the gap in the 13 August sweep).
- Database-side checks stay read-only (`supabase--read_query`, linter, security scan). Any RLS or
  function gap found is reported and, if a fix is needed, raised as its own migration for approval
  rather than bundled into UI work.
- No redesign work: fixes stay inside the existing Emerald Prestige tokens and the four-pillar IA.
