# Hospital operations, role isolation, and record continuity

This is a staged hardening programme. Each stage is independently testable and deployable; access enforcement and data correctness come before interface polish.

## Confirmed problems

- Active clinician assignments contain duplicates: 8 active rows represent only 6 distinct practice/patient/clinician relationships. The assignment write is a plain insert, and the database has no uniqueness guard.
- Assignment changes refresh only the hospital list, not the assigned clinician’s patient list or usage counts. Disconnects also leave assignment rows active in the interface until refresh.
- Patient lists count relationships rather than people, so the same person can appear and count twice when they have both a private and hospital relationship.
- The code has a practice-specific permission matrix, but the demo hospital has no overrides. Several Practice cards and routes do not consistently apply those permissions.
- `usePractice()` and the capability hook silently select the first membership. A clinician with personal work plus one or more hospital posts has no visible workspace selector.
- Hospital personnel are loaded and rendered as one unpaginated list. Role/profile management is incomplete.
- Current document links are created as downloads even when the in-app viewer requests an inline preview. Billing is not a Vault category.
- Patient theme controls are not in the signed-in profile menu.
- Audit information is split across several logs; many ordinary actions write no audit entry. Patient 2 currently has only two sharing events, two patient actions, and no access-log rows.
- Sending to a disconnected patient is correctly denied, but the interface exposes the database error. Historical record/message visibility needs an explicit, read-only legal-retention path.

## Phase 1 — Stop duplication and stale access

- Add a database-enforced active-assignment uniqueness rule and an idempotent assignment function. Collapse existing duplicate active rows without deleting history: retain one active relationship and end the extras with an auditable reason.
- Require an active hospital share in every current institutional-access helper. A disconnected hospital must immediately lose current access while preserved snapshots and historical events remain intact.
- Make assignment, reassignment, removal, and disconnect update all affected lists and counts immediately. Invalidate the hospital roster, clinician patient list, practice overview, usage, and activity queries together.
- Deduplicate displayed patients by person inside each workspace while retaining separate private and institutional relationship metadata. Usage counts count unique active people, not assignment rows.
- Add regression tests for repeated assignment, simultaneous assignment requests, disconnect, reconnect, multi-clinician assignment, unique counts, and tenant isolation.

## Phase 2 — Clean hospital management

- Split Practice management into focused destinations:
  - **Personnel** — searchable, paginated staff directory; invitations; profile review; role changes; offboarding.
  - **Departments** — departments, leads, membership, and staff recognition/allowlist.
  - **Patient routing** — shared patients, departments, clinician assignments, reassignment, and unassigned queues.
  - **Operations** — contact/branding, EHR, billing currency, plan, storage, and revenue cards, each capability-gated.
- Add server-backed personnel search and pagination rather than paginating a truncated client list.
- Add a staff profile view that clearly separates the clinician’s personal professional identity from their role, departments, and permissions at this hospital.
- Add bulk routing and an offboarding flow that requires active patients to be reassigned or explicitly placed in an unassigned queue.

## Phase 3 — Configurable roles with safe defaults

- Make the existing practice-scoped role/capability matrix editable by authorised owners/admins, with changes enforced in the database and written to the audit trail.
- Keep fixed system roles as templates, then allow hospital-specific overrides. Protect non-delegable powers such as changing ownership, granting platform administration, or editing one’s own authority.
- Use these defaults:
  - **Owner/Admin:** hospital administration; clinical access is not implied solely by administration and must follow an assignment or explicit clinical role.
  - **Sub-admin/Department lead:** manage their departments, routing, and staff within delegated scope.
  - **Clinician/Provider:** assigned clinical records, encounters, guidance, messaging, and personal independent work.
  - **Nurse:** assigned or department-scoped records, observations, care actions, messaging, and notes; no billing/EHR/team administration by default.
  - **Front desk:** patient directory, invitations, appointments, and non-clinical contact details; no clinical record, billing, subscription, EHR, or audit access by default.
  - **Billing:** invoices and billing workflow only; no clinical record, EHR, team, or subscription administration by default.
  - **Staff:** minimal custom role with no access by default; administrators explicitly grant capabilities.
  - **Read only:** custom per hospital with no permissions by default.
