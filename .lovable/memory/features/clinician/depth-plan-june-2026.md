---
name: Clinician Depth Plan (June 2026)
description: 4-phase plan to add RBAC, patient panels, encounters, templates, audit surface, and patient-detail action rail to the clinician side. Source of truth in .lovable/plan.md; strategic out-of-scope items in docs/clinician-strategic-roadmap.md.
type: feature
---

# Clinician Depth Plan

**Plan:** `.lovable/plan.md` · **Strategic out-of-scope:** `docs/clinician-strategic-roadmap.md`.

## Phase 1 (shipping first)
- **RBAC** — `practice_role` enum extended with `clinician`, `nurse`, `front_desk`, `billing`, `read_only`. Capability matrix in DB function `has_practice_capability(user, capability)` + per-practice overrides in `practice_role_permissions`. UI uses `useClinicianCapabilities()` to hide actions.
- **Patient panels** — `practice_patient_assignments(patient, clinician, assignment_role, effective_from/to)`. Nurses/front_desk see only patients they are **explicitly co-assigned to** (assignment_role `support`); audit log on every read. Helper: `is_assigned_to_patient(user, patient)`.
- **Today/Triage Inbox** replaces Clinician Dashboard hero.
- **Encounter** object anchors notes, dictations, guidance, future billing.
- **Tasks** — `practice_tasks`, auto-created from alerts and guidance.

## Phase 2
DB-backed `guidance_templates` (private/practice/platform-curated), specialty packs (cardio/endo/CHF), visit templates, bulk cohort actions, internal practice messaging (`messages.thread_type='internal'`), `referrals` table (intra-OneCare + scoped external share).

## Phase 3
Practice page splits into `/clinician/practice/{team,billing,branding,ehr,audit,compliance}`, each `useClinicianCapabilities`-gated. Audit viewer over `hipaa_audit_logs` + `access_audit_logs`. Compliance pack export. Owner KPI reports.

## Phase 4
Persistent action rail on Patient Detail. Network Records tab (QHIN shell, wired to existing `qhin_imports` + `qhin_record_provenance`). Risk explanation drawer.

## Decisions (June 2026)
- Subscription stays **per-seat**; revisit once unit economics warrant per-practice billing.
- Nurse/front_desk see **co-assigned patients only**; every access logs to `hipaa_audit_logs`.
- CPT-code suggestion lives in **Phase 2**, not 1.
- PWA standalone launch routes user to their role's "Today" pillar (`StandaloneLaunchRedirect` in App.tsx).

## PWA hardening (Part D)
- `manifest.json`: `start_url:/`, `id:/`, real 192/512/maskable icons under `public/icons/`, `shortcuts` for Today/Vitals/Meds/Messages, `display_override`.
- `index.html`: apple-touch-icon now 180×180, theme-color split light/dark.
- `StandaloneLaunchRedirect` redirects standalone-launched authenticated users from `/` to `/clinician/dashboard` (clinician) or `/dashboard` (patient).
- No service worker added — kill-switch SW at `/sw.js` remains, `useServiceWorker` stays no-op.
