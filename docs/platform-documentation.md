# OneCare Platform Documentation

A single reference for how the platform is put together and where the nuances live. Written for the
team (and for new clinical/enterprise partners' technical reviewers).

Last updated: August 2026.

---

## 1. What OneCare is

OneCare removes the information asymmetry that appears after a hospital visit. Patients keep a
complete, portable health record — medications, vitals, documents, guidance from their clinicians —
and choose exactly who sees it. Clinicians get a lightweight surface for following patients between
visits without buying another EHR.

Two audiences, one data spine:

- **Patient app** — mobile-first, installable (PWA), offline-tolerant.
- **Clinician surface** — triage inbox, patient panels, guidance, encounters, scribe, practice ops.

## 2. Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18 + Vite 5 + TypeScript + Tailwind (design tokens only, no hardcoded colours) |
| Backend | Lovable Cloud (Postgres, auth, storage, edge functions) |
| AI | Lovable AI Gateway — `google/gemini-3-flash-preview` for chat/summarisation, ElevenLabs for voice |
| Payments | Stripe |
| Scheduling | Cal.com (beta programme booking) |
| Native | Capacitor for store builds |

Design system: Emerald Prestige palette (forest green / cream / gold), Fraunces display serif,
eyebrow-label system. All colour, gradient and shadow values are semantic tokens in `index.css`.

## 3. Domain map

### Patient
- **Today / Dashboard** — schedule, adherence, alerts, quick actions.
- **Medications** — schedules, interaction warnings, international drug resolution, refill data.
- **Vitals** — BP, HR, glucose, weight, temperature; 90-day default lookback; source tracking
  (self-entered vs EHR vs clinician-recorded).
- **Health Vault** — documents, AI summaries, per-document sharing with 5-minute signed URLs,
  care-record snapshots (undeletable).
- **Care Circle** — private clinician shares, institution (hospital) shares, sharing history ledger.
- **Messages** — patient↔clinician threads, attachments, read-only after disconnection.
- **Assistant** — `/assist` full-page simple mode and the drawer; propose → approve → apply, never
  writes without approval.
- **Family** — member profiles with a global active-member switcher; documents are per-member,
  adherence and guidance are primary-account scoped.
- **Settings** — units, notifications, theme (light/dark/system), AI consent, audit trail, storage.

### Clinician
- **Today** — unified triage inbox: alerts, unread messages, open guidance, tasks.
- **Patients** — paginated list + search; private shares, institution-assigned patients, managed
  records (charts for patients with no account).
- **Communicate** — messaging, guidance, bulk actions, templates.
- **Practice** — team/RBAC, institution-shared patients + assignment, storage & durability,
  subscription, EHR connections, branding.
- **Encounters & scribe** — dictation → transcript → SOAP draft → clinician approval.
- **Compliance** — BAA, audit log, compliance pack.
- **Clinician AI** — proposes messages, guidance, thresholds and summaries; every approval logged to
  `patient_action_log`.

## 4. Access control

Three access paths, all enforced in Postgres RLS via `SECURITY DEFINER` helpers:

1. `clinician_has_patient_access()` / `clinician_has_patient_permission()` — private shares.
2. `institution_has_patient_access()` — hospital share + assignment (or practice-wide view right).
3. `clinician_had_patient_access()` — historical, read-only after a relationship ends.

Roles are never stored on profiles. Platform roles live in `user_roles` (checked via `has_role`),
tenant roles in `practice_members` (checked via `has_practice_capability` / `can_manage_practice`).
Every public table has explicit `GRANT`s; helper functions have `EXECUTE` revoked from `PUBLIC`.

Full consent semantics: `docs/sharing-access-consent-model.md`.
Tenancy: `docs/enterprise-hospital-tenancy-plan.md`.

## 5. Storage and durability

- `storage_ledger` records the byte size of every stored artefact, attributed to the owning patient
  and, for clinician-side artefacts, to the tenant that is billed.
- Triggers keep it in sync with `health_documents` and `clinician_dictations`; audio is estimated at
  32 kB/s and, by policy, transcripts are retained rather than recordings.
- Allowances and packs: `src/lib/storage-constants.ts` (source of truth). Patient free 500 MB,
  premium 10 GB. Clinician trial 2 GB, solo 25 GB, pro 100 GB, enterprise 1 TB pooled.
- Overage is sold as bundled packs (50 GB / 250 GB / 1 TB), not per-GB metering.
- Durability: multi-zone replication, point-in-time recovery, weekly independent export, documented
  restore drills.

## 6. AI behaviour rules

- Nothing is written to a record without explicit human approval; approvals are logged with the
  exact payload.
- The assistant must never claim success for an action it did not apply.
- Read scope is limited to records the caller can already access.
- No prescribing, no diagnosis; disclaimers surfaced in the UI.
- Patient AI requires explicit granular consent; PII de-identification runs before external calls.

## 7. Offline and mobile

Vitals, medications and schedule writes queue in IndexedDB (`src/lib/offline`) and drain when
connectivity returns; dashboard, vitals and medication reads are cached. No service-worker caching
of HTML. Role-aware launch routing sends clinicians and patients to the right home on standalone
launch.

## 8. Sources of truth

| Concern | File |
| --- | --- |
| Pricing, tiers, limits, Stripe IDs | `src/lib/pricing-constants.ts` |
| Storage allowances and durability copy | `src/lib/storage-constants.ts` |
| Navigation IA | `src/lib/nav-ia.ts` |
| Clinician AI actions | `src/lib/clinician-ai-actions.ts` |
| Date-only handling (no timezone drift) | `src/lib/date-only.ts` |
| Duplicate detection | `src/lib/patient-dedup.ts` |

## 9. Vocabulary

"Wellness routine", "catch-up reminder", "continuous" (never "real-time"), "HIPAA safeguards".
Unbuilt features are labelled "(coming soon)". Never expose the underlying vendor stack publicly.

## 10. Related documents

- `docs/sharing-access-consent-model.md` — consent and preservation
- `docs/enterprise-hospital-tenancy-plan.md` — hospital tenancy phases
- `docs/roadmap.md` — single living tracker (shipped, in flight, next, deferred)
- `docs/pricing-roadmap.md` — commercial model including storage
- `docs/qhin-integration-plan.md` — interoperability
