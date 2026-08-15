# Sharing, Access and Consent Model (canonical)

This is the authoritative description of who can see a patient's data, how consent is given and
withdrawn, and what happens to records when a relationship ends. It supersedes any external
reference document where the two disagree — including
`OneCare_Sharing_Access_Consent_Model.md`, whose entry-channel-dependent default was resolved
into the single posture in §2B below. There should be exactly one statement of a consent default,
and it is this file.

## 1. Principles

1. **The patient holds the power.** Every sharing relationship is created, narrowed and ended by
   the patient (or their authorised caregiver).
2. **Nothing is deleted.** Ending a relationship changes access going forward. Messages, guidance,
   alerts, prescriptions and documents are preserved permanently for both parties' legal protection.
3. **Hidden is not deleted.** A patient can hide an item from their day-to-day view; it remains in
   the record archive.
4. **No break-glass.** Nobody reads a record without an active share. Emergency access comes only
   through a next of kin or a Care Circle member the patient designated.
5. **Data is triple-protected.** Multi-zone replication, point-in-time recovery, and an independent
   weekly export to separate storage.

## 2. The two sharing pathways

### A. Private clinician share (`provider_shares`)
Patient invites a named clinician. Granular permission flags per data class. Patient can pause or
revoke. The clinician retains **read-only** access to the historical record they participated in
(messages they sent, guidance they issued, what the patient reported at the time) because that
record informed their clinical decisions and both sides may need it legally.

### B. Institution share (`practice_shares`)
Patient shares with a hospital as an institution, usually on admission or registration, using the
hospital's code (set by the hospital's owner/admin in Practice → Hospital code). The patient either
shares their full record or picks categories — vitals, medications, documents, conditions, allergies
— and can adjust those categories on an existing connection at any time.

**Default posture — one rule, both entry channels** (decided August 2026, superseding the
entry-channel split in the external `OneCare_Sharing_Access_Consent_Model.md`):

- The default is **share everything with the selected hospital**, going forward, whether the patient
  arrived through the hospital's own subdomain or connected from inside OneCare.
- The reasoning is clinical, not commercial: clinicians work best with the full picture, and this is
  a patient-first platform whose purpose is removing information asymmetry — a partial record
  recreates it.
- What makes that legitimate is **disclosure at the moment it happens** — plainly, on the screen
  where the patient connects (Care Circle) or joins through the hospital's address, never only in
  settings — and the patient being able to **deselect any category** before or after connecting.
- Both are implemented: the disclosure panel in `HospitalShareCard` and `InstitutionIntakeCard`, and
  the category picker on both the initial connection and any existing one.

Delegated access is the model here: consent is given to the institution, the institution assigns the
treating clinician, and that clinician's access derives from the assignment (or a practice-wide
viewing right — see the note on `can_view_all_patients` in the tenancy plan). The patient's
relationship remains with the hospital, not with whichever clinician currently holds the case. The hospital assigns the treating clinician. Consent is to the institution; the
clinician's access derives from their assignment (or a practice-wide viewing right for admins).
The patient can disconnect from the institution at any time, independently of any private share.

An institution share never overrides, replaces or weakens a private share, and vice versa.

## 3. What happens when a relationship ends

| Item | After disconnection |
| --- | --- |
| Vitals, medications, live documents | Clinician loses forward access immediately |
| Messages | Preserved; both sides keep read-only access |
| Guidance and acknowledgements | Preserved; read-only |
| Alerts raised | Preserved |
| Care record snapshot | Generated at disconnection, watermarked, filed in the patient's Vault, undeletable |
| Relationship ledger (`share_events`) | Append-only; shows connected / changed / paused / revoked / reconnected |

Conversation snapshots are generated quarterly per relationship, plus one immediately on
disconnection, so an ended relationship always closes with a complete record.

## 4. Vault record classes

The Health Vault is the patient's system of record and holds three classes:

- **a. Medical tests & results** — uploads, lab reports, imaging reports.
- **b. Clinician output** — prognosis, prescriptions and healthcare actions, auto-filed when a
  clinician marks content patient-facing. Internal clinician notes stay private and are never filed.
- **c. Conversation records** — immutable, watermarked transcript snapshots per relationship.

Care records (class b and c) cannot be deleted by either party.

## 5. Lifecycle edge cases

- **Clinician dies, loses licence or closes practice.** The patient keeps every record from that
  clinician. If the clinician stops responding in-app, the patient is advised to contact them by
  other means. Managed-record data is exported to the clinician on departure; patients can request
  their own full export.
- **Patient dies.** Next-of-kin details (name, date of birth, email, relationship) are collected in
  the profile. A verified next of kin can request the full record by email, after which we offer
  permanent deletion of the profile unless retention is legally required.
- **Minor ages into their own account.** The family-member record is converted to an owned account
  and history carries over.
- **Account closure.** Full structured export (PDFs, images, chats, transcripts) delivered as a
  single archive with a machine-readable index.
- **Jurisdiction.** We build to a US/EU baseline, which satisfies most other regimes; final policy
  confirmed with legal counsel per market.

## 6. Managed records (no patient account)

Clinicians can run a full chart for someone with no account: identity, allergies, conditions,
clinician-recorded vitals, medications, visit log, documents and a printable summary sheet. Any
managed record can later be invited to claim its own account, at which point data carries over and
the relationship becomes a normal two-way share. Manual adds, CSV imports and EHR imports run
duplicate detection on phone, email and name+date-of-birth before creating a second profile.
