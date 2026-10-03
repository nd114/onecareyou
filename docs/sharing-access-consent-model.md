# Sharing, Access and Consent Model (canonical)

> Rooted in [OneCare's foundational pillars](./onecare-foundations.md) — pillars 1–4, 6–8 and 10.
>
> **What this is: the canonical rules.** Who can see a patient's data, how consent is given and
> withdrawn, and what happens to records when a relationship ends. There is exactly one statement of
> each rule, and it is this file. Its companions:
>
> - [`plans/sharing-infrastructure-v2.md`](./plans/sharing-infrastructure-v2.md) — **the build
>   plan**: how the rules below that are not yet in code get built, in phases.
> - [`guide/sharing.md`](./guide/sharing.md) — **the patient-facing guide**, published at `/guide`.
>   It explains current behaviour in plain words and must never promise more than this file.
>
> Where this file says *decided* and the code does not yet do it, the build plan says when it will.

This file supersedes the pre-repository reference document `OneCare_Sharing_Access_Consent_Model.md`
wherever the two disagree. That document was never committed to this repository (checked 29
September 2026: no copy under any spelling, in `docs/`, `docs/archive/` or git history); its one
substantive difference, an entry-channel-dependent default, was resolved into the single posture in
§2B below.

## 1. Principles

1. **The patient holds the power.** Every sharing relationship is created, narrowed and ended by
   the patient. The patient initiates every connection; the one exception is a managed record a
   clinician or hospital registers for someone not yet on OneCare, which the patient then claims and
   controls (§6). *(Caregivers acting for a patient are paused, and hidden in the product, until later
   in the roadmap — see `plans/caregiver-access-system.md`.)*
2. **Nothing is deleted — by default.** Ending a relationship changes access going forward. Messages,
   guidance, alerts, prescriptions and documents are preserved for both parties' legal protection.
   Hiding, archiving, retraction and marking entered-in-error are the normal ways a record changes.
   Deletion is the controller's decision — the patient for their own uploads, the institution for
   its records — recoverable for a window and announced, and never OneCare's unilateral act (§7,
   *draft — pending review*).
3. **Hidden is not deleted.** A patient can hide an item from their day-to-day view; it remains in
   the record archive.
4. **No break-glass.** Nobody reads a record without an active share. Emergency access comes only
   through a next of kin or a Care Circle member the patient designated.
5. **Data is triple-protected.** Multi-zone replication, point-in-time recovery, and an independent
   weekly export to separate storage.
