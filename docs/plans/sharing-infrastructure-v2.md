# Sharing Infrastructure v2 — care relationships, data grants and workspaces

> **Proposed, not started — 28 September 2026.** Written in answer to the
> founder's request to look at sharing comprehensively: separate being someone's
> patient from giving live access to your data; share one-to-many, for a time,
> or by category; make hospital-first sharing hold when a clinician works under
> a hospital's name; let hospital clinicians set alert rules; and fit the
> snapshot link and Care Circle into one model. Restart when: the decisions in
> §10 are taken. Phase 0 is small, depends on none of them, and closes a hole
> that exists now.
>
> This document describes an intention, not current work.

Companion to `docs/sharing-access-consent-model.md` (canonical; amended the
same day for deletion, additions after sharing stops, and leavers),
`docs/independent-clinicians-and-hospitals.md`,
`docs/enterprise-hospital-tenancy-plan.md`, `docs/plans/clinician-offboarding.md`,
`docs/plans/hospital-groups-plan.md` and `docs/withdrawal-and-derived-data.md`.

---

## 1. The short answer

Today one row does two jobs. A `provider_shares` or `practice_shares` row is
both *"this is my clinician"* and *"this clinician may read my data"*, so when a
patient stops sharing their data they also, without being told, stop being able
to hear from their clinician — and the clinician can no longer send them a
discharge summary or a late result. Pull those apart:

- A **care relationship** is being someone's patient. It carries messaging and
  clinician output reaching the patient. It reads nothing of the patient's.
- A **data grant** is live read access to named categories, for a stated time.
  It hangs off a relationship for clinical audiences, and stands alone for a
  caregiver or a link.

And make every clinical audience a **workspace**: a hospital, or a clinician's
own practice as a workspace of one, reached from one account. Then a patient
seeing Dr Obi at Lagos Island Hospital shares with the hospital (Dr Obi sees it
through assignment), a patient seeing Dr Obi privately shares with Dr Obi's
practice, the two never mix, and pathways A and B become one rule — tenant
isolation — that the database already half-enforces.

Most of this is extending what exists: a status column on the share rows, a
second helper beside the existing two, `practice_id` on the rows that lack it,
and a carry-over of existing private shares into personal workspaces. It is not
a second consent system.

## 2. What it rests on

| Rule | Source | What it forces here |
| --- | --- | --- |
| **P1** The patient holds the power | Sharing model §1.1 | Only the patient creates, narrows or ends a grant, and picks the audience. Nothing is redirected on their behalf |
| **P2** Nothing is deleted, by default | §1.2, §7 (amended) | Ending a grant or a relationship is a status change. History, ledger and authored records survive |
| **P3** Hidden is not deleted | §1.3 | A patient can put a relationship out of view without ending anything |
| **P4** No break-glass | §1.4 | A relationship without a grant reads nothing. Emergency access stays with next of kin and Care Circle |
| **Pathway A** | §2A, `provider_shares` | The patient invited a person; the employer never inherits it |
| **Pathway B** | §2B, `practice_shares` | Consent is to the institution; clinicians' access is delegated through assignment |
| Two pathways never merge | `independent-clinicians-and-hospitals.md` §2 | Whatever unifies them must keep every guarantee asserted in `independent_vs_institution.test.sql` |
| Consent checked at the moment of the act | Conventions rule 5 | Both the relationship and the grant are asked about at each read or write |
| One vocabulary | Conventions rule 7 | No second grant object, no second permission set; extend the share rows and `share_grants` |
| Leavers lose everything | Sharing model §5 (decided 28 Sep) | A workspace's records stay with the workspace |
| Additions after sharing stops | Sharing model §3 (decided 28 Sep) | The record of care may grow after the grant ends; nothing reads live data, nothing reaches the Vault unasked |

## 3. The current model and its gaps

### 3.1 What exists

