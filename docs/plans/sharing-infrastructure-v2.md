# Sharing Infrastructure v2 — care relationships, data grants and delivery

> Rooted in [OneCare's foundational pillars](../onecare-foundations.md) — pillars 1, 3, 4 and 6.
>
> **What this is: the build plan for sharing.** The rules live in
> [`sharing-access-consent-model.md`](../sharing-access-consent-model.md) (canonical — if this plan
> and that file disagree, that file wins and this plan is fixed). What patients are told lives in
> [`guide/sharing.md`](../guide/sharing.md), which describes current behaviour only.
>
> **Status — 29 September 2026.** Phase 0 is done (`20261010090000_no_messages_into_the_void`). The
> founder took the §10 decisions on 29 September; they are recorded in §10 and in the canonical
> doc's §3 and §8. Phases 1–5 are not started. Release rule for every phase: **build, then re-vet at
> least three times before release.**
>
> First written 28 September 2026 in answer to the founder's request to look at sharing
> comprehensively: separate being someone's patient from giving live access to your data; share
> one-to-many, for a time, or by category; make hospital-first sharing hold; let hospital clinicians
> set alert rules; and fit the snapshot link and Care Circle into one model. The 28 September draft
> recommended "one account, many workspaces" with a "personal workspace" for private practice; the
> founder decided otherwise (§4.3), and that concept is dropped throughout.

Companions: `docs/independent-clinicians-and-hospitals.md`,
`docs/enterprise-hospital-tenancy-plan.md`, `docs/plans/clinician-offboarding.md`,
`docs/plans/hospital-groups-plan.md`, `docs/withdrawal-and-derived-data.md`.

---

## 1. The short answer

Today one row does two jobs. A `provider_shares` or `practice_shares` row is both *"this is my
clinician"* and *"this clinician may read my data"*, so when a patient stops sharing their data they
also stop being able to hear from their clinician — and the clinician can no longer send them a
discharge summary or a late result. Pull those apart:

- A **care relationship** is being someone's patient. It carries messaging and clinician output
  reaching the patient. It reads nothing of the patient's.
- A **data grant** is live read access to named categories, for a stated time.

Both share tables keep their meaning — `provider_shares` is the patient and a clinician's own
account (pathway A), `practice_shares` the patient and an institution (pathway B) — and both gain a
relationship status beside the grant. Clinician documents keep going straight into the Vault
through "Send to Vault", with a notification on receipt and a visible origin on the document
("From Dr X · St Elsewhere").

The account model is settled by decision rather than by schema: a clinician's hospital work is done
in an account on the hospital's email domain and their private practice in another account, so the
two pathways stay apart by construction (§4.3). This is extending what exists — a status column on
the share rows, a helper beside the existing ones, a state on clinician documents — not a second
consent system.

## 2. What it rests on

| Rule | Source | What it forces here |
| --- | --- | --- |
| **P1** The patient holds the power | Sharing model §1.1 | Only the patient creates, narrows or ends a grant, and picks the audience. Nothing is redirected on their behalf |
| **P2** Nothing is deleted, by default | §1.2, §7 (draft) | Ending a grant or a relationship is a status change. History, ledger and authored records survive |
| **P3** Hidden is not deleted | §1.3 | A patient can put a relationship out of view without ending anything |
| **P4** No break-glass | §1.4 | A relationship without a grant reads nothing |
| **P6** We do not police what is not ours | §1.6 | No rules about whom a clinician contracts with; no OneCare-set retention |
| **Pathway A** | §2A, `provider_shares` | The patient invited a person; the employer never inherits it (§8.2) |
| **Pathway B** | §2B, `practice_shares` | Consent is to the institution; clinicians' access is delegated through assignment |
| Two pathways never merge | `independent-clinicians-and-hospitals.md` §2 | Every guarantee in `independent_vs_institution.test.sql` still holds |
| Consent checked at the moment of the act | Conventions rule 5 | Both the relationship and the grant are asked about at each read or write |
| One vocabulary | Conventions rule 7 | No second grant object, no second permission set; extend the share rows and `share_grants` |
| Leavers lose everything | Sharing model §5 | An institution's records and threads stay with the institution |
| Stopping sharing is not the end of care | Sharing model §3 | The record of care may grow after the grant ends; nothing reads live data; nothing reaches the Vault unasked |

## 3. The current model and its gaps

### 3.1 What exists

| Object | Where | Holds |
| --- | --- | --- |
| `provider_shares` | `20260117044152`, columns through `20260812230349` | Patient → one clinician account: `permissions`, `expires_at`, `invite_code`, `provider_email`, `clinician_user_id` (set on claim, clinician accounts only since `20261010050000`), `revoked_*`, `reconnected_at` |
| `practice_shares` | `20260813125309`, `20260904045011` | Patient → institution: `share_all`, `permissions`, `is_active`, `revoked_*`, `practice_suspended_at`. `UNIQUE (practice_id, user_id)`. No expiry |
| `share_events` | `20260812230349` | Append-only ledger: connected, changed, paused, revoked, reconnected |
| `practice_patient_assignments` | tenancy plan | Delegation inside an institution, time-bounded |
| Helpers | `20261003000000`, `20261009060000`/`090000`, `20261010050000` | `clinician_has_patient_access/permission` ask `provider_shares` and a clinician account; `institution_has_patient_access`, `institution_has_clinical_permission` ask share + membership + assignment in the same practice |
| `messages` | `20260520015525` … `20261010090000` | A thread between patient and clinician; `practice_id` stamped by the server for hospital threads (`20261010070000`); patient INSERT needs someone able to read it (`20261010090000`) |
| `clinician_alert_rules` | through `20261010080000` | Owned by a person, `share_id` references `provider_shares`, needs a vitals grant; no `practice_id` |
| Notices | `20261010010000` | `on_share_ended` tells the other side and archives rules that can no longer see readings |
| Snapshot links | `20261010060000` | Point-in-time copy for someone without an account; ≤ 30 days; optional passcode, locked after three wrong tries; revocable; every view logged |
| Care Circle | `CareCircle.tsx`, `care_alert_settings` | Provider-share invitations; missed-dose alert contacts. Caregiver features paused and hidden |
| Disconnection snapshot | `useCareRecordSnapshot.ts`, called only from `CareCircle.handleRevokeAccess` | Client-side, best-effort, claimed private shares only |

### 3.2 Gaps

Severity is about harm to a patient or to the legal record. "From definitions" means read from the
latest migration, not exercised against a replayed database.

| # | Gap | Evidence | Severity | Status |
| --- | --- | --- | --- | --- |
| G1 | **The relationship dies with the grant.** Every clinician-to-patient write asks the data helper: messages, guidance, clinician documents into the Vault (`20260820100000`), medication proposals, alert rules. Once a patient stops sharing, the clinician cannot send a message, a discharge summary or a late result | From definitions | **High** (clinical safety) | Open — phase 1 |
| G2 | **The patient writes into a void.** The patient's composer stayed open when nobody could read the thread | From definitions | **High** | **Closed** by phase 0 (`20261010090000`) |
| G3 | **The canonical doc and the code disagree on message history.** The doc says both sides keep read-only access; the code gives a private clinician a 90-day wind-down | From definitions | Medium | **Decided**: keep until account closure or author deletion (§10). The 90-day removal is separate work in progress |
| G4 | **Which account did the patient mean?** `provider_shares` does not say in what capacity the clinician was invited | Schema | High | **Decided** by the account model (§4.3, §8.2): a share to a clinician's personal account is theirs; the hospital's record comes from a hospital connection. One edge still open (§10) |
| G5 | **Hospital clinicians cannot set alert rules.** Creation needs a provider share with vitals (`20261010080000`); hospital access does not qualify, by decision in `20261010050000` | From definitions | Medium–High | Open — phase 2 |
| G6 | **A provider share made whoever claimed it a clinician** | From definitions | **High** | **Closed** by `20261010050000` and `20261010090000`; existing non-clinician claimants listed by a production query |
| G7 | **One shape only.** One person or one institution per act; no expiry on `practice_shares`; no "until discharge"; no share to several hospitals in one act | Schema | Medium | Open — phase 5 |
| G8 | **The snapshot promise is larger than the producer.** No care-record snapshot on hospital disconnection, on expiry, or from any screen but Care Circle; no quarterly producer | Code search | Medium | Open — phase 5 |
| G9 | **Consent history can be deleted by cascade.** `provider_shares.user_id` and `practice_shares.practice_id` are `ON DELETE CASCADE` | Schema | Low now; high the day anything deletes an account or tenant | Open — before any deletion is built (sharing model §7) |
| G10 | **The selected practice is a browser preference.** A clinician account with several memberships (a rotating clinician, say) picks its practice in `localStorage`. Clinical rows now carry a server-stamped practice (`20261010070000`), which removes most of the harm | Code, audit §8.2 | Low | Open — phase 4 |
| G11 | **A non-clinical member can file a "From your clinician" document.** The clinician INSERT policy on `health_documents` and its storage twin (`20260820100000`) still use the role-blind `institution_has_patient_access`. A front-desk or billing member who holds view-all (a manager can grant it deliberately) or an assignment passes it. Messaging was fixed for exactly this in `20261010030000`; documents were not | From definitions, not exercised | Medium | Open — fold into phase 1, which rewrites that policy anyway |

### 3.3 How a clinician gets a document to a patient today

Checked in the code on 29 September 2026.

| Path | Where | What happens |
| --- | --- | --- |
| **Send to Vault** | `SendToVaultDialog.tsx`, on the clinician's patient page | Any file up to 20 MB, uploaded into the patient's folder and filed straight into their Vault as `clinician_upload`, labelled "From your clinician". The clinician can add, never edit or remove. Needs a live share (G1) |
| **Message attachment** | `useMessages.ts`, `MessageThread.tsx` | Up to 15 MB; the composer accepts images, PDF, Word (`.doc`, `.docx`), `.txt`, `.csv`. The patient can save it to their Vault with "Save to my records" — but only from a right-click or long-press menu, with no visible button |
| **Visit summary** | `my_visit_summaries()`, `useVisitSummaries.ts` | Signed encounter notes the clinician chose to share, read in the app. Not a Vault document |
| **Guidance** | `clinician_guidance` | Advice read in the app; private shares only |
| **Care record snapshot** | `useCareRecordSnapshot.ts` | An HTML record of the relationship filed to the Vault when the patient ends a claimed private share from Care Circle (G8) |
| **Managed record claim** | `clinician_patient_records` | Documents on a record the clinician kept for someone not yet on OneCare carry over when the patient claims it |

Patient-to-clinician, a patient shares single documents (`document_shares`) or the whole Vault
through the documents category; the clinician opens them from `SharedDocumentsTab.tsx`.

### 3.4 What the in-app viewer can show

The founder wants every document viewable in the platform. The patient's viewer
(`DocumentViewerDialog.tsx`) today:

| Format | In-app | Notes |
| --- | --- | --- |
| Images (PNG, JPEG, GIF, WebP, BMP) | Yes | Rendered directly |
| PDF | Yes, in a sandboxed frame | **Check in Chrome and Edge:** the frame carries `sandbox=""`, and Chromium is known to refuse its built-in PDF viewer inside a fully sandboxed frame. Not verified in a browser in this pass |
| HTML (care records) | Yes | Sandboxed, themed for dark mode, downloadable as PDF |
| Plain text, Markdown, JSON, CSV | Yes | Shown as text, downloadable as PDF |
| **Word (`.doc`, `.docx`)** | **No** — "can't be shown here", open in a new tab | Accepted by the Vault upload, messaging and Send to Vault, so it is the common gap |
| **HEIC (iPhone photos), AVIF** | **No**, except in Safari | Treated as an image and handed to `<img>`; most browsers cannot draw HEIC |
| **Audio and video** | No | Patient recordings have their own screen; other audio or video in the Vault cannot be played |
| **Spreadsheets, RTF, ODT, DICOM** | No | Open in a new tab or download |

Gaps outside the Vault viewer:

- **Message attachments have no viewer.** Images show as a thumbnail that opens in a new tab; every
  other file is a link that opens or downloads outside the app.
- **Clinicians have no viewer for shared documents.** `SharedDocumentsTab` opens a signed URL in a
  new tab for every format.

## 4. The model

### 4.1 Five nouns

| Noun | Is | Carries | Never carries |
| --- | --- | --- | --- |
| **Care relationship** | "I am this clinician's or this institution's patient" | Messaging both ways; clinician output reaching the patient (documents filed to the Vault, with notice and origin); notices; the institution's right to add to its own record of care | Any read of the patient's data |
| **Data grant** | Live read of named categories | Reads through `share_grants`, checked at the moment of each read | Write capability of any kind |
| **Scope** | The categories: `vitals`, `medications`, `adherence`, `conditions`, `allergies`, `documents`, `profile`, plus per-document shares | — | A new key vocabulary |
| **Duration** | Open-ended; until a date; until an episode ends (discharge); a point-in-time snapshot | — | — |
| **Audience** | **Clinician** (a clinician's own account, pathway A), **institution** (a hospital or practice, pathway B), or **link** (a non-user holding a snapshot URL). *Person* audiences (caregivers) are paused | — | — |

The rule that makes the split useful: **reads come from the grant; clinical writes come from the
relationship and the writer's clinical role.** A clinician never gains a read because a relationship
exists, and never loses the ability to reach their patient because a grant ended.

### 4.2 States and transitions

One row per patient per clinician or institution, with two independent answers:

| Relationship | Grant live | Meaning | Patient can message | Clinician side can message and deliver | Clinician side reads live data |
| --- | --- | --- | --- | --- | --- |
| **active** | yes | Today's connected share | Yes | Yes; documents filed to the Vault, patient notified | Yes, within scope |
| **active** | no | "Stopped sharing, still my clinician" — new | Yes | Yes; documents filed to the Vault, patient notified | No |
| **paused** | either | The clinician or institution stepped back — dormant until active again | See §10, still open | No new output; additions to its own record are held | No |
| **closed** | no | The patient ended care | No — the thread shows it is closed and why | No; additions to its own record are held; urgent matters go outside the platform | No |
| **closed** | yes | Not allowed | — | — | — |

| Transition | Who | Effect |
| --- | --- | --- |
| Connect | Patient (or the patient accepting an invite, or claiming a managed record) | Relationship active, grant live, default scope per §2B |
| Narrow or widen scope | Patient | `share_events` 'changed' |
| **Stop sharing** | Patient | Grant ends on the next read; relationship stays active; `on_share_ended` notice reworded ("…stopped sharing their data with you. You can still message them.") |
| Resume sharing | Patient | Grant live again; additions held on both sides while the patient was not sharing are delivered as a listed batch |
| **End care** | Patient | Grant ends if live; relationship closed; the composer closes on both sides with a line in the thread; snapshot filed |
| Grant expires / episode ends | Clock, or the institution's discharge act | Grant ends; relationship stays active; patient told |
| **Pause** | Clinician, or an institution's owner or admin | Relationship dormant; the institution stops reading (`practice_suspended_at`, existing); the patient's consent is untouched; stated to the patient as a pause, not an ending |
| Reactivate | The side that paused | Relationship active again on the patient's existing grant |

A grant can never outlive a closed relationship, and only the patient creates or widens a grant (P1).
Ending, narrowing, pausing and expiring are all safe directions.

### 4.3 Accounts: one account per place of work (decided 29 September 2026)

The 28 September draft recommended one account holding many "workspaces", with a clinician's
private practice as a "personal workspace". **The founder decided the other way, and the personal
workspace concept is dropped.**

- **A clinician working for a hospital uses a separate account on the hospital's email domain.**
  Hospitals already affiliate domains automatically — `practices.allowed_email_domains`, applied by
  `request_practice_affiliation` — and anyone else waits in pending approval. A doctor without a
  hospital address creates one for that hospital; that step is manual.
- **Their private practice is a separate account**, on the Individual or Practice plan.
- **No in-app account switcher for now.** Moving between accounts is sign out, sign in. An account
  switcher is on the roadmap as a future iteration.
- **Shares a patient made to a doctor's personal email are the doctor's.** Like a patient texting a
  doctor's personal phone: the hospital cannot take ownership, and nothing is redirected. A patient
  who wants the hospital to hold the record connects to the hospital.
- **Contracted and rotating clinicians: no special rules.** An account may hold several hospital
  memberships, contracts, or its own business; the platform supports any arrangement.

What this buys: pathways A and B stay apart by construction, leaving a hospital can never touch a
clinician's own patients, the hospital can end an account's access without the leaver's input, and
there is no carry-over of existing shares to do. What it costs, and accepts: one person may have two
actor ids, so "everything Dr Obi did" across contexts is a join by person rather than by account;
and a clinician signs in twice. The switcher addresses the second later.

The connect and invite screens still have to make the context plain: an invitation from a hospital
account names the hospital, so a patient knows whether they are connecting to Dr Obi at Lagos Island
Hospital or to Dr Obi's private practice.

### 4.4 Communication without data

- **Hospital threads belong to the hospital.** `messages.practice_id` is stamped by the server
  (`20261010070000`), and once the thread's clinician has left the patient's current care team reads
  and continues it. Decided on 29 September: hospitals and practices can read message threads with
  their patients — the clinical staff on the patient's care and governance roles, need-to-know —
  with **every read logged and visible to the patient**, and plain disclosure on the connection
  screen. Phase 3 builds the governance read, the logging and the disclosure.
- **A "private" tag for sensitive conversations** (mental health, sexual health, HIV, addiction —
  compare US 42 CFR Part 2) restricts a thread to the treating professionals the patient adds, with
  the patient in control. **Urgent, and not to be built before review with clinicians, governance and
  legal.** It is the one place where the hospital's read above is deliberately narrowed.
- **Who may write:** patient and clinician side, while the relationship is active, with or without
  a grant. The patient INSERT policy already asks whether anyone can read the message
  (`20261010090000`); phase 1 extends that to the relationship.
- **What the patient sends is theirs to send.** A clinician reading a message (or a photo of a
  reading) the patient chose to send while not sharing is correspondence, not a read under a grant.
- **Clinician documents go straight into the Vault** (founder's latest decision, replacing the
  Received-area proposal): "Send to Vault" keeps filing directly, while the relationship is active
  whether or not the patient is sharing data. Two things are added: a **notification on receipt**,
  and a **visible origin** on the document naming the sender and institution ("From Dr X · St
  Elsewhere") in place of today's generic "From your clinician". Attachments in a message thread can
  be added to the Vault from the thread (built, but only behind a context menu — §3.3).
- **While not sharing, the patient can still add anything to their own Vault.** What they add in
  that time is delivered to the clinician side when sharing resumes, in the same listed batch.
- **Medication proposals keep requiring the medications grant.** A proposal is a diff against the
  list, and a clinician who cannot see the list cannot write a safe one.
- **Additions to the clinician side's own record** (encounters, addenda, a late result,
  correspondence) need a relationship that existed — active, paused or closed — and a current
  clinical role. They are marked "added after sharing ended" when made without a live grant, and
  held for delivery.
- **Message history** is kept until the account is closed or the author deletes a message, which
  leaves a remnant. No time limit.

### 4.5 One-to-many, time-bound, category-scoped

- **One-to-many is one act producing several connections**, each its own row, each ended
  separately (groups plan §4.1). `share_events` records a shared batch id so the ledger shows the
  choice was made together. There is no group grant.
- **Duration:** `expires_at` added to `practice_shares`; an episode-bound grant ("until I'm
  discharged") ends on the institution's discharge act, and the patient is told. Ending early is
  always the safe direction.
- **Scope:** unchanged vocabulary; per-document shares (`document_shares`) remain the finer grain.
  The hospital default — everything, disclosed, deselectable — is unchanged.

### 4.6 Alert rules for hospital patients

- `clinician_alert_rules` gains `practice_id`. A rule set in a hospital is the hospital's, authored
  by a named clinician.
- **Create and re-enable** require `institution_has_clinical_permission(patient, 'vitals')` in that
  practice. Whether a capability such as `set_alert_rules` is also needed waits on the groups plan's
  phase 0, which makes capabilities enforceable.
- **Delivery** re-checks at send time through a service-role helper asking the institution question
  about a named user (the shape of `clinician_can_see_patient_as()` in `20261010050000`).
- **Recipients** are the rule's author while assigned, otherwise the patient's current assignee or
  department. When the author leaves, the rule stays with the hospital and follows the assignment.
- **On share end,** `on_share_ended` archives a rule when its institution has lost the vitals grant.
- The patient continues to see every rule set for them, labelled by who set it.

### 4.7 Care Circle, caregivers and the snapshot link

- **Caregivers are paused** and hidden until later in the roadmap. When they return, a caregiver
  holds a read grant with no clinical capability; closing G6 already guarantees a caregiver's claim
  never becomes a clinician's.
- **The snapshot link is built** (`20261010060000`): a point-in-time copy of chosen categories,
  expiring within 30 days, optional passcode locked after three wrong tries, revocable, every view
  logged, no relationship, no writes. Phase 5 writes it into `share_events` so the patient's ledger
  shows it beside everything else.
- **One screen.** "Who can see my record" lists clinicians, institutions and links, with what each
  can see, until when, and whether you can still message them.

### 4.8 What changes in the database

| Change | Replaces or extends |
| --- | --- |
| `relationship_status` (`active` \| `paused` \| `closed`), `closed_at/by/reason`, `paused_at/by` on both share tables; `expires_at`, `ends_on_discharge` on `practice_shares`; `batch_id` on the matching `share_events` | Extends the existing rows; `is_active` keeps meaning "grant live" |
| `has_care_relationship(patient)` — relationship active, caller a clinician on it (provider share) or an active clinical member assigned or view-all (institution) | New helper beside the grant helpers; **no policy ORs it into a read** |
| Policies moved from grant to relationship: messages INSERT/SELECT/UPDATE, guidance INSERT, clinician document INSERT (still filed straight to the Vault), addenda and record-of-care additions | G1 |
| Clinician document INSERT gated on a clinical role (`institution_has_clinical_access`, not `institution_has_patient_access`), row and storage | G11 |
| A notification to the patient when a clinician document is filed (a producer in the notification catalogue); the sender's name and institution stored and shown as the document's origin; the interim-additions batch in both directions | §4.4 |
| Thread reads by governance roles, each read logged to the patient's access history | §4.4, phase 3 |
| `practice_id` on `clinician_alert_rules` and `clinician_guidance`; alert policies and `check-vital-alerts` as §4.6; `on_share_ended` institution-aware | G5 |
| Server-side care-record snapshot on every grant end, queued by trigger and produced by an edge function | G8 |
| Cascades on `provider_shares.user_id` and `practice_shares.practice_id` removed | G9 |

### 4.9 What changes in the interface

- Patient, Care Circle: "Stop sharing my data" and "End care with …" as two separate acts, each
  saying what the other side will and will not be able to do. A pause from the clinician side is
  shown as a pause.
- Patient, messages: the composer states the relationship ("Dr Obi can't see your readings any more,
  but can still read your messages"); closed threads close with a line saying so. At a hospital, the
  connection screen and the thread say that the hospital's care team can read the conversation.
- Patient, Vault: a notification when a clinician files a document, and an origin tag on it ("From
  Dr X · St Elsewhere"); the "added while you were not sharing" batch on reconnection. A visible
  "Save to my records" on message attachments.
- Snapshot link: opens for anyone with the link and passcode, with no account, and is never refused
  because the browser holds another OneCare session (signed in, or expired).
- Viewer: Word and HEIC shown in the app; message attachments and clinicians' shared documents open
  in the same viewer as the Vault (§3.4).
- Clinician: a patient who stopped sharing stays in the list, marked, with messaging open and data
  panels replaced by a remnant saying why.
- Hospital: alert rules on the patient page for assigned clinicians; rules in the Coverage tab when
  their author has gone.

## 5. The founder's scenarios, handled

| Scenario | Today | Under v2 |
| --- | --- | --- |
| Patient stops sharing but wants to keep talking | Both sides silenced; the composer closes and says why (phase 0) | Grant ends, relationship stays; both can message |
| Clinician must get a discharge summary or late result to that patient | Impossible in-app once the share ends | Filed to the Vault with "Send to Vault"; the patient is notified and sees who sent it |
| Patient ended everything; an urgent result arrives | Nothing possible in-app | The institution contacts the patient outside the platform; the result is added to its record and held |
| Patient shares with Dr Obi's personal email; Dr Obi works at Lagos Island | A personal share | Still a personal share — Dr Obi's, not the hospital's. For the hospital to hold the record the patient connects to the hospital |
| Dr Obi sees patients at Lagos Island | — | In the Lagos Island account, on the hospital's domain; patients connect to the hospital and Dr Obi is assigned |
| Dr Obi leaves Lagos Island | Leaver loses everything of the hospital's; open work frozen and routed (offboarding phases 1–3) | Unchanged; the private-practice account is untouched |
| Share with three sister hospitals at once, for two weeks, meds and allergies only | Three separate acts, no expiry on institution shares | One act, three connections, one batch in the ledger, `expires_at` on each |
| Hospital cardiologist sets a BP alert; later leaves | Not possible (G5) | Rule owned by the hospital, follows the assignment when the author leaves |
| Relative abroad, not a user, needs a record | Snapshot link (built) | Unchanged; also shown in the ledger |
| Caregiver in Care Circle | Refused as a clinician (G6 closed); caregiver features paused | Returns later as a read-only person grant |
| Patient resumes sharing | Starts from scratch | Grant live again; interim additions on both sides delivered as a listed batch |

## 6. Existing data

No stored consent is rewritten, on the precedent of the vocabulary work ("No stored consent was
rewritten" in the sharing model). With the personal workspace dropped there is **no carry-over**:
`provider_shares` stays pathway A, on whichever account the patient invited.

1. **Relationship status** is added as `active` on every live row and `closed` on every revoked row,
   with the revocation's own time and reason. Nothing else about a row changes.
2. **Non-clinician claimants** — caregiver or patient accounts that opened a clinician invite link
   and were attached as the share's clinician — are refused from `20261010050000` on. The existing
   ones are listed by a production query; what they already wrote stays, attributed, and the patient
   is told.
3. **Hospital threads** keep the `practice_id` back-filled by `20261010070000` (only where exactly
   one practice fits); ambiguous threads stay unstamped and keep the old reading.
4. **Clinician documents already in the Vault** stay there, labelled "From your clinician". Whether
   their origin tag is back-filled with the sender's name and institution (the sender is stored in
   `uploaded_by_user_id`; the institution is not) is an implementation choice for phase 1.

## 7. Phases

Every phase: build, then **re-vet at least three times before release** — SQL suites in the
existing style with each assertion watched failing first, then a signed-in pass as each party.

| Phase | What | Size | Closes |
| --- | --- | --- | --- |
| **0. Stop the void** (done) | Patient `messages` INSERT requires someone able to read it; `my_message_counterparties()` tells the composer why it is closed (`20261010090000`) | S | G2 |
| **1. Relationship apart from grant** | `relationship_status` on both share tables; `has_care_relationship`; messages, guidance and document INSERT move to it; clinician documents still filed to the Vault, now with a notification on receipt, a named origin tag and the clinical-role gate; "Stop sharing" and "End care" as two acts; pause and reactivate from the clinician side; held additions and the two-way reconnection batch; message history kept (with the 90-day removal in separate work) | **M**, about 1.5 weeks | G1, G3, G11 |
| **2. Hospital alert rules** | `practice_id` on rules; policies; service-role re-check in `check-vital-alerts`; institution-aware `on_share_ended`; rules follow assignment when the author leaves | **M**, about a week | G5 |
| **3. Hospital threads** | Governance-role read; every thread read logged to the patient's access history; the connection-screen disclosure. The private tag only after its review | **M** | §4.4 |
| **4. Context and viewer** | Invite and connect screens name the hospital or private practice; server-side practice selection for accounts with several memberships; in-app viewer for Word and HEIC, message attachments and clinicians' shared documents; a visible "Save to my records"; confirm the snapshot link opens with no account and with any other OneCare session present | **M** | G10, §3.4 |
| **5. Shapes and one screen** | `expires_at` and discharge-bound grants for institutions; multi-institution connect in one act (with groups plan phase 4); "Who can see my record"; the snapshot link in the ledger; server-side care-record snapshots on every grant end; cascades removed | **M**, about 1.5 weeks | G7, G8, G9 |

## 8. What this does not change

No break-glass (P4). The hospital default posture and its disclosure. The permission vocabulary and
`share_grants`. The group layer never appears inside a consent helper (groups plan §7).
Family-member targeting and caregivers stay paused.

## 9. Where to be careful

- **The relationship helper must never be ORed into a read.** The first policy that says "grant or
  relationship" on `vitals` turns "still my clinician" into "still reading my data". Assert it
  structurally, not only behaviourally.
- **Delivery is outbound only.** Filing a document into a patient's Vault grants the sender
  nothing; they do not see it again unless the patient shares documents with them.
- **Hospital-readable threads change what a patient may have assumed was a private conversation.**
  The connection screen says so before governance read ships, and the private tag is the answer for
  the conversations that must not be widely read.
- **A pause is not a closure.** A clinician side that pauses must never be able to close the
  patient's grant or relationship; only the patient ends care.
- **Practice from the client is a suggestion.** A row's `practice_id` comes from the server.

## 10. Decisions

### Decided (founder, 29 September 2026)

1. **May a clinician or institution end its side of the relationship?** Yes, as a **pause**: the
   relationship goes dormant until it is active again. It is not a hard end, and it is shown to the
   patient as a pause.
2. **Offered or auto-filed?** Filed. Clinician documents keep going **straight into the Vault**
   through "Send to Vault", with a **notification on receipt** and a **visible origin tag** on the
   document ("From Dr X · St Elsewhere"). There is no separate Received tab (this replaces an
   earlier same-day decision for a Received area). Attachments in messages can also be added from
   the thread. While not sharing, the patient can still add anything to their own Vault, and those
   interim additions are delivered when sharing resumes.
3. **An urgent result after the patient closed the relationship** is the institution's to deliver
   outside the platform; it has the patient's contact details. Nothing is pushed through a closed
   relationship.
4. **Staff in a private practice, and growing.** The plans are **Individual** ($99/month),
   **Practice** ($299/month, with a limited number of staff seats including non-clinical roles) and
   **Enterprise** (from $2,500/month). Growing past the Practice limits means upgrading to
   Enterprise. (Verified against `src/hooks/useClinicianSubscription.ts`: tier keys `solo`, `pro`,
   `enterprise` carry the labels Individual, Practice and Enterprise; Practice seats are the owner
   plus five.)
5. **Hospital-only clinicians.** Not OneCare's to police. Contracted and rotating clinicians work any
   arrangement — several hospitals, contracts, their own business — with no special rules.
6. **Carry-over notice.** Not needed: there is no carry-over (§6).
7. **Non-clinician claimants** — accounts (caregivers or patients) that opened a clinician invite
   link and were attached as the share's clinician — are now blocked (`20261010050000`); existing
   ones are listed by a production query.
8. **Hospital team reading threads.** Yes: hospitals and practices can read message threads with
   their patients — need-to-know clinical staff and governance roles — with every read logged and
   visible to the patient and plain disclosure at connection. A **private** tag for sensitive
   discussions is an urgent roadmap item for review with clinicians, governance and legal before it
   is built.
9. **Revenue attribution for a personal workspace.** Moot: there is no personal workspace.
10. **Billing a clinician with both.** A non-question: every clinician is billed for their own
    account.
11. **Accounts.** Separate account on the hospital's email domain for hospital work (created manually
    by a doctor without one); private practice a separate account; no in-app switcher for now (log
    out and in), with the switcher on the roadmap. The "personal workspace" is dropped.
12. **Shares to a doctor's personal email** are the doctor's; the hospital cannot take ownership and
    nothing is redirected.
13. **Message history after a relationship ends.** Kept until account closure or author deletion
    (which leaves a remnant). The 90-day rule is removed (in separate work).
14. **The snapshot link.** Built: expiry at most 30 days, optional passcode, three wrong tries lock
    the link, revocable, every view logged. A clinician who needs ongoing access should be connected
    instead. **Viewing needs no account**: it is a password-protected view, and it must never be
    refused because the viewer has some other OneCare session in the browser. The edge function
    already ignores the caller's session; the route guards and the browser client on `/s` still need
    checking with a signed-in and an expired session (phase 4's re-vet).
15. **Caregiver features are paused** and hidden until later in the roadmap.

### Still open

- **Episode-bound grants:** is the institution's discharge act the trigger, with what grace period,
  and does the patient confirm?
- **A pause from the clinician side:** who may reactivate it, and can the patient still write while
  it is paused (and if so, who reads)?
- **A share addressed to a clinician's hospital-domain account:** it is pathway A by construction.
  Recommendation: the invitation screen offers the patient the hospital connection with that
  clinician requested, and the patient chooses; nothing is redirected either way.
- **Governance roles:** which roles read hospital threads (owners and admins only, or a named
  clinical-governance role that does not exist yet).
- **Existing hospital threads:** whether patients are told before governance read and logging are
  switched on for threads that predate the disclosure.
- **The private tag:** design, in review.