6. **We do not police what is not ours to police** (founder's direction, 29 September 2026). Where
   natural law, regulation or an institution's own policies govern — how long records are kept, whom
   a clinician contracts with, whether a record may be deleted — OneCare provides the capability and
   the clarity, not the arbitration. We use structures that already exist in the industry (email-domain
   affiliation, a recycle bin with a recovery window, controller and processor roles) rather than
   inventing new ones, and we do not split hairs.
7. **OneCare does not verify clinicians and does not give medical advice**, and says so plainly.
   Checking a licence belongs to employers and regulators; clinical judgement belongs to clinicians.

## 2. The two sharing pathways

### A. Private clinician share (`provider_shares`)
Patient invites a named clinician. Granular permission flags per data class. Patient can pause or
revoke. The clinician retains **read-only** access to the historical record they participated in
(messages they sent, guidance they issued, what the patient reported at the time) because that
record informed their clinical decisions and both sides may need it legally.

**Guidance is permanent once sent** (founder's decision, 30 September 2026): not acknowledged does
not mean not seen and not done. Nobody deletes it. A clinician who issued it in error withdraws it
with a reason; it stays in the patient's record and every care record snapshot marked "withdrawn by
[clinician] on [date]: [reason]", and the patient is notified. Changing what was said issues a new,
linked instruction and withdraws the old one; the text the patient received is never rewritten.
See `record-corrections-plan.md`, class 3.

### B. Institution share (`practice_shares`)
Patient shares with a hospital as an institution, usually on admission or registration, using the
hospital's code (set by the hospital's owner/admin in Practice → Hospital code). The patient either
shares their full record or picks categories — vitals, medications, documents, conditions, allergies
— and can adjust those categories on an existing connection at any time.

**Default posture — one rule, both entry channels** (decided August 2026, superseding the
entry-channel split in the pre-repository `OneCare_Sharing_Access_Consent_Model.md`):

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
| Messages | Preserved; both sides keep read-only access until the account is closed or the author deletes a message (which leaves a remnant). No time limit (decided 29 September 2026; the code's 90-day wind-down for a private clinician is being removed in separate work). On a hospital thread "the other side" is the hospital's care team, not a clinician who has since left (§5) |
| Guidance and acknowledgements | Preserved; read-only. Never deleted; the issuing clinician can still withdraw guidance with a reason after disconnection, and the patient is told (§2A) |
| Alerts raised | Preserved |
| Care record snapshot | Generated at disconnection, watermarked, filed in the patient's Vault, undeletable |
| Relationship ledger (`share_events`) | Append-only; shows connected / changed / paused / revoked / reconnected |

Conversation snapshots are generated quarterly per relationship, plus one immediately on
disconnection, so an ended relationship always closes with a complete record. *(Built server-side in
`20261010110000_care_record_snapshots_server_side.sql` and the `care-record-snapshots` edge
function: a snapshot is queued whenever a private or hospital share ends, whoever ends it, when a
share expires, and in the first week of each quarter for live relationships with new activity. It is
compiled in the database, filed by the worker, and cannot be deleted or edited by either party.)*

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
- **If the patient resumes sharing, the additions made in the interim are delivered** — listed to
  the patient as "added while you were not sharing", so they arrive as what they are rather than as
  a silent change to the history.

**Stopping sharing is not the end of care** (founder's precept). Live data stops; the care
relationship — messaging, and clinician output reaching the patient — can continue. The decided
rules (29 September 2026):

- **Stop sharing and end care are two different acts**, and only the patient ends a data grant.
- **Documents a clinician sends go straight into the Vault** through "Send to Vault", as today —
  while the relationship is active, whether or not the patient is sharing data. The patient is
  **notified on receipt**, and the document carries a **visible origin** naming who sent it and from
  where ("From Dr X · St Elsewhere"). There is no separate "Received" area and no "offer" step
  (founder's decision, superseding the earlier Received-area proposal). Attachments in a message
  thread can also be added to the Vault from the thread.
- **Non-clinical staff may send documents too, and the origin says so** (founder's decision, 30
  September 2026; built in `20261010140000_document_origin.sql`). Intake paperwork is a front-desk
  job, so a hospital's front desk or billing member who has the patient on their roster can still
  use "Send to Vault". The danger was never the upload: it was the label, which called every sender
  "your clinician". The origin is now stamped by the database at insert from the sender's membership
  and role at that moment — "From Dr Ada Obi · St Elsewhere General" for a clinical member, "From
  Dr Kemi Bello" for a private clinician, "From St Elsewhere General (front desk)" for a
  non-clinical member, who is not named — and no client can supply or change it, so it survives a
  later role change, a departure or a rename. The distinction that does matter clinically is
  enforced by category: a non-clinical member may file only insurance, billing and other paperwork;
  lab results, prescriptions, discharge summaries, imaging, vaccination records, referrals and visit
  notes need a clinical role (an allowlist, so a new category is clinical until decided otherwise).
  Documents filed before the origin existed keep no origin and read "From a clinic or clinician",
  because the role at the time was never recorded and guessing it from today's memberships would
  reintroduce the mislabelling.
- **While not sharing, the patient can still add anything to their own Vault.** What they add in
  that time is delivered to the clinician when sharing resumes, just as the clinician's interim
  additions are delivered to them.
- **A clinician or hospital ending the relationship from its side is closer to pausing**: the
  relationship goes dormant and becomes active again when care resumes. It is not a hard end, and it
  is shown to the patient as what it is.
- **An urgent result after the patient has closed the relationship** is the institution's to deliver
  outside the platform — it holds the patient's contact details. OneCare does not push anything
  through a relationship the patient closed.

Until `plans/sharing-infrastructure-v2.md` phase 1 is built, every clinician-to-patient write
(messages, guidance, documents into the Vault) still requires a live share. So the additions above
can be held but not yet delivered, and these rules are decided design rather than current
behaviour. The named origin and the notification on receipt are built (`20261010140000`).

## 4. Vault record classes

The Health Vault is the patient's system of record and holds three classes:

- **a. Medical tests & results** — uploads, lab reports, imaging reports.
- **b. Clinician output** — prognosis, prescriptions, letters and healthcare actions a clinician
  marks patient-facing. A document sent with "Send to Vault" is filed straight into the Vault, the patient
  is notified on receipt, and the label names the sender and institution as the server recorded them
  ("From Dr X · St Elsewhere", or "From St Elsewhere (front desk)" for non-clinical staff) (§3). Internal clinician notes stay
  private and are never filed.
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
  - **Their own practice is unaffected.** The leaver's own patients (pathway A, `provider_shares`) and their
    own solo managed records (`clinician_patient_records` with no `practice_id`) stay with them, and
    they may export those. A departing clinician takes nothing of the institution's.
  - This supersedes the "keeps a read-only view of what they wrote" position in
    `plans/clinician-offboarding.md` (§1 item 5, §5.3). The author read path added by
    `20261010000000_authors_keep_what_they_filed` now also requires a current membership for rows
    stamped with an institution (`20261010070000_offboarding_handover`).
  - **The hospital shuts access off without the leaver's input**, and everything the leaver had open
    is frozen or flagged and routed to the people responsible there (owners, admins, the patient's
    department lead). No cooperative handover is assumed. See `plans/clinician-offboarding.md` §3.
  - **Separate accounts make this clean** (decided 29 September 2026, §8): hospital work is done in
    an account on the hospital's email domain, private practice in another, so leaving a hospital
    never touches the clinician's own patients.
- **Patient dies.** Next-of-kin details (name, date of birth, email, relationship) are collected in
  the profile. A verified next of kin can request the full record by email, after which we offer
  deletion of the patient's own material (§7 — the institution's records are not the profile's to
  take with it, and whether they must be kept is the institution's call under its own law).
- **Minor ages into their own account.** The family-member record is converted to an owned account
  and history carries over.
- **Account closure** (clinician or patient; not built — on the roadmap). Full structured export
  (PDFs, images, chats, transcripts) delivered as a single archive with a machine-readable index.
  Closing disables sign-in and keeps the person's name for attribution on what they wrote, so the
  record others rely on still says who wrote it; nothing is decided by accident (for example by a
  foreign-key cascade). See `plans/clinician-offboarding.md` §5.7.
  - **OneCare's own evidence outlives the account** (founder's decision, 30 September 2026;
    `20261010160000`). Terms acceptances (`legal_acceptances`), consent changes (`consent_logs`),
    BAAs (`baa_agreements`) and beta NDAs (`beta_nda_signatures`) are what OneCare needs if an
    agreement is ever disputed, and a dispute can outlive the account. Deleting the account no
    longer deletes them: the account column is set to NULL and the row keeps the document version,
    timestamps, IP and user agent, plus a SHA-256 of the account id and of the email it was made
    under, so it can still be matched to the person who presents that email. SET NULL rather than
    RESTRICT, because every account has an acceptance and RESTRICT would make no account closable,
    including under a verified erasure request for data OneCare controls (§7.2). The audit logs
    already name people without a foreign key and survive in the same way.
- **Jurisdiction.** We build to a US/EU baseline, which satisfies most other regimes; final policy
  confirmed with legal counsel per market.

## 6. Managed records (no patient account)

Clinicians can run a full chart for someone with no account: identity, allergies, conditions,
clinician-recorded vitals, medications, visit log, documents and a printable summary sheet. Any
managed record can later be invited to claim its own account, at which point data carries over and
the relationship becomes a normal two-way share. Manual adds, CSV imports and EHR imports run
duplicate detection on phone, email and name+date-of-birth before creating a second profile.

## 7. Deletion: the controller decides, OneCare makes it safe

> **Draft — pending review.** Revised 29 September 2026 on the founder's direction, replacing the
> 28 September draft (which carried a minimum-retention table for counsel to fill in). Nothing here
> is legal advice. Before anything in this section is built or stated publicly it goes through
> review with clinicians, governance and legal. **Not built:** there is no institution-level delete
> and no recoverable delete today; the few deletions the product does allow (for example a
> clinician's own unclaimed managed record, or a private internal note) are immediate. The roadmap
> carries "Revisit deletion end to end — urgent".

### 7.1 OneCare does not police retention

How long a record must be kept is set by the laws that bind each institution — they differ by
country, record type and the patient's age — and by the institution's own policy. OneCare does not
set, publish or enforce retention periods (§1.6). It provides storage for as long as the controller
keeps a record, and export whenever they want to take it elsewhere.

The normal ways a record changes are unchanged and come first: hiding (§1.3), archiving, retraction
(`record-corrections-plan.md`, class 3) and marking entered-in-error. Most requests to "delete"
something are really one of these, and each leaves a trace.

### 7.2 Who may delete

Only the **controller of that record**, in the product's sense of whose record it is:

- **The patient**, for what is theirs: their own Vault uploads, their self-entered readings and
  medications, their messages as sender.
- **The institution**, for its records: encounters, notes, clinician output filed in its name,
  managed records it created. Its **owners and admins** can delete them, and **they are responsible
  for knowing whether they may** under the law and policies that bind them. OneCare does not ask
  why, and does not second-guess the answer.
- **An independent clinician** (Individual or Practice plan), for the records of their own practice,
  on the same terms as an institution.
- **Never OneCare on its own initiative.** OneCare deletes only on the controller's act or
  documented instruction, on a verified request for data OneCare itself controls (the patient's
  account as a personal service), or where compelled by law — and a compelled deletion is recorded
  as such. For institutional records OneCare acts as processor (`withdrawal-and-derived-data.md`
  §5), which needs the instruction documented in the processing agreement; that clause does not yet
  exist.

### 7.3 Protection against rogue or accidental deletion

The risk is not that a controller may delete — it is a deletion nobody meant, or one made by
someone acting against the institution. The protection is the one people already know from
Microsoft 365 and Google Workspace: a recycle bin with a recovery window.

- **Soft delete first.** A deleted record leaves every read path at once, and can be restored by the
  institution's owners and admins for **15 days**. After that it is deleted permanently.
- **Announced, in batches.** An automated notice goes to the institution's responsible officials
  (its owners and admins) listing what will be permanently deleted and when. Notices are batched —
  one summary per window, not one message per item — so a large clean-up does not bury the signal.
- **Never cascades into another party's copy.** Deleting an institution's record never removes the
  patient's copy in their Vault or anything another party holds, and a patient deleting their upload
  never removes a record an institution made from it. Neither party deletes the other's record.
- **The act is logged.** An append-only deletion record states what class of record was deleted,
  on whose instruction, on what basis (retention expired, erasure request, compelled by law), who
  executed it and when. It survives the deletion; the content does not.
- **Absence stays visible** where the other party relied on the record: a remnant in its place that
  says a record was deleted, when, and on what basis, carrying no content and no title that would
  itself disclose it. *[Counsel to confirm that a content-free remnant is compatible with erasure.]*
- **Deletion is never done by a foreign-key cascade.** Since `20261010120000` every key that could
  carry an account's or a tenant's deletion into the other party's rows or a ledger is `RESTRICT`
  (the consent rows, `share_events`, `practice_membership_events`, `snapshot_link_views`, members,
  appointments, invoices, care plans, change proposals, alert rules), so an account or tenant with a
  relationship behind it cannot be deleted by one statement. Any deletion path must be an explicit,
  logged operation that decides row by row. The cascades that remain are same-side and listed in
  `supabase/tests/deletion_never_crosses_parties.test.sql`, which fails on any new one.

### 7.4 Erasure and amendment requests go to the controller

A patient's request to erase or amend a record (GDPR Articles 16–17, HIPAA's right to amend at
45 CFR 164.526, and their equivalents elsewhere) is addressed to **the controller of that record** —
the hospital or clinician who made it — not to OneCare. The controller decides, under the law that
binds it; many such requests will rightly leave a clinical record in place (GDPR Article 17(3) keeps
records needed for legal obligations, public health and legal claims). OneCare offers the tooling:
a way to route the request to the controller, the addendum for a patient who disagrees with a
record, and the recoverable delete above for a controller who decides to erase.

For what the patient controls — their own uploads, readings and messages — the patient can act
themselves, on the same recoverable-delete terms.

## 8. Accounts, institutions and conversations

*Decided by the founder, 29 September 2026. How each is built is in
`plans/sharing-infrastructure-v2.md` §10.*

### 8.1 One account per place of work

- **A clinician working for a hospital uses a separate account on the hospital's email domain.**
  Hospitals already affiliate their domain automatically (`practices.allowed_email_domains`, applied
  by `request_practice_affiliation`); anyone else waits for the hospital's approval. A doctor
  without a hospital address creates one for that hospital (a manual step, done by the doctor or
  the hospital).
- **Their private practice is a separate account.** The two never mix: pathway A lives in one,
  pathway B in the other, and leaving a hospital touches nothing of the clinician's own patients.
- **No in-app account switcher for now.** A clinician moves between accounts by signing out and in.
  A switcher is on the roadmap as a future iteration. The earlier "one account, many workspaces"
  proposal and its "personal workspace" are dropped.
- **Contracted and rotating clinicians need no special rules.** A clinician may work for several
  hospitals, on contract, or through their own business; the platform supports any arrangement, and
  whom a clinician contracts with is not OneCare's to police (§1.6).
- **Every clinician is billed for their own account.** Plans are **Individual** ($99/month),
  **Practice** ($299/month, with a limited number of staff seats including non-clinical roles) and
  **Enterprise** (from $2,500/month). A practice that outgrows its Practice limits upgrades to
  Enterprise. Source of truth: `src/hooks/useClinicianSubscription.ts`.

### 8.2 What a patient gave a person stays with that person

A share a patient made to a doctor's personal email belongs to the doctor, as a text to the doctor's
own phone would. The hospital cannot take ownership of it and nothing is redirected. A patient who
wants the hospital to hold the record connects to the hospital (§2B).

### 8.3 Hospitals and practices read conversations with their patients

- A hospital or practice can read the message threads between its clinicians and its patients:
  the clinical staff on the patient's care (need-to-know) and the governance roles that answer for
  that care.
- Every read is logged and visible to the patient, and the patient is told plainly at connection
  that conversations with the hospital belong to the hospital.
- *Built today:* hospital threads carry the practice (`messages.practice_id`, stamped by the
  server), and once the clinician on a thread has left, the patient's current care team reads and
  continues it (`20261010070000`). *Not built:* governance-role access, logging of thread reads,
  and the connection-screen disclosure.
- **A "private" tag for sensitive conversations** — mental health, sexual health, HIV, addiction
  (compare the US 42 CFR Part 2 rules for substance-use records) — restricts a thread to the
  treating professionals the patient adds, with the patient in control. *Urgent roadmap item, to be
  reviewed with clinicians, governance and legal before it is built.*

### 8.4 Provider shares are for providers

A provider share makes the claimant a clinician in the patient's record, so only a clinician account
can claim one (`20261010050000`). Accounts that had opened a clinician invite link and been attached
as the share's clinician — caregivers or patients — are now refused; existing ones are listed by a
production query for follow-up.

### 8.5 Caregivers are paused

Caregiver features (a person acting on the patient's behalf) are paused and hidden in the product
until later in the roadmap. See `plans/caregiver-access-system.md`.

### 8.6 The snapshot link

A patient can send a read-only, point-in-time snapshot of chosen categories to someone with no
account (`20261010060000`). It expires within at most 30 days, can carry a passcode (three wrong
tries lock the link for good), can be revoked at any time, and every view is logged for the patient
to see. It creates no relationship, no messaging and no access to live data. A clinician who needs
ongoing access should be connected instead.

**Viewing needs no account** (founder's decision, 29 September 2026): the link opens a
password-protected view for anyone holding the link and passcode, and it **must never be refused
because the viewer happens to be signed in to some other OneCare account**, or has a stale session
in the browser. The edge function (`view-snapshot-link`) deliberately never reads the caller's
session; whether every route guard and the browser client also let a signed-in or expired session
through to `/s` has not been checked in a browser and is on the sharing plan's list.

---

### 8.7 Voice memos

A voice memo is the clinician dictating their own notes; no patient is recorded, so none is asked. The memo
audio and an unfiled transcript are the clinician's working material: only the clinician can read them, they
are never shown to the patient, and assigning a memo to a patient creates no patient-visible trace. A memo
reaches a patient's chart only when the clinician applies a draft to an encounter and signs it, and that
requires current clinical access to the patient. The audio is deleted 24 hours after the clinician files,
keeps or discards the memo (30 days at most), unless they choose to keep it.

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