| Object | Where | Holds |
| --- | --- | --- |
| `provider_shares` | `20260117044152`, columns added through `20260812230349` | Patient → one person: `permissions`, `expires_at`, `invite_code`, `provider_email`, `clinician_user_id` (set on claim), `revoked_*`, `reconnected_at`. No practice, no audience type |
| `practice_shares` | `20260813125309`, `20260904045011` | Patient → institution: `share_all`, `permissions`, `is_active`, `revoked_*`, `practice_suspended_at`. `UNIQUE (practice_id, user_id)`. No expiry |
| `share_events` | `20260812230349` | Append-only ledger: connected, changed, paused, revoked, reconnected |
| `practice_patient_assignments` | tenancy plan | Delegation inside an institution, time-bounded |
| Helpers | `20261003000000` (clinician), `20261009060000`/`090000` (institution) | `clinician_has_patient_access/permission` ask `provider_shares` only; `institution_has_patient_access`, `institution_has_clinical_permission` ask share + membership + assignment in the same practice |
| `messages` | `20260520015525`, `20260820120000`, `20261003000000` | A thread is two people. No `practice_id` |
| `clinician_alert_rules` | `20260117063816`, `20260118222532`, `20260820151115`, `20261009100000`, `20261010010000` | Owned by a person, `share_id` references `provider_shares`, no `practice_id` |
| Notices | `20261010010000` | `on_share_ended` tells the other side and archives rules that can no longer see readings |
| Care Circle | `CareCircle.tsx`, `care_alert_settings`, `caregiver_access` (paused plan) | Provider-share links offered "for your doctor, pharmacist, or caregiver"; missed-dose alert contacts |
| Disconnection snapshot | `useCareRecordSnapshot.ts`, called only from `CareCircle.handleRevokeAccess` | Client-side, best-effort, claimed private shares only |

### 3.2 Gaps

Severity is about harm to a patient or to the legal record. "From definitions"
means read from the latest migration, not exercised against a replayed database.

| # | Gap | Evidence | Severity |
| --- | --- | --- | --- |
| G1 | **The relationship dies with the grant.** Every clinician-to-patient write asks the data helper: messages INSERT (`clinician_has_patient_access OR institution_has_patient_access`, `20260820120000`), guidance INSERT (`clinician_has_patient_access`, `20260118222532`), clinician documents into the Vault (`20260820100000`), medication proposals (live medications share), alert rules. Once a patient stops sharing, the clinician cannot send a message, a discharge summary or a late result | From definitions | **High** (clinical safety) |
| G2 | **The patient writes into a void.** "Patients can send messages" checks only that the sender is the patient. A private clinician reads only messages created before `revoked_at` (`clinician_had_patient_access_at`), an institution clinician only while access is live. The patient's composer stays open and nothing says nobody can read it | From definitions | **High** |
| G3 | **The canonical doc and the code disagree on message history.** §3 says both sides keep read-only access. The code gives a private clinician a 90-day wind-down and an institution clinician nothing once the share ends; a hospital's colleagues never read the thread at all (offboarding G2) | From definitions | Medium |
| G4 | **The hospital lacks the record when a patient shares with its clinician personally.** `provider_shares` does not say in what capacity the clinician was invited. A doctor can see a patient in the hospital's clinic while every note sits on the personal pathway, invisible to the hospital that answers for the care. The existing rule that a hospital never inherits a private list is right — but the patient was never asked which they meant | Schema | **High** (institutional record, liability) |
| G5 | **Hospital clinicians cannot set alert rules.** INSERT and re-enable require `clinician_has_patient_access` (`20260118222532`, `20261009100000`); `check-vital-alerts` re-checks with `clinicianShareGrants(..., 'vitals')`, provider shares only. A rule is a person's, so if a hospital could set one it would leave with the clinician | From definitions | Medium–High |
| G6 | **A provider share makes whoever claims it a clinician.** The claim policy hands it to a matching confirmed email, and `get-shared-patient-data` (lines 184–201) hands an unclaimed link to the first signed-in account that opens it, addressed or not (already a pending decision in the roadmap). Neither the claim nor the helpers ask whether the claimant is a clinician. Care Circle offers the link for a caregiver, and a caregiver who claims it can, to every policy, issue guidance, file "From your clinician" documents, propose medication changes and set alert rules | From definitions | **High** |
| G7 | **One shape only.** One person or one institution per act; expiry only on `provider_shares`; no "until discharge"; no share to several hospitals in one act (groups plan §4.1 wants it) | Schema | Medium |
| G8 | **The snapshot promise is larger than the producer.** No snapshot on hospital disconnection, on expiry, or when a share ends from any other screen; no quarterly producer | Code search | Medium |
| G9 | **Consent history can be deleted by cascade.** `provider_shares.user_id` and `practice_shares.practice_id` are `ON DELETE CASCADE` | Schema | Low now; high the day anything deletes an account or tenant |
| G10 | **The workspace is a browser preference.** `useWorkspaceSelection` keeps the choice in `localStorage`; pass 8 found screens and permissions naming different workspaces. Nothing written records which workspace a clinical act was done in | Code, audit §8.2 | Medium |

