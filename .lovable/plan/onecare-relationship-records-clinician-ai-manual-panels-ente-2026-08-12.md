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

- The reference doc says hospital-level assignment is done by sub-admins, not patient choice — but our existing consent model is patient-permissioned per clinician. This is a genuine widening of consent scope and needs explicit patient-facing wording at share time. --> So the hospital-level assignment is when a patient with their app come into the hospital, they share their info with the hospital and upon admission, the hospital then 'gives them' their doctor. That 'institutional' relationship must be preserved because that is the patient engaging the institution for whom the doctor represents, not the doctor as an individual though that could become a case later, in the immediate relationship, it is to the hospital. Secondly, if they decide to share with the doctor as an individual, the power is still in their hand as it is with the hospital as an institution - power to engage in a relationship or to terminate, and either way the sharing principles would hold for legal reasons also. The data flow after it gets to the hospital may be different though from a doctor depending on their internal processes and structures. 
- "Nothing should be omitted" (default-add to vault) vs. the patient's ability to remove/hide items: if the patient hides a doctor's message, the legal record must still exist. Proposal: hidden ≠ deleted; hidden items stay in a "record archive" view. ----> Agreed. Essential for legal reasons - all data and their integrity must be preserved, and all data kept maybe 3 times redundant. 

**Omissions not covered anywhere yet**

- Clinician death/licence loss/practice closure — who inherits access, how the patient is told. --->Patient keeps their records from that clinician regardless. No material impact to the patient. If patient seeks to engage the clinician via the platform and there is no response, they may try other ways like phoning or the like. 
- Patient death and estate access; minors ageing into their own account. ----> In the event of such, the details can be preserved and perhaps we should also collect details on 1 or 2 next of kin (name, dob, email, type of relationship) so that in such a case they can make a request and providing that info, receive all pertinent data to their email for download, and we offer to permanently delete that user profile unless we have to retain it for legal reasons. 
- Data export on account closure, and jurisdiction (Nigeria vs Canada vs US) governing retention. ---> I think maybe we should follow either US or EU since satisfying their policies often means satisfying the rest also, but I think we can deliberate on that later as we implement in multiple locations and actually have a legal personnel to handle that also. 
- Break-glass emergency access, and whether hospital staff can ever read without a share. ---> No they cannot, unless a next of kin or those in the care circle provide such access. 
- Who owns a managed record's data if the clinician leaves the platform. ---> Clinician is sent the copy of their data, and the patient as well can request a download of their data. The ability to download the data and how it would all be structured is something we need to work out because that could end up being quite a lot since it includes pdfs, images, chats, voice recordings and transcripts, etc. 

**Open questions**

1. Conversation snapshots: quarterly + on-disconnect (my recommendation), or your 4-month cadence? ---> Go with your recommendation for now. 
2. Should a revoked clinician keep read-only access to the historical record they participated in, or lose it entirely (current behaviour)? ---> Keep access most definitely since it informed their decision and counsel and needed for legal purposes as well - it is what the patient reported. 
3. Storage overage: pass through as a per-GB line item, or bundle into higher plan prices? --->I think we can bundle it into higher prices and they can pay for extra storage space, but we need to provide reasonable storage for them. So for example, instead of keeping the voice recording, keeping the transcript is better and a smaller size. 
4. For the hospital client specifically — do they need hospital-level sharing live at launch, or is affiliation + admin + whitelabel enough for phase one? Yes, hospital-level sharing needs to be live at launch, not deferred to phase one-lite. This isn't an enhancement on top of the pilot; it's the core of what the hospital client is actually buying — a patient portal where the hospital is the institutional relationship holder, not a collection of individual doctor shares. The revenue-share model depends on it too: patients have to be attributable to the hospital as a tenant for the revenue split to mean anything. That said, launch scope can still be cut sensibly. MUST be live at launch:   
- Registration via the hospital's subdomain (e.g. [oclmc.onecare.you](http://oclmc.onecare.you)) for both patients and clinicians   
- Patient sharing with the hospital as an institution (not a named doctor)   
- Sub-Admin assignment of a doctor to a hospital-shared patient   
- Clinician panel distinguishing hospital-assigned patients from private ones   
- Basic revocation: patient can disconnect, status changes, hospital/clinician can filter by status   
  
Reasonable to treat as fast-follow, not launch-blocking:   
- Granular "restrict what's shared" UI — ship with a working share-everything default plus a simple toggle first, refine the granular picker after   
- Reassignment workflow polish and the permanent-authorship audit trail — important, but a natural extension of audit logging already planned, not a separate build   
- Multi-hospital affiliation labeling on the clinician panel — irrelevant until a doctor actually has more than one hospital affiliation, which won't be true with only OC-LMC live

## 8A. Docs to update alongside the build

`docs/clinician-strategic-roadmap.md`, `docs/clinician-gaps-implementation-plan.md`, `docs/future-roadmap.md`, `docs/pricing-roadmap.md`, `docs/qhin-integration-plan.md`, plus new `docs/enterprise-hospital-tenancy-plan.md` and `docs/sharing-access-consent-model.md` (our canonical version of the attached reference).

## 8B: Documentation 

We also need to create a full comprehensive documentation of the entire platform because certain nuances need to be easily visible and accessible. I think it is necessary, right? May need its own pass. 

## 9. Suggested sequencing

1. Doctor-name display fix + relationship ledger + preservation-on-disconnect (small, high legal value)
2. Vault record classes + conversation snapshots
3. Clinician AI assistant
4. Managed-record upgrade + reconciliation
5. Storage metering and pricing
6. Enterprise tenancy phases A–D
7. Documentation