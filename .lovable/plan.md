# OneCare: Relationship Records, Clinician AI, Manual Panels, Enterprise Tenancy

## 1. Why the patient sees an email instead of the doctor's name

Confirmed in the code: the Care Circle share row stores `provider_name` exactly as the patient typed it when creating the share (`useProviderShares`, line 88), and `CareCircle.tsx` renders that raw string. When a patient pastes an email into the name box, that's what shows — forever, even after the real clinician claims the share and has a full profile (`clinician_profiles`: first/last name, title, practice).

Fix: resolve display identity from the clinician's own profile when the share is claimed, falling back to the typed label only when unclaimed.

- Use the existing `get_clinician_basic_info` RPC (already used by `usePendingClinicianRecords`) in `useProviderShares`.
- Display: `Dr. {first} {last}` + title/practice line; typed label shown as "invited as …" only while unclaimed.
- Same fix on the patient Messages thread header, guidance cards, and document-share dialog, which all read the typed label today.

## 2. What happens when a doctor is disconnected

Today, deactivating a share (`is_active = false`) silently removes the clinician's read access to messages and shared documents, while the patient keeps their own copies. Nothing is written down about *why* or *when* the relationship ended, and nothing is preserved as a record of what the doctor told the patient. That is the legal gap.

Plan — treat disconnection as an event, not a delete:

1. **Relationship ledger.** Every share gets a lifecycle record: connected, permission changes, paused, revoked (by whom, when, reason optional), re-shared. Never hard-deleted. Patient sees a plain-language history in Care Circle; clinician sees it on the patient record.
2. **Preserve, don't discard.** On revocation we keep: messages, clinician guidance and its acknowledgements, alerts raised, shared documents, prescriptions/actions. The clinician loses forward access; the patient keeps everything permanently.
3. **Vault becomes the system of record.** Extend the Health Vault with three record classes:
   - a. Medical tests & results (exists today)
   - b. Doctor prognosis, prescriptions and healthcare actions — auto-filed when a clinician marks content patient-facing (matches the reference doc's "Add to Vault" default-add behaviour, with internal notes staying private)
   - c. Patient–doctor conversation records — a signed, read-only transcript snapshot generated per relationship on a rolling schedule (recommend quarterly rather than 4-monthly, plus one immediately on disconnection) so an ended relationship always closes with a complete record.
4. Snapshots are immutable, watermarked with clinician identity and date range, downloadable by the patient, and never editable by either party.

## 3. Clinician AI assistant (approval-gated, mirroring the patient pattern)

Same propose → clinician approves → apply → log architecture already shipped for patients, with a clinical toolset:

- Draft a message to a patient (or a cohort) — never sends without explicit approval.
- Set or change vital thresholds / alert rules for one or many patients.
- Draft guidance or a care instruction with due date.
- Summarise a patient: recent vitals trend, adherence, open guidance, last contact.
- Draft an encounter note from the existing scribe transcript (already exists; expose via assistant).
- Triage the day: rank the inbox by risk and explain why.

Guardrails: read scope limited to patients the clinician actually has access to; every proposal and every approval written to the audit log with the exact payload; bulk actions show a per-patient preview list before approval; no prescribing, no diagnosis, disclaimer surfaced in the drawer.

## 4. Manual patient panels for clinicians with no EHR

For the moonlighting/charity-clinic case the clinician needs to run a full record for someone who may not even have a smartphone.

- **Managed records** already exist (`clinician_patient_records`) but are thin. Upgrade them to a real chart: vitals the clinician records themselves, medications with schedules, visit notes, documents, guidance — all usable with no patient account at all.
- **Invite-later**: any managed record can be invited to claim its own account; on claim, data carries over and the record becomes a normal two-way relationship.
- **Offline-friendly intake**: quick-add form (name, age, sex, phone optional), printable summary sheet, and a simple visit log — enough to run a clinic day without an EHR.
- **Reconciliation / de-duplication**: on manual add, EHR import, or CSV bulk import, match candidates on phone, email, and name+DOB; show a merge review screen (side-by-side, field-level keep/discard) instead of silently creating a second profile; record every merge in the audit log and keep it reversible for a window.

## 5. Storage, redundancy and cost pass-through

- Track per-account storage consumption (documents, audio, images, transcripts) and surface it to the clinician and to us.
- Plan tiers get an included storage allowance plus a per-GB overage line; enterprise gets a pooled tenant allowance. Requires updating the pricing source of truth.
- Durability story to publish: managed multi-zone replicated storage, point-in-time recovery, plus an independent scheduled export to separate storage (recommend weekly rather than monthly for medical records) with restore drills documented. Retention and deletion policy written into the privacy docs.

## 6. Enterprise / hospital tenancy

Delivered as a phased build, documented in `docs/enterprise-hospital-tenancy-plan.md`:

- **Phase A — tenancy core**: hospital tenant entity, per-user roles within a tenant (clinician, sub-admin, tenant admin), affiliation tagging that never duplicates an existing clinician account, domain-based tenant resolution, and name/logo overlay only (no re-theme of the emerald/cream/gold system).
- **Phase B — hospital-level sharing**: a second, parallel share pathway to the institution, granular by default with share-all, revocable forward-only, re-share as a fresh logged action, never overriding a private doctor share. Panels tag Private vs Hospital-assigned.
- **Phase C — admin surfaces**: tenant admin (whitelist, CSV bulk onboarding, offboarding, sub-admins, tenant audit log, branding, revenue-share summary) and OneCare platform admin (create/manage tenants, cross-tenant clinician and audit oversight, plus the existing careers admin folded in).
- **Phase D — delegation & assignment**: sub-admin assigns hospital-shared patients to clinicians, with oversight view across their group.
- **Phase E — deferred**: enterprise SSO (SAML/OIDC) scoped separately; persistent per-tenant demo environment exempt from the daily reset; formulary checks only if confirmed needed.

## 7. Contradictions, omissions and additions I want your call on

**Contradictions with the attached docs**
- The reference doc says hospital-level assignment is done by sub-admins, not patient choice — but our existing consent model is patient-permissioned per clinician. This is a genuine widening of consent scope and needs explicit patient-facing wording at share time.
- "Nothing should be omitted" (default-add to vault) vs. the patient's ability to remove/hide items: if the patient hides a doctor's message, the legal record must still exist. Proposal: hidden ≠ deleted; hidden items stay in a "record archive" view.

**Omissions not covered anywhere yet**
- Clinician death/licence loss/practice closure — who inherits access, how the patient is told.
- Patient death and estate access; minors ageing into their own account.
- Data export on account closure, and jurisdiction (Nigeria vs Canada vs US) governing retention.
- Break-glass emergency access, and whether hospital staff can ever read without a share.
- Who owns a managed record's data if the clinician leaves the platform.

**Open questions**
1. Conversation snapshots: quarterly + on-disconnect (my recommendation), or your 4-month cadence?
2. Should a revoked clinician keep read-only access to the historical record they participated in, or lose it entirely (current behaviour)?
3. Storage overage: pass through as a per-GB line item, or bundle into higher plan prices?
4. For the hospital client specifically — do they need hospital-level sharing live at launch, or is affiliation + admin + whitelabel enough for phase one?

## 8. Docs to update alongside the build

`docs/clinician-strategic-roadmap.md`, `docs/clinician-gaps-implementation-plan.md`, `docs/future-roadmap.md`, `docs/pricing-roadmap.md`, `docs/qhin-integration-plan.md`, plus new `docs/enterprise-hospital-tenancy-plan.md` and `docs/sharing-access-consent-model.md` (our canonical version of the attached reference).

## 9. Suggested sequencing

1. Doctor-name display fix + relationship ledger + preservation-on-disconnect (small, high legal value)
2. Vault record classes + conversation snapshots
3. Clinician AI assistant
4. Managed-record upgrade + reconciliation
5. Storage metering and pricing
6. Enterprise tenancy phases A–D