## 4. The proposed model

### 4.1 Five nouns

| Noun | Is | Carries | Never carries |
| --- | --- | --- | --- |
| **Care relationship** | "I am this workspace's patient" | Messaging both ways; clinician output reaching the patient (guidance, documents, prescriptions copies); notices; the institution's right to add to its own record of care | Any read of the patient's data |
| **Data grant** | Live read of named categories | Reads through `share_grants`, checked at the moment of each read | Write capability of any kind |
| **Scope** | The categories: `vitals`, `medications`, `adherence`, `conditions`, `allergies`, `documents`, `profile` (canonical vocabulary), plus per-document shares | — | A new key vocabulary |
| **Duration** | Open-ended; until a date; until an episode ends (discharge); a point-in-time snapshot | — | — |
| **Audience** | **Workspace** (a hospital, or a clinician's own practice), **person** (Care Circle: caregiver, family, next of kin), or **link** (a non-user holding a snapshot URL) | — | — |

The rule that makes the split useful: **reads come from the grant; clinical
writes come from the relationship and the writer's role in the workspace.** A
clinician never gains a read because a relationship exists, and never loses the
ability to reach their patient because a grant ended.

Only a workspace has a care relationship. A person audience has a grant and no
clinical write capability at all; a link audience has a snapshot and nothing
else.

### 4.2 States and transitions

A clinical connection is one row per patient per workspace (the existing
`UNIQUE (practice_id, user_id)`), with two independent answers:

| Relationship | Grant live | Meaning | Patient can message | Workspace can message and deliver | Workspace reads live data |
| --- | --- | --- | --- | --- | --- |
| **active** | yes | Today's connected share | Yes | Yes; documents auto-file to the Vault as now | Yes, within scope |
| **active** | no | "Stopped sharing, still my clinician" — new | Yes | Yes; documents arrive as an **offer** the patient accepts into the Vault | No |
| **closed** | no | "No longer my clinician" | No — the thread shows it is closed and why | No; additions to its own record are held (§3 amendment) | No |
| **closed** | yes | Not allowed | — | — | — |

| Transition | Who | Effect |
| --- | --- | --- |
| Connect | Patient (or the patient accepting an invite) | Relationship active, grant live, default scope per §2B |
| Narrow or widen scope | Patient | `share_events` 'changed' |
| **Stop sharing** | Patient | Grant ends on the next read; relationship stays active; `on_share_ended` notice as today, reworded ("…stopped sharing their data with you. You can still message them.") |
| Resume sharing | Patient | Grant live again; additions held while the patient was not sharing are delivered as a listed batch (§3 amendment) |
| **End the relationship** | Patient | Grant ends if live; relationship closed; the composer closes on both sides with a line in the thread; snapshot filed |
| Grant expires / episode ends | Clock, or the institution's discharge act | Grant ends; relationship stays active; patient told |
| Workspace suspends its own access | Owner or admin (`practice_suspended_at`, existing) | Reads stop; nothing about the patient's consent changes |
| Workspace ends its side of care | Owner or admin (open question 1) | Relationship closed from the workspace's side, stated as such to the patient |

A grant can never outlive its relationship, and only the patient creates or
widens a grant (P1). Ending, narrowing and expiring are all safe directions.

### 4.3 Every clinical audience is a workspace — and one account holds many

**Recommendation: one account, many workspaces.** A clinician's private practice
is a workspace of `kind = 'personal'`; a hospital is a workspace of kind
`hospital`; a group practice `practice`. Every clinical connection points at a
workspace. A patient may name the clinician they want; in a hospital that
becomes an assignment made at connection (`assigned_by` recording that the
patient asked for them), which the hospital can later change with the patient
told — exactly the delegation §2B already describes. In a personal workspace the
one clinician is always the assignee.

Four invariants, each enforced at the row:

1. **A personal workspace has exactly one clinical member, fixed for its life.**
   This is what makes a grant to it mean precisely what a `provider_shares` row
   means today — this person — and it is what lets the existing private shares
   carry over without rewriting what any patient agreed to.
2. **Connections never move between workspaces.** Taking a hospital post moves
   nothing into the hospital; leaving moves nothing out. A patient who wants the
   hospital to have what their private doctor has makes a second connection
   (the refer-in flow the independent-clinicians doc §5 and groups plan §4.2
   both ask for, built once).
3. **The patient picks the workspace, knowingly.** The directory and the invite
   screen show "Dr Ada Obi — Lagos Island Hospital" and "Dr Ada Obi — private
   practice" as different choices. An invite link is issued *from* a workspace,
   so an invite carries the context the clinician chose, and the accept screen
   names it.
4. **Every clinical write records the workspace that admitted it**, derived in
   the database from the connection, never from the client's workspace selector
   (G10).

**On the founder's proposal** — "shares to a clinician who belongs to a
hospital go to the hospital": yes, whenever the clinician is being seen in their
hospital capacity, and the model makes that the default by construction: a
clinician with no private workspace can only be reached through their hospital,
and one invited from the hospital's workspace or found through its page lands
there. What the model does not do is redirect a share the patient deliberately
made to a clinician's private practice. That would give the hospital a private
list it was never given (independent-clinicians §2) and override the patient's
choice (P1). The remaining risk — a doctor seeing hospital patients on their
private workspace — is an employment matter the hospital can govern; the
platform can support it with a clinician setting "accept new patients only
through Lagos Island Hospital" (open question 5).

**Pathways A and B become one rule.** "A hospital never inherits a doctor's
private list", "a doctor never gains the hospital's list", "leaving does not take
your own patients", "another hospital's membership grants nothing" — each
becomes a statement about two different workspaces, and tenant isolation is
already enforced in the institution helpers (`20261009060000`: share,
membership and assignment must be the same practice). The existing suite is
rewritten as a tenant-isolation suite asserting the same sentences.

#### Compared: separate accounts with switching, versus one account

| | Separate account per context (founder's float) | One account, many workspaces (recommended) |
| --- | --- | --- |
| Signing in | Two credentials, two second factors; switching is sign-out/sign-in or a multi-session client | One sign-in; the switcher already exists (`useWorkspaceSelection`) and moves to the server |
| Identity and licence checks | Done twice, can drift apart | Once, per person |
| Audit | One human, two actor ids; "everything Dr Obi did" needs a manual join, and non-repudiation weakens | One actor id; each row names the workspace that admitted it |
| What the patient sees | Two unrelated "Dr Obi"s; two message threads | One Dr Obi, with the context named on each connection |
| Notifications and alerts | Split; an alert lands in the account not signed in | One bell, labelled by workspace |
| Billing | Naturally separate | Also separate: subscription on the workspace (`practices.subscription_*` exists); solo tier on the personal workspace, hospital contract on the hospital |
| Independents who never join a hospital | Unchanged | A personal workspace created at clinician onboarding, shown with none of the hospital chrome (independent-clinicians §4) |
| Leaving a hospital | The hospital deactivates that account | The membership ends (offboarding phase 1); same outcome, no second account |
| Hospital-managed identity (SSO, Phase E) | Natural: the hospital owns the login | Achievable: entering the hospital workspace can require the hospital's identity provider as a step-up |
| Migrating existing data | Every hospital membership moves to a new account; the merge problem is created on day one | Existing private shares carry over to a personal workspace (§6) |
| Merging later | The hardest operation in any record system (corrections plan, scenario 2) | Never needed |

Separate accounts buy hard isolation by construction and nothing else that one
account with row-enforced tenant isolation does not also give — and they cost a
merge problem, a split audit trail and a confused patient. Isolation is already
a row rule; it should stay one.

What the recommendation reverses, and says so: independent-clinicians §4 holds
that a solo clinician has no `practices` row and that a practice is optional
context. Under this model the row exists and the *experience* stays optional:
a personal workspace has no departments, no staff admin, no billing-which-
practice question. The failure the doc warned about — hospital screens with the
hospital bits hidden — is avoided by driving the interface from `kind`, not by
the absence of a row.

### 4.4 Communication without data

- **Threads belong to the connection**, not to two people: `messages` gains
  `practice_id`, set in the database from the connection (offboarding §5.4
  proposed the same). In a personal workspace that is still one clinician. In a
  hospital, the clinical team working the patient reads the thread and can pick
  it up when a clinician leaves — which is the offboarding plan's decision 1,
  now required by the model and needing the same disclosure on the connect
  screen.
- **Who may write:** patient and workspace, while the relationship is active,
  with or without a grant. The patient INSERT policy gains the relationship
  check it has never had (G2).
- **What the patient sends is theirs to send.** A clinician reading a message
  (or a photo of a reading) the patient chose to send while not sharing is not
  a read of the patient's data under a grant; it is correspondence.
- **Clinician output while not sharing:** guidance and messages go as normal;
  a document arrives as an offer — "Lagos Island Hospital sent you a discharge
  summary. Add it to your Vault?" — so nothing reaches the Vault unasked (§3
  amendment). Declining leaves it in the hospital's record.
- **Medication proposals keep requiring the medications grant.** A proposal is a
  diff against the list, and a clinician who cannot see the list cannot write a
  safe one.
- **Additions to the workspace's own record** (encounters, addenda, a late
  result, correspondence) need a relationship that existed — active or closed —
  and a current clinical membership of the workspace. They are marked "added
  after sharing ended" when made without a live grant, and held for delivery.

