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
2. **Nothing is deleted — by default.** Ending a relationship changes access going forward. Messages,
   guidance, alerts, prescriptions and documents are preserved for both parties' legal protection.
   Hiding, archiving, retraction and marking entered-in-error are the normal ways a record changes.
   *Amended 28 September 2026 — pending legal review:* there are two narrow exceptions, set out in §7
   — a statutory retention period that has run out, and a data-subject erasure request the law does
   not override. Each is made by the controller of that record, never by OneCare staff on their own
   initiative, and each is logged.
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

Every category in the picker now has a real read path behind it: vitals, medications (including the
dose history the adherence view is built from), documents, conditions and allergies. Conditions and
allergies are released field by field through `get_patient_clinical_profile()` rather than by
exposing the profile row, so sharing one does not disclose the other. `blood_type` is deliberately
not released — no category covers it, so no patient has consented to it.

Delegated access is the model here: consent is given to the institution, the institution assigns the
treating clinician, and that clinician's access derives from the assignment (or a practice-wide
viewing right — see the note on `can_view_all_patients` in the tenancy plan). The patient's
relationship remains with the hospital, not with whichever clinician currently holds the case.

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
disconnection, so an ended relationship always closes with a complete record. *(As of September
2026 only the second half is built, and only partly: the snapshot is produced in the browser when a
patient ends a claimed private share from Care Circle, best-effort. Hospital disconnections, expiry
and quarterly snapshots have no producer. See `plans/sharing-infrastructure-v2.md` §3.)*

### After sharing stops: the record of care already given

*Amended 28 September 2026 — pending legal review (the basis on which an institution keeps
processing its own record after the patient withdraws consent to share is a question for counsel).*

Stopping sharing ends the **data grant**: the institution or clinician stops reading the patient's
live data on the next read. It does not end the **care that was already given**, and the record of
that care belongs to whoever gave it (§1.2, and the corrections plan's first class: the clinic's
contemporaneous account).

- **The institution or clinician may still add to its own record of the care it provided** — a
  discharge summary written after the patient left, a lab result that arrives late, correspondence
  with another provider, an addendum to an encounter. These are its record, attributed to their
  author, and marked as added after sharing ended.
- **Nothing new reads the patient's live data.** An addition is written from what the institution
  already holds or receives through its own channels (its lab, its correspondence). It never
  reopens vitals, medications, documents or the profile.
- **Nothing flows into the patient's Vault automatically.** An addition made while the patient is
  not sharing is held in the institution's record, not filed to the patient's Vault.
- **If the patient resumes sharing, the additions made in the interim can be delivered** — listed to
  the patient as "added while you were not sharing", so they arrive as what they are rather than as
  a silent change to the history.

**Stopping sharing is not the end of the care relationship.** A patient may stop sharing live data
and still want to talk to their clinician, and a clinician may still need to get a result or a
letter to them. Separating the care relationship from the data grant is the subject of
`plans/sharing-infrastructure-v2.md`; until it is built, every clinician-to-patient write (messages,
guidance, documents into the Vault) still requires a live share, so the additions above can be held
but not yet delivered, and the rule is a design commitment rather than current behaviour.

## 4. Vault record classes

The Health Vault is the patient's system of record and holds three classes:

- **a. Medical tests & results** — uploads, lab reports, imaging reports.
- **b. Clinician output** — prognosis, prescriptions and healthcare actions, auto-filed when a
  clinician marks content patient-facing. Internal clinician notes stay private and are never filed.
- **c. Conversation records** — immutable, watermarked transcript snapshots per relationship.

Care records (class b and c) cannot be deleted by either party. Neither can remove the other's
record; the only deletion route is §7, taken by the controller of that record.

## 5. Lifecycle edge cases

- **Clinician dies, loses licence or closes practice.** The patient keeps every record from that
  clinician. If the clinician stops responding in-app, the patient is advised to contact them by
  other means. Patients can request their own full export.