- Add route and control guards for Compliance, Reports, Invoices, currency, subscription, storage, revenue, EHR, settings, imports, and patient status filters. An unavailable tab is hidden; a direct URL shows a clear access-denied page instead of silently returning to Today.
- Document who each role is intended for and which capabilities are available, configurable, and prohibited.

## Phase 4 — Front desk and nurse workflows

- Give front desk staff a scoped patient directory and appointment workflow: select patient, clinician, date/time/type, add a non-clinical note, and notify the patient according to preferences.
- Give nurses department/assignment-based access to permitted records, clinician notes, observations, and care tasks.
- Add structured nurse care entries such as medication administered, observation, intervention, and escalation. Record the nurse as actor, the responsible clinician when acting on their behalf, timestamp, note, and patient.
- Never let “on behalf of” replace the actual actor. Both identities remain visible and auditable.
- Make read-only and custom staff screens derive entirely from configured capabilities rather than masquerading as front desk.

## Phase 5 — Personal work and hospital workspaces

- Add an explicit workspace selector for clinicians with multiple contexts: **Personal practice** plus each hospital membership.
- Persist the selected workspace per user and key capability, patient, schedule, reports, billing, and Practice queries by that workspace. Never use the first membership implicitly.
- Keep a clinician’s personal patients independent from hospital patients. If the same patient has both relationships, show one person with clearly separated relationship badges and permissions, never merge consent or ownership.
- Switching workspace changes organisational data and authority, but never edits the clinician’s personal professional profile.

## Phase 6 — Disconnect continuity and messaging

- Keep current sends blocked after disconnect, but replace raw policy errors with “This connection has ended; new messages are unavailable.”
- Preserve read-only historical messages, signed notes, guidance, addenda, audit events, and immutable care-record snapshots that were created while access was valid.
- Show the disconnected patient in a historical-record state only when the clinician had legitimate access at the event time; hide current data and actions.
- Verify this separately for personal shares, hospital shares, assignments, department access, clinician departure, and hospital suspension.

## Phase 7 — Vault, theme, and long histories

- Add **Billing** as a Vault category across upload, edit, filters, search, and document summarisation.
- Separate inline preview links from download links. Detect previewable files from both MIME type and extension, show a useful fallback, and browser-test PDF, image, text, and unsupported formats.
- Put Light/Dark/System controls inside the patient profile menu on desktop and mobile, using the existing shared theme state.
- Add server-backed pagination to sharing history, patient activity, and audit trails. Show total/result state honestly rather than paginating a hidden fixed-size subset.

## Phase 8 — Complete audit coverage

- Define one audit event catalogue for access, viewing, downloads, assignment/routing, consent/share changes, appointments, messages, clinical writes, signed-note addenda, nurse actions, role/permission changes, billing/settings changes, and EHR actions.
- Route writes through trusted database functions or server actions so important events cannot be silently skipped by the interface.
- Keep patient-facing history understandable while preserving detailed practice compliance logs. Audit failures for regulated actions must be visible and must not be swallowed.
- Backfill only facts provable from retained source rows; do not invent historical events.

## Verification and rollout

- Regenerate database types after schema work and remove temporary casts touched by this programme.
- Extend database tests for RLS, cross-tenant isolation, capability overrides, duplicate prevention, historical access, and audit immutability.
- Add focused interface tests for query refresh, unique counts, workspace selection, and access-denied behavior.
- Browser-test the owner, admin, department lead, clinician/provider, nurse, front desk, billing, minimal Staff, custom Read only, disconnected clinician, and patient accounts.
- For every role, test visible navigation, direct URLs, reads, writes, denied actions, workspace switching, assignment changes without refresh, disconnect without refresh, and audit entries.
- Run the focused suites first, then the full suite, build, runtime/error logs, and security scan before go-live.

## Technical safeguards

- Schema changes use migrations with grants, row-level security, and policies in the required order.
- No role or capability is trusted from browser storage; all authority remains database-enforced.
- No hard deletion of clinical, sharing, assignment, messaging, or audit history.
- Personal and institutional access remain independent consent pathways throughout.
