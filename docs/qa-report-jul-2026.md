# QA Report — July 2026 Sprint

Automated Playwright sweep against `http://localhost:8080` using demo accounts
(`demo-patient-1@onecare.you` / `demo-clinician-1@onecare.you`, both `Demo123!`).

## Findings & Fixes

### P0 — Cross-role leakage: clinician can view empty patient dashboard
- **Repro**: sign in as clinician, navigate to `/dashboard`.
- **Observed**: patient dashboard shell rendered with clinician's name ("Dr. Sarah Mitchell") in a patient-shaped context — no data, misleading state.
- **Root cause**: patient routes used the generic `ProtectedRoute`, which only checked authentication, not role.
- **Fix**: added `src/components/auth/PatientRoute.tsx` (auth + non-clinician guard) and wrapped all patient-only routes in `src/App.tsx`. Clinicians now redirect to `/clinician/today`.

### P0 — Solo clinicians locked out of `/clinician/audit`, `/reports`, `/compliance`
- **Repro**: sign in as `demo-clinician-1` and open any of the three routes.
- **Observed**: instant redirect back to `/clinician/today`.
- **Root cause**: `useClinicianCapabilities` returned an empty grant set when the user had no `practice_members` row. Solo practitioners are never in a practice, so every capability check failed.
- **Fix**: in `src/hooks/useClinicianCapabilities.ts`, when the caller is a verified clinician with no practice membership, grant the full capability set (they own their own workspace).

### Verified passing after fixes
- **Unauth**: landing, pricing, for-clinicians, features, about, contact, careers, help, sign-in, sign-up all render; protected routes bounce to `/sign-in`.
- **Patient**: dashboard, medications, schedule, vitals, care-circle, health-vault, messages, family, settings, assist, guidance, adherence-report, knowledge-base — all load; `/clinician/*` correctly bounces to `/dashboard`.
- **Clinician**: today, patients, guidance, alerts, messages, templates, audit, reports, compliance, practice, settings, dashboard, dictations, baa — all load; patient dashboard now bounces to `/clinician/today`; pricing correctly rewrites to clinician audience view; mobile viewport (390×844) renders header + section tabs without overlap.

Screenshots for every step: `/tmp/browser/qa-jul-2026/*.png`. Bug ledger and console log capture: `bugs.json`, `console-errors.log`.

## Deferred (P2/P3, tracked)
- Console noise: ~1.7k lines across the sweep, dominated by expected 401s on unauth routes and a handful of dev-mode React warnings. Non-blocking; worth a triage pass in a follow-up.
- Full Google-OAuth click-through not exercised (needs a real Google account); button renders correctly with the 4-colour mark.