- **A clinician or staff member leaves an institution** (decided 28 September 2026). The
  relationship is the institution's (pathway B), so the leaver loses **all** access to that
  institution's patients and records — including what they themselves wrote there — at the moment
  the membership ends. The records stay with the institution, attributed to their author and never
  reattributed. Where the leaver later needs those records for a legal purpose (a claim, a
  regulator's inquiry), access goes through the institution under its own process, not through
  OneCare.
  - **Unsigned drafts and unfiled dictations are frozen, never deleted**, and routed to the clinical
    lead (the department lead where the patient sits in a department, otherwise the institution's
    owners and admins). They cannot be signed later, by the author or on the author's behalf; the
    lead decides what happens next, for example writing their own note that refers to the draft.
  - **Solo work is unaffected.** The leaver's own patients (pathway A, `provider_shares`) and their
    own solo managed records (`clinician_patient_records` with no `practice_id`) stay with them, and
    they may export those. A departing clinician takes nothing of the institution's.
  - This supersedes the "keeps a read-only view of what they wrote" position in
    `plans/clinician-offboarding.md` (§1 item 5, §5.3). Note that the author read path added by
    `20261010000000_authors_keep_what_they_filed` asks only whether the caller wrote the row; for
    rows filed in an institution's name it must also require a current membership of that
    institution.
- **Patient dies.** Next-of-kin details (name, date of birth, email, relationship) are collected in
  the profile. A verified next of kin can request the full record by email, after which we offer
  permanent deletion of the profile unless retention is legally required (§7 — the institution's
  records are not the profile's to take with it).
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

## 7. Deletion: the narrow exceptions to §1.2

*Amended 28 September 2026 — pending legal review. Nothing in this section is legal advice, and no
retention period is stated here on purpose: periods differ by jurisdiction, record type and the
patient's age, and are for counsel to supply per market.*

The default is unchanged: nothing with a legal record behind it is deleted. Hiding (§1.3), archiving,
retraction (`record-corrections-plan.md`, class 3) and marking entered-in-error remain the normal
paths, and a request to "delete" something is first checked against them — most such requests are
met by one of them. Deletion proper happens only in the two cases below.

### 7.1 A statutory retention period has run out

Medical-records law sets a minimum period an institution must keep a record. Once that period has
ended, the institution **may** delete the record under its own documented retention policy. It is
not obliged to, and OneCare never deletes a record because a period has ended.

| Record type | Minimum retention | Source |
| --- | --- | --- |
| Adult clinical records | *[counsel to confirm, per jurisdiction]* | *[counsel]* |
| Records of minors | *[counsel to confirm — usually runs from majority, not from the last entry]* | *[counsel]* |
| Mental health, maternity, other special classes | *[counsel to confirm]* | *[counsel]* |
| Audit and access logs (`hipaa_audit_logs`, `share_events`) | *[counsel to confirm]* | *[counsel]* |
| Backups and the independent weekly export (§1.5) | *[counsel to confirm the rotation window within which a deleted record still exists in a backup]* | *[counsel]* |

### 7.2 A data-subject erasure request

A patient may ask for their data to be erased (GDPR Article 17; the equivalent rights elsewhere,
such as *[counsel to list per market — e.g. Nigeria's NDPA, state privacy laws in the US]*). HIPAA
itself provides a right to amend (45 CFR 164.526) rather than a right to erase.

The right is not absolute. GDPR Article 17(3) lists exceptions, among them **(b)** processing needed
to comply with a legal obligation, **(c)** reasons of public interest in the area of public health
(read with Article 9(2)(h) and (i)), and **(e)** the establishment, exercise or defence of legal
claims. Where a medical-records retention law requires an institution to keep a record, that
obligation usually prevails over an erasure request for that record. This is stated neutrally: it
means an erasure request will commonly remove the patient's own material and leave an institution's
clinical record in place, and the patient should be told which is which. How the exceptions apply in
each market is for counsel.

### 7.3 Who may delete

Only the **controller of that record**, in the product's sense of whose record it is:

- **The patient**, for what is theirs: their own Vault uploads, their self-entered readings and
  medications, their messages as sender. An erasure request from the patient reaches these.
- **The institution**, for its records: encounters, notes, clinician output filed in its name,
  managed records it created. Deletion happens on its instruction, under its retention policy or its
  answer to an erasure request. OneCare executes that instruction as processor (see
  `withdrawal-and-derived-data.md` §5), which requires the instruction to be documented in the
  processing agreement — a clause that does not yet exist.
- **A solo clinician**, for the records of their own practice, on the same terms as an institution.
- **Never OneCare staff unilaterally.** OneCare deletes only on the documented instruction of the
  controller, on a verified request for data OneCare itself controls (the patient's account as a
  personal service), or where compelled by law — and a compelled deletion is recorded as such.
  *[Counsel to confirm the compelled-by-law case.]*

Neither party deletes the other's record. A patient's erasure request does not remove an
institution's note about them; an institution's retention expiry does not remove the patient's own
uploads.

### 7.4 What a deletion leaves behind

- **The act is logged.** An append-only deletion record states what class of record was deleted,
  on whose instruction, on what basis (retention expired, erasure request, compelled by law), who
  executed it and when. It survives the deletion; the content does not.
- **Absence stays visible** where the other party relied on the record: a remnant in its place that
  says a record was deleted, when, and on what basis, carrying no content and no title that would
  itself disclose it. *[Counsel to confirm that a content-free remnant is compatible with erasure.]*
- **Deletion is never done by a foreign-key cascade.** Today `provider_shares.user_id` and
  `practice_shares.practice_id` are declared `ON DELETE CASCADE`, so deleting an account or a tenant
  would erase the consent history with it. Any deletion path must be an explicit, logged operation,
  and those cascades must be changed before one is built.


---

## One vocabulary (September 2026)

The two sharing pathways grew separately and ended up naming the same things
differently. That is not cosmetic: a permissions object written for one granted
nothing at all through the other.

### What was live before

| Concept | Table | Clinician key | Institution key |
| --- | --- | --- | --- |
| Readings | `vitals` | `vitals` | `vitals` |
| Medicines | `medications` | `meds` | `medications` |
| Dose history | `schedule_entries` | `adherence` | **`medications`** |
| Conditions | `profiles` | `profile` | `conditions` |
| Allergies | `profiles` | `profile` | `allergies` |
| The Vault | `health_documents` | `documents` | `documents` |
| Record origins | `qhin_record_provenance` | `documents` | *(none)* |

Two of those rows were bugs rather than naming differences.

**Dose history rode on `medications` for institutions.** Whether somebody has
been taking their medicine is a different fact from what they were prescribed —
a judgement about the patient rather than a record of their care — and the
clinician pathway had always asked for it separately. A hospital granted
`medications` was getting both. It now requires `adherence` on both pathways.
That is a narrowing, which is the safe direction: **hospitals that need dose
history will have to be granted it, and existing hospital shares lose it until
the patient says yes.**

**`profile` was all-or-nothing on the clinician side.** The institution side
could already separate conditions from allergies, so the finer grain won.

### What it is now

Canonical: `vitals`, `medications`, `adherence`, `conditions`, `allergies`,
`documents`, and `profile`.

`profile` survives as a permission in its own right, not only an alias. RLS is
row-level, so opening the `profiles` row hands over name, date of birth, blood
type and contact details as well as the two clinical lists — a coarser grant
than `conditions`. The two lists are read without it through
`get_patient_clinical_profile`. The patient-facing label used to describe
`profile` as "Allergies, conditions, etc.", which understated it; it now says
what it actually opens.

### No stored consent was rewritten

`meds` and `profile` are resolved as aliases rather than migrated away.
Rewriting rows that record what a person agreed to is exactly the operation you
do not want to get subtly wrong, and there was no need — resolution is a
function, and a function can accept both names.

### One resolver, four places

`supabase/functions/_shared/share-permissions.ts` imports nothing, so it runs
in Deno, in the browser bundle and in the test suite; `share_grants` in the
database mirrors it. Before this, three of the four read permission keys
directly — `ClinicianPortal` gated its Medications tab on `permissions.meds`,
and so did `get-shared-patient-data` — which meant a share written with a
canonical name would have hidden medications entirely from a clinician the
patient had granted them to.

`src/test/share-permissions.test.ts` covers the resolver;
`supabase/tests/share_vocabulary.test.sql` covers the SQL; and the two were
cross-checked by running 105 identical cases through both and diffing the
answers.

### `=== true`, and nothing looser

The SQL was `(permissions->>key)::boolean`. `->>` yields text, and Postgres
accepts `'yes'`, `'on'`, `'t'` and `'1'` as boolean literals — so
`{"vitals": "yes"}` was honoured by the database while the interface, checking
`=== true`, showed the same share as off. A share the interface calls closed
and the database calls open is the worst kind of disagreement to have about
consent. Both ends now require a literal boolean, via `jsonb_typeof`.

The function is also two-valued now. `jsonb_typeof` of a missing key is NULL, so
an ungranted permission used to answer NULL. A `USING` clause treats NULL as
false, which is why nothing surfaced it — but `NOT share_grants(...)` would
have been NULL rather than true, and a three-valued permission function is a
trap.