### 4.5 One-to-many, time-bound, category-scoped

- **One-to-many is one act producing several connections**, each its own row,
  each ended separately (groups plan §4.1). `share_events` records a shared
  batch id so the ledger shows the choice was made together. There is no group
  grant.
- **Duration:** `expires_at` added to `practice_shares`; an episode-bound grant
  ("until I'm discharged") ends on the institution's discharge act, and the
  patient is told. Ending early is always the safe direction, so letting the
  institution end a grant it was given on those terms does not weaken P1.
- **Scope:** unchanged vocabulary; per-document shares (`document_shares`)
  remain the finer grain. The default posture for hospitals — everything,
  disclosed, deselectable — is unchanged.

### 4.6 Alert rules for hospital patients

- `clinician_alert_rules` gains `practice_id`. A rule in a hospital workspace is
  the hospital's, authored by a named clinician.
- **Create and re-enable** require `institution_has_clinical_permission(patient,
  'vitals')` in that practice (clinical role, assigned or view-all, the
  patient's vitals grant). Whether it also needs a capability such as
  `set_alert_rules` waits on the groups plan's phase 0, which makes capabilities
  enforceable.
- **Delivery** re-checks at send time, as `check-vital-alerts` already does for
  private rules, through a service-role helper that asks the institution
  question about a named user (the same shape as `clinician_still_reaches_patient`
  in `20261010010000`; the roadmap already notes EHR jobs need one).
- **Recipients** are the rule's author while they are assigned, otherwise the
  patient's current assignee or department. When the author leaves, the rule
  stays with the hospital, marked with its author, and follows the assignment.
- **On share end,** `on_share_ended` archives a rule when *its workspace* has
  lost the vitals grant, rather than asking about provider shares only.
- The patient continues to see every rule set for them, labelled by workspace.

### 4.7 Care Circle, caregivers and the snapshot link

- **Person audience (Care Circle).** A caregiver, family member or next of kin
  holds a grant with a scope and a duration and no clinical capability: no
  guidance, no "From your clinician" documents, no proposals, no alert rules.
  Their own alerting stays `care_alert_settings`. A caregiver who *writes* on
  the patient's behalf is the paused caregiver plan and is not reopened here.
  Closing G6 is the first consequence: a clinical connection requires the
  claimant to be a clinical member of the workspace, so a link given to a
  caregiver can only ever become a person grant.
- **Link audience (the snapshot link being built separately).** A snapshot is
  materialised when it is made — a point-in-time copy of the chosen categories,
  watermarked — and is never a live read. It must expire, every open is logged,
  the patient can revoke it, and it carries no relationship, no messaging and no
  writes. Signing up through it creates nothing: live access still needs the
  patient to connect. It should use `share_grants` for its scope and write to
  `share_events`, so the patient's ledger shows it beside everything else.
- **One screen.** "Who can see my record" lists workspaces, people and links,
  with what each can see, until when, and whether you can still message them.

### 4.8 What changes in the database

| Change | Replaces or extends |
| --- | --- |
| `practices.kind` (`personal` \| `practice` \| `hospital`; `group` later from the groups plan) with a CHECK, and a trigger holding invariant 1 | `tenant_type`, which has no constraint |
| `practice_shares.relationship_status` (`active` \| `closed`), `closed_at/by/reason`, `expires_at`, `ends_on_discharge`, `batch_id` on the matching `share_events` | Extends the existing row; `is_active` keeps meaning "grant live" |
| `has_care_relationship(patient)` — relationship active, caller an active clinical member of that workspace, assigned or view-all | New helper beside the grant helpers; no policy ORs it into a read |
| Policies moved from grant to relationship: messages INSERT/SELECT/UPDATE, guidance INSERT, clinician document INSERT (with an `offered` state when no grant), addenda and record-of-care additions | G1 |
| Patient `messages` INSERT requires an active relationship | G2 |
| `practice_id` on `messages`, `clinician_guidance`, `clinician_alert_rules`, `clinician_dictations`, and wherever a clinical row lacks it, set by trigger from the connection | G4, G10 |
| Alert rule policies and `check-vital-alerts` as §4.6; `on_share_ended` workspace-aware | G5 |
| `provider_shares` carry-over (§6); `clinician_has_*` become wrappers, then retire | One pathway |
| Claim requires a clinical membership for a workspace audience; otherwise becomes a person grant | G6 |
| Server-side snapshot on every grant end, queued by trigger and produced by an edge function | G8 |
| Cascades on `provider_shares.user_id` and `practice_shares.practice_id` removed | G9 |

### 4.9 What changes in the interface

- Patient, Care Circle: "Stop sharing my data" and "End care with …" as two
  separate acts, each saying what the other side will and will not be able to
  do. The connect screen names the workspace and the requested clinician.
- Patient, messages: the composer states the relationship ("Dr Obi can't see
  your readings any more, but can still read your messages"); closed threads
  close with a line saying so.
- Patient, Vault: offered documents, and the "added while you were not sharing"
  batch on reconnection.
- Clinician: the workspace switcher moves to the server and is shown on every
  write screen; a patient who stopped sharing stays in the list, marked, with
  messaging open and data panels replaced by a remnant saying why.
- Hospital: alert rules on the patient page for assigned clinicians; rules in
  the Coverage tab when their author has gone.

## 5. The founder's scenarios, handled

| Scenario | Today | Under v2 |
| --- | --- | --- |
| Patient stops sharing but wants to keep talking | Both sides silenced; the patient's messages go unread (G1, G2) | Grant ends, relationship stays; both can message |
| Clinician must get a discharge summary or late result to that patient | Impossible in-app | Sent as an offer; the patient chooses whether it enters the Vault |
| Patient ended everything; a late result arrives | Nothing possible | Added to the hospital's record, held, delivered if the patient reconnects (open question 3 for the urgent case) |
| Patient shares with Dr Obi, who works at Lagos Island | Personal share; hospital has no record (G4) | Patient connects to Lagos Island with Dr Obi named; Dr Obi is assigned; the hospital holds the record |
| Dr Obi also has a private practice | Indistinguishable from the above | A separate personal workspace, shown as a separate choice; never mixed |
| Share with three sister hospitals at once, for two weeks, meds and allergies only | Three separate acts, no expiry on institution shares | One act, three connections, one batch in the ledger, `expires_at` on each |
| Hospital cardiologist sets a BP alert; later leaves | Not possible (G5) | Rule owned by the hospital, follows the assignment when the author leaves |
| Relative abroad, not a user, needs a record | Only the claimable provider link, which becomes live clinical access for whoever opens it (G6) | A snapshot link: point in time, scoped, expiring, logged |
| Caregiver in Care Circle | Given a provider link, becomes a "clinician" | Person grant, read-only, no clinical capability |
| Clinician leaves the hospital | Leaver keeps some writes (offboarding G1) | Loses everything of the hospital's (sharing model §5); threads, rules and drafts stay with the hospital |
| Patient resumes sharing | Starts from scratch | Grant live again; interim additions delivered as a listed batch |

## 6. Migration of existing data

No stored consent is rewritten, on the precedent of the vocabulary work (§ "No
stored consent was rewritten" in the sharing model).

1. **Count first.** Claimed and unclaimed `provider_shares`; claimants with no
   clinician role; patients with more than one active share to the same
   clinician; clinicians who already own a single-member `practice`-type tenant;
   alert rules, guidance and threads per share. The numbers decide how much of
   steps 3–5 needs a patient-facing notice.
2. **Create personal workspaces** for every clinician who holds a claimed
   provider share or is onboarding as a clinician. An existing single-member
   practice is *not* adopted automatically — it may have been set up as a group
   practice in waiting (open question 4).
3. **Carry over.** For each claimed share whose claimant is a clinician, insert
   a `practice_shares` row to their personal workspace with the same
   permissions, expiry and state, carrying `carried_from_provider_share_id`, and
   write a `share_events` 'carried over' row. The original is marked superseded,
   not revoked and not deleted. By invariant 1 the audience is the same person.
4. **Backfill `practice_id`** on rows authored under a carried share: messages,
   guidance, alert rules, encounters with no practice. Authorship is untouched.
5. **Duplicates** carry the most recent active share; others are superseded. A
   duplicate with a *wider* scope is never silently dropped — the patient is
   asked (open question 6).
6. **Claims by non-clinicians** become person grants with no clinical
   capability. What they already wrote stays, attributed (open question 7).
7. **Unclaimed shares** stay as they are until claimed; a claim lands in the
   claimant's personal workspace, or as a person grant.
8. **Retire the old helpers** once no policy names them, and rewrite
   `independent_vs_institution.test.sql` as tenant isolation.

## 7. Phases

| Phase | What | Size | Closes |
| --- | --- | --- | --- |
| **0. Stop the void** | Patient `messages` INSERT requires a live connection (the only kind there is today); the composer says why it is closed; reword the share-ended notice; align §3 of the sharing model with the code on message history, or the code with it (decision 12). No model change | **S**, 2–3 days | G2, G3 |
| **1. Relationship apart from grant** | `relationship_status` and closing fields on both share tables; `has_care_relationship` (and its provider-share twin until phase 4); messages, guidance and document INSERT move to it; offered documents; "Stop sharing" and "End care" as two acts; held additions and the reconnection batch | **M**, about 1.5 weeks | G1, §3 amendment |
| **2. Hospital alert rules** | `practice_id` on rules; policies; service-role re-check in `check-vital-alerts`; workspace-aware `on_share_ended`; rules follow assignment when the author leaves (with offboarding phase 2) | **M**, about a week | G5 |
| **3. Workspaces for everyone** | `practices.kind` and invariant 1; personal workspaces at onboarding; connect-to-workspace with a requested clinician and assignment; invite links issued from a workspace; `practice_id` stamped by trigger on clinical writes; server-side workspace selection | **L**, 2–3 weeks | G4, G10 |
| **4. Carry-over** | §6 steps 1–8; claims gated on clinical membership; person grants for non-clinical claimants; cascades removed; tenant-isolation suite | **M–L**, 1.5–2 weeks | G6, G9, one pathway |
| **5. Shapes and one screen** | `expires_at` and discharge-bound grants for institutions; multi-workspace connect in one act (shared with groups plan phase 4); "Who can see my record" across workspaces, people and links; the snapshot link written into the ledger; server-side snapshots on every grant end | **M**, about 1.5 weeks | G7, G8 |

Offboarding phase 1 (a leaver can still write to the hospital's record) should
land before phase 3, since phase 3 makes more of the record the hospital's.
Every phase lands with SQL suites in the existing style, each assertion watched
failing first: a relationship without a grant reads nothing; a closed
relationship accepts no message from either side; an offered document is not in
the Vault until accepted; a personal workspace refuses a second clinical member;
a caregiver's claim grants no clinical write; a hospital rule stops firing the
moment the vitals grant ends.

## 8. What this does not change

No break-glass (P4). The hospital default posture and its disclosure. The
permission vocabulary and `share_grants`. The group layer never appears inside
a consent helper (groups plan §7). Family-member targeting and caregiver writes
stay paused.

## 9. Where to be careful

- **The relationship helper must never be ORed into a read.** The first policy
  that says "grant or relationship" on `vitals` turns "still my clinician" into
  "still reading my data". Assert it structurally, not only behaviourally.
- **Invariant 1 is the whole carry-over.** If a personal workspace can ever gain
  a second clinical member, every carried share silently widens to a colleague
  the patient never chose.
- **Workspace from the client is a suggestion.** The row's `practice_id` comes
  from the connection that admitted the write.
- **Hospital-readable threads change what a patient may have assumed was a
  private conversation.** The connect screen has to say so before phase 1 ships
  for hospitals, and existing threads need a decision (open question 8).
- **An offer is outbound only.** Accepting a document into the Vault grants the
  sender nothing.

## 10. Open questions for the founder

1. **May a workspace end its side of the care relationship** ("no longer under
   our care"), shown as such to the patient, or is closing always the patient's?
2. **Offered or auto-filed.** While a patient is not sharing, should clinician
   documents arrive as an offer (recommended, and what the §3 amendment implies),
   or file automatically as they do while sharing?
3. **An urgent result after the patient closed the relationship.** In-app,
   nothing can reach them. Is a single content-free notice ("Lagos Island
   Hospital has something important for you — contact them") allowed through a
   closed relationship, or is that the institution's duty outside the platform?
4. **Personal workspaces with staff.** The Solo and Pro tiers include team
   seats. May a personal workspace have non-clinical staff (front desk) without
   breaking what a patient agreed to, and how does a personal practice become a
   group practice — does every patient reconnect?
5. **Hospital-only clinicians.** Should a hospital be able to require that its
   clinicians accept new patients only through it, or is that left to
   employment contracts?
6. **Carry-over notice.** Are patients told when their private shares move into
   a personal workspace (nothing about who can see changes), and asked when
   duplicates with different scopes are reconciled?
7. **Non-clinician claimants.** Downgrade existing caregiver and pharmacist
   claims to person grants, and tell the patient?
8. **Hospital team reading threads** (offboarding decision 1, now load-bearing):
   yes going forward with disclosure; and for threads that exist today?
9. **Revenue attribution.** Should a personal workspace be eligible to be
   `onboarded_via_practice_id`, given first-wins attribution?
10. **Billing a clinician with both.** Solo subscription on the personal
    workspace only when it has patients, or always?
11. **Episode-bound grants.** Is the hospital's discharge act the right trigger,
    with what grace period, and does the patient confirm?
12. **Message history after a relationship ends.** The canonical doc says both
    sides keep read-only access; the code says 90 days for a private clinician
    and nothing for an institution clinician. Which is the rule?
13. **The snapshot link.** Maximum expiry, whether a passcode is required, and
    whether a patient may send one to a clinician (who should be connecting
    instead).
