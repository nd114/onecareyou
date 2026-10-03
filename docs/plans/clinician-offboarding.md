# Clinician Offboarding — when someone leaves a practice or hospital

> Rooted in [OneCare's foundational pillars](../onecare-foundations.md) — pillar 6 (the institution is
> the custodian of what its staff create) and pillar 10 (closable accounts).
>
> **Status — 29 September 2026.** Phases 1–3 are built (`20261010030000_offboarding_closes_the_door`,
> `20261010070000_offboarding_handover`; suites `offboarding_closes_the_door.test.sql` and
> `offboarding_handover.test.sql`). §3 below describes what happens **now**. The founder's decisions
> are in §7. **What remains is lower priority** than the sharing and deletion work, and is listed at
> the end of §7.
>
> In one paragraph: the hospital ends a membership without needing anything from the leaver; the
> leaver loses everything at that hospital, including what they wrote there; unsigned drafts and
> unfiled dictations freeze and are routed to the people responsible; assignments end and the
> patient goes on a needs-cover list; hospital threads are read and continued by the patient's
> current care team; the patient is told once, when someone takes over; and nothing is deleted. A
> clinician's own patients, in their private-practice account, are never touched.
>
> Earlier banners (Phase 1 done, Phases 2–3 done, "superseded in part") are folded into this one.
> §4–§6 are the September assessment and design, kept for their reasoning; where they differ from
> §3 and §7, §3 and §7 stand.

Companion to `docs/sharing-access-consent-model.md` (§5, canonical),
`docs/independent-clinicians-and-hospitals.md`, `docs/enterprise-hospital-tenancy-plan.md`,
`docs/record-corrections-plan.md` (edge case 3) and `docs/plans/sharing-infrastructure-v2.md`.

---

## 1. The answer is already in the founding structures

Nobody wrote an offboarding design, but the documents that set up the platform already decide
almost all of it. Stated together:

1. **Two pathways that never merge.** `provider_shares` is the patient inviting a person;
   `practice_shares` plus an active `practice_members` row is the patient trusting an institution
   that assigns a person. Leaving a job ends the second and cannot touch the first.
   (`independent-clinicians-and-hospitals.md` §2)
2. **Consent is to the institution; the clinician's access is delegated.** "The patient's
   relationship remains with the hospital, not with whichever clinician currently holds the case."
   A departure is therefore a reassignment inside a relationship that continues, not the end of a
   relationship. (Sharing model §2B; tenancy plan §1: "reassignment must not require re-consent".)
3. **Nothing is deleted; ending a relationship changes access going forward.** (Sharing model §1.2,
   conventions rule 1.)
4. **The clinician's account of care is theirs and is never reattributed.** Entries stay attributed
   to the author, "with the practice as the responsible party". (Record corrections plan, edge case
   3; conventions rule 2.)
5. **The institution is the custodian of the records its staff create** (decided 28 September 2026,
   replacing the earlier "keep a read-only view of what you filed"). A leaver loses all access to
   the institution's records, including their own; legal needs go through the institution.
6. **Absence is visible.** A patient whose doctor has gone should see that, in place, not find a
   thread that silently stops answering. (Rule 3.)
7. **One account per place of work** (decided 29 September 2026, sharing model §8.1). Hospital work
   is done in an account on the hospital's email domain and private practice in a separate account,
   so leaving a hospital ends everything in that account's hospital context and nothing else.

## 2. How someone leaves, now

**Three removal paths, all intentional** (the founder agrees). Each suits a different screen and
manager, and all three reach the same enforced act: a trigger on `practice_members`
(`guard_practice_member_standing`) refuses any direct client change to status, role or view-all,
holds the owner rules, stamps `ended_at`, `ended_by` and `end_reason`, and a second trigger
(`record_practice_membership_change`) writes the `practice_membership_events` ledger and an audit
row and removes department rows, recording what was held. Memberships cannot be deleted by any
client.

| Path | Who | Where | Function |
| --- | --- | --- | --- |
| **Remove** | Owner or admin | Team list (`PracticeTeamSection` → `usePractice`) | `end_practice_membership` |
| **Archive** | Owner or admin | Hospital admin (`PracticeAdmin` → `usePracticeAdmin`); restoring starts a new period through `set_practice_affiliation_status` | `end_practice_membership` |
| **Revoke affiliation** | Owner or admin | Staff allowlist (`ClinicianAllowlistCard` → `useClinicianAllowlist`) | `set_practice_affiliation_status` |
| **Leave this practice** | The member themselves | Team list, "Leave this practice" (`useOffboarding`) | `leave_practice` |

**"Leaving voluntarily" means the member removing themselves** with "Leave this practice" — for
example a clinician who joined a practice and resigns. It is recorded as `end_reason = 'left'`, as
distinct from `ended_by_practice` when the hospital removes someone. A manager cannot reinstate a
person who left of their own accord; they invite them again and the person accepts.

**The hospital never needs the leaver's input.** Removal takes effect at once, whatever the leaver
had open, and nothing waits for a cooperative handover: open work is frozen or flagged and routed to
the people responsible (§3). Before confirming, the manager sees what the removal will leave behind
(`offboarding_impact`).

**Owners.** Only an active owner can end or demote an owner, and a practice always keeps one: the
only owner is told to make a co-owner first ("Make co-owner").

**Changing role** goes through `change_practice_member_access`. Moving from a clinical to a
non-clinical role clears view-all and ends assignments; clinician messaging and addenda are gated on
a clinical role. Freezing the person's unfinished clinical work on a role change, as departure does,
is **being built**.

**Closing an account** does not exist yet, for clinicians or patients; it is on the roadmap (§5.7
states the principle, which stands).

## 3. What happens to each thing, now

Current behaviour after `20261010030000` and `20261010070000`, with the founder's decisions of 28–29
September. "Suite" means an assertion in `offboarding_closes_the_door.test.sql` or
`offboarding_handover.test.sql`; "from definitions" means read from the migration, not exercised.
The suites were not re-run for this documentation pass.

| Item | Leaver, after leaving | The hospital | The patient | Basis |
| --- | --- | --- | --- | --- |
| Hospital patients' vitals, medicines, documents | Lost at once | Kept | Nothing changes | Suite |
| Open assignments | Closed | Patient goes on the **needs-cover** list in the Coverage tab (`practice_handover_queue`) until someone is assigned | Told once, when a new clinician is assigned, who has taken over (`patient_notices`) | Suite |
| Department roles, including lead | Removed on every path; the ledger records what was held; a restore does not revive them | Vacancy shows as "departments without a lead" | — | Suite |
| Encounters written for the hospital | **No read, no write** | Kept, attributed to the leaver | Shared notes stay visible | Suite |
| Unsigned drafts | Frozen (`author_departed_at`); never signable by anyone later, the author included | Routed to owners, admins and the patient's department lead, who sign off (an addendum under their own name; authorship unchanged), mark entered in error, or archive (`resolve_departed_draft`) | — | Suite |
| Addenda to their notes | Cannot add | Can add, under their own name | — | Suite |
| Team internal notes | No read, no rewrite, no delete | Kept | Not visible to patients | Suite |
| Voice memos (`voice_memos`) | Unassigned and unfiled memos are the leaver's own working material and go with their account; no practice sees them. Filed memos are already part of a signed or draft encounter, which follows the encounter rows above | Not visible | Not visible | From definitions |
| Unfiled dictations | Frozen | Routed as drafts are; signing off starts a draft note under the lead's own name | — | Suite |
| Managed records filed for the hospital | No read, no edit, no delete | Kept | — | Suite |
| Hospital message threads (`messages.practice_id`) | Lost | The patient's current assigned or view-all clinical staff read and continue them | Can write whenever someone is covering; otherwise the composer says the thread is waiting, and reopens when the hospital assigns someone (`20261010090000`) | Suite |
| Tasks | Lost | Flagged on the needs-cover list; managers reassign or close | — | Suite |
| Future appointments | Lost | Flagged on the needs-cover list | Not yet told at departure (see remaining items) | Suite |
| Pending medication proposals | Lost | Flagged; a manager may withdraw them (`withdraw_change_proposal`) | Stays pending until answered or withdrawn | Suite |
| Guidance and alert rules | Private-share only today, so unaffected | — | — | From definitions |
| EHR connections | **Still leave with the clinician** | Lose the link | — | Schema — remaining item |
| The departure itself | — | Ledger, audit row, `ended_at` / `ended_by` / `end_reason`, answerable as "who removed them, when, why" | — | Suite |
| Their own private patients (`provider_shares`, solo managed records) | **Unchanged** | Never had them | Unchanged | Suite, and `independent_vs_institution.test.sql` |

Two further cases:

- **Moved to billing (or any non-clinical role).** View-all is cleared, assignments close, and the
  member **cannot message the patient as a clinician** — confirmed in the Phase 1 suite, including
  when a manager later grants billing the wide view again (`offboarding_closes_the_door.test.sql`,
  the "billing cannot message the patient as a clinician" assertions). Their unsigned drafts are
  not yet frozen (being built). **One gap found in this pass, from definitions:** the clinician
  policy for filing a document into a patient's Vault (`20260820100000`, row and storage) still
  uses the role-blind `institution_has_patient_access`, so a non-clinical member holding view-all or
  an assignment could file a "From your clinician" document. Recorded as G11 in
  `sharing-infrastructure-v2.md`, to be closed in its phase 1.
- **The last owner** cannot leave or be ended; the functions and the interface say to appoint a
  co-owner first.

## 4. Gaps (September assessment)

**Status, 29 September 2026.** Closed: G1, G3, G4, G8 and G11 (phase 1); G5, and G6 for unsigned
drafts and dictations (phase 2); G2 and G10 (phase 3, with `20261010090000` closing the patient's
composer when nobody is covering). Superseded: G7 — a leaver now keeps no read of hospital records
at all. Still open, lower priority: G6 for signed notes (correction on behalf of the practice), G9
(EHR connections) and G12 (account closure and the foreign keys). The table below is the assessment
as it was written.

Severity is about harm to a patient or to the legal record, not effort.

| # | Gap | Severity | Principle it breaks |
| --- | --- | --- | --- |
| G1 | A leaver can still **write** to the hospital's record: edit and sign drafts, add addenda, rewrite or delete team notes, edit or delete unclaimed managed records | **High** | Access ends on departure; nothing deleted; the hospital keeps its records |
| G2 | A patient can keep **messaging a departed clinician** and nobody reads it; the hospital could never read the thread at all | **High** (clinical safety) | Absence is visible; consent is to the institution |
| G3 | **Departure is unaudited**, and three paths write two statuses with different side effects | **High** | Nothing deleted; who did what must be answerable |
| G4 | The **last-owner** rule and **no-hard-delete** rule live only in one RPC; the row allows both to be walked round | **High** | Enforced at the row, not the client |
| G5 | **Open work does not hand over**: tasks, future appointments, unfiled dictations, pending proposals, lead roles; patients become unassigned silently | **Medium** | Reassignment without re-consent (tenancy §1) |
| G6 | **Nobody at the hospital can correct a leaver's note**, while the leaver still can | **Medium** | Practice is the responsible party (corrections plan) |
| G7 | The leaver **loses read of messages they sent** while keeping read of encounters — the "keep what you filed, read-only" decision is honoured in one table and not the other | **Medium** | Keep what you filed, read-only |
| G8 | **Moving to a non-clinical role** leaves view-all set and messaging open | **Medium** | Non-clinical staff do not act clinically (P0-3) |
| G9 | **EHR connections** leave with the clinician | **Medium** | Already named in `ehr-integration-plan.md` Phase 1 |
| G10 | **Patients are not told**; the care team changes under them | **Low–Medium** | Absence is visible |
| G11 | **Restoring a member revives lead roles** silently (direct path), while the RPC path deletes the lead history | **Low** | One vocabulary; nothing deleted |
| G12 | **Account closure** is promised in the Terms and does not exist; `provider_shares.clinician_user_id` references `auth.users` without `ON DELETE`, so an ops-side deletion fails for any clinician who ever had a share, and `practice_members.user_id` has no foreign key and would orphan. Sharing model §5 also promises "managed-record data is exported to the clinician on departure", which has no code and, for hospital records, contradicts the retention decision | **Low** now, a legal-copy question | A promise in the UI must be a capability |

## 5. Recommended design (September; built with the simplifications in §6 and §7)

What was built differs from this design in three places, and the built version stands: there are
still three removal paths, deliberately, all converging on the same row rules (§2); handover is an
impact preview plus a needs-cover list rather than a disposition required for every item (the
leaver's cooperation is never assumed); and §5.3 is superseded — a leaver keeps nothing of the
hospital's.

### 5.1 One act, enforced at the row

Leaving is a single operation, `end_practice_membership(practice, user, reason,
handover)`, SECURITY DEFINER. It replaces the three paths and is also what
`leave_practice(practice, reason)` calls for a voluntary exit.

- **The row refuses every other route.** A BEFORE UPDATE trigger on
  `practice_members` rejects a change to `status`, `role` or
  `can_view_all_patients` made directly by `authenticated`, the same pattern as
  `guard_practice_member_identity`. The DELETE policy goes: memberships are
  never deleted.
- **The last-owner rule moves into that trigger**, so it holds on any path: a
  tenant always has at least one active owner, and only an owner can end or
  demote an owner. A platform admin remains the escape hatch through the
  existing console.
- **One vocabulary.** No new status values. `revoked` means ended; `archived` is
  read as an alias and no stored row is rewritten, exactly as `meds` and
  `profile` were handled in the sharing vocabulary. A CHECK constraint on
  `status` is added. Why it ended goes in a new `end_reason` (`left`, `ended_by_practice`,
  `role_change`, `contract_ended`), with `ended_at` and `ended_by`.
- **A ledger, not a new concept.** `practice_membership_events`, append-only,
  mirroring `share_events`: joined, role changed, ended, rejoined, each with
  actor and reason. Also written to `hipaa_audit_logs` and shown in the tenant's
  `practice_audit_log`. This answers "who removed them, when, why", which today
  is unanswerable.
- **Department roles close rather than vanish.** `practice_department_members`
  gains `ended_at`; the lead helpers ignore ended rows; nothing is deleted and a
  restore does not revive a lead role.

### 5.2 Handover before the door closes

The hospital's relationship with the patient continues, so the open work must
land with someone. The offboarding dialog lists, and the RPC requires a
disposition for:

- **Each open assignment:** reassign to a named clinician or department, or
  mark as "needs cover". New assignment rows are written with `assigned_by` and
  a handover note; the old ones are closed, not edited.
- **Open tasks:** reassign or close with a reason.
- **Future appointments:** reassign or cancel (the patient is told either way).
- **Unsigned drafts:** the leaver signs them before leaving, or they freeze as
  "unsigned draft, author has left" — readable by the hospital, never signed
  later, never deleted.
- **Unfiled dictations of hospital patients:** filed by the leaver before
  leaving, or frozen and made visible to the hospital's managers. This needs
  `practice_id` on `clinician_dictations` so a hospital-context dictation can be
  told apart from a private one.
- **Pending proposals:** withdrawn, or left open with the patient told the
  proposer has left.
- **Department lead roles:** a successor is appointed or the role is left vacant
  and shown as vacant.

A voluntary leaver cannot be forced to do this, so for `leave_practice` every
open item falls into a "needs cover" queue. The **Coverage tab** already
exists to show who is falling through the gaps; the queue belongs there rather
than on a new screen.

### 5.3 What the leaver keeps — superseded

> **Superseded (28 September 2026).** A leaver keeps nothing of the hospital's, including what they
> wrote there; legal needs go through the hospital (sharing model §5). Only the "no writes" bullet
> below survives, and it is built. The rest is kept as the reasoning that was replaced.

Read-only access to what they authored in the hospital's name, for as long as
the record exists, and nothing else:

- Their encounters and their own addenda, their internal notes, their
  dictations, and the message threads they took part in **up to the day they
  left**. Messages need an institutional counterpart to the existing
  `clinician_had_patient_access_at(patient, created_at)`: "was this person an
  active clinical member with access to this patient when the message was
  sent". That fixes G7 in the direction the decision points.
- **No writes.** Every author-only write policy on a hospital-context row
  (`encounters` UPDATE, `encounter_addenda` INSERT, `internal_notes`
  UPDATE, `clinician_patient_records` author UPDATE and DELETE where
  `practice_id` is set, `clinician_guidance` UPDATE, `clinician_dictations`
  UPDATE) additionally requires current access through one of the two
  pathways. Private-context rows are unaffected, because for them the pathway
  is the provider share, which the leaver still holds.
- **Not** tasks, appointments or managed records they did not author, which
  are the hospital's operational data.
- Whether the patient's **name** still resolves in the leaver's read-only view
  is a decision (§7); `get_patient_identity` requires a live relationship, so
  today it would probably not. Not probed.

### 5.4 What the hospital keeps

Everything created on its behalf, attributed to the person who created it:

- Encounters, addenda and team internal notes, as today, but no longer
  deletable by anyone. An internal note an author wants gone is archived and
  leaves a remnant ("note withdrawn by its author on …"), the same as a
  withdrawn document.
- **Hospital message threads.** `messages` gains `practice_id`, set by trigger
  when the sender's basis is institutional. The institution's clinical team can
  then read the institution's threads, which is within what the patient
  consented to (§2B: consent is to the institution, the clinician's access is
  delegated). Private-share threads stay private to the two people in them.
  This is the change that lets the next clinician pick up the conversation.
- **The right to correct.** A clinical lead or manager can mark a departed
  author's note entered-in-error or add an addendum "on behalf of the
  practice". The note stays attributed to its author; the correction is
  attributed to whoever made it. That is the corrections plan's "practice as
  responsible party" made real.
- EHR connections owned by the tenant, per `ehr-integration-plan.md` Phase 1.

### 5.5 What the patient sees

- A notice, once: "Dr X is no longer at Hospital Y. Your care there continues
  with Dr Z" (or "with the Cardiology team"). It is sent when the assignment
  changes hands, not when the membership row changes, so a patient is not told
  about staff who never treated them.
- In the thread, a line where the departure happened, and the composer
  routes forward to the new assignee or the department. The patient cannot keep
  writing into a thread nobody reads (G2). Nothing the leaver wrote to them
  disappears.
- A care record snapshot of the thread filed to the Vault, reusing the
  snapshot already generated on disconnection rather than building a new one.
- Nothing at all for private patients of the leaver.

### 5.6 Changing role, and coming back

- **Moving to a non-clinical role** is `end_reason = 'role_change'` for
  the clinical side only: assignments close (as now), `can_view_all_patients`
  is cleared, and the policies that still use the ungated
  `institution_has_patient_access` for clinical acts (`messages` INSERT and
  read-status UPDATE, `fhir_appointments`, `encounter_addenda` INSERT) move to
  `institution_has_clinical_access`.
- **Re-hire** is a new period on the same row (the unique key is
  `(practice_id, user_id)`), recorded as `rejoined` in the ledger. Nothing
  reopens automatically: no assignments, no lead roles, no view-all. Their
  earlier authored history is readable again under the normal rules because
  they are a member again, not because anything was restored.
  `request_practice_affiliation` already returns the existing status rather
  than re-admitting, so an email-domain match cannot rehire someone the
  hospital ended; that must stay true once DELETE is gone.

### 5.7 Account closure

*This principle stands (29 September 2026), for clinicians and patients alike; "Close my account" is
on the roadmap.*

A clinician who authored records cannot be deleted without breaking
non-repudiation. Closure should disable sign-in and keep the name used for
attribution. That is a separate piece of work; what belongs here is fixing the
foreign keys so the database does not decide it by accident, and either
building closure or taking the promise out of the Terms. Sharing model §5's
"exported to the clinician on departure" should be narrowed to the clinician's
own solo managed records (`practice_id IS NULL`); hospital records stay with the
hospital.

## 6. Phases

| Phase | What | Size | Closes |
| --- | --- | --- | --- |
| **1. Close the holes at the row** (done) | `end_practice_membership` and `leave_practice`; trigger blocking direct status, role and view-all changes and enforcing the owner invariant; drop the DELETE policy; `ended_at`/`ended_by`/`end_reason`, membership ledger and audit row; author write policies need current access for hospital-context rows; clear view-all on role change and gate clinical acts on `institution_has_clinical_access`; switch `removeMember` and `archiveMember` to the RPC. Suite `offboarding_closes_the_door.test.sql`, converted from this assessment's probe. Not done: the status CHECK constraint, and `ended_at` on department rows (they are removed; the ledger keeps what was held) | **S–M**, 2–3 days | G1, G3, G4, G8, G11 |
| **2. Handover** (done, simplified) | Impact preview in the confirmation instead of required dispositions; assignments end as before and the patient goes on the "needs cover" list in the Coverage tab, with tasks, future appointments and pending proposals (reassign or withdraw from there); draft and dictation freeze with routing to leads and `resolve_departed_draft`; `practice_id` on dictations, internal notes, proposals and messages. Lead vacancy shows through the existing "departments without a lead" finding | **M** | G5, G6 |
| **3. The patient side** (done, partly) | `practice_id` on messages and the institutional thread read; patient notice on handover (`patient_notices`). Not done: a departure line in the thread and composer forward routing; the Vault snapshot on handover | **M** | G2, G10 |
| **4. The long tail** (lower priority) | Freeze clinical work on a move to a non-clinical role (being built); correction on behalf of the practice for signed notes; EHR tenant ownership (with the EHR plan); account closure and the foreign keys. The leaver's "former workplaces" view is dropped (§7, decision 4) | **M** across items; each independent | G6, G9, G12 |

Phase 1 does not depend on any decision below and closes the only gaps where
a person who has left can still change the record.

## 7. Decisions (taken September 2026)

1. **Hospital message threads — yes, after the clinician leaves.** Threads that
   arose from the hospital relationship carry `practice_id` (set by the server;
   back-filled only where the author never had a private share with the patient
   and exactly one practice fits). Once the thread's clinician has left or
   stopped being clinical, the patient's currently assigned or view-all
   clinical staff at that practice read it and continue the conversation.
   While the clinician is there, the thread stays theirs. Private-share threads
   are unchanged. *Still open:* the patient-facing copy on the connect screen
   that says hospital conversations belong to the hospital.
2. **Unsigned drafts — freeze, route, decide.** Not deleted (P2/P3), not
   editable by anyone, marked "unsigned — author departed", routed to owners,
   admins and the patient's department lead. They sign off (an addendum under
   their own name; the note stays the author's), mark entered in error, or
   archive. Deletion only if a later retention policy allows it; none is built.
3. **Unfiled dictations — the same.** Signing off a dictation starts a draft
   note under the lead's own name from it, which they review and sign.
4. **The leaver's read-only view — there is none for hospital records.** The
   founder decided a leaver loses all access to the hospital's patients and
   records, including what they wrote (legal needs go through the hospital).
   This supersedes §1.5 and §5.3 for practice records; solo records
   (pathway A) keep the author's read.
5. **Notice timing — on handover.** Once, when a new clinician is assigned after
   a departure, naming who has taken over and the department. Not at departure.
6. **Owner leaving — appoint a successor first.** The only owner cannot leave or
   be ended; the functions and the UI say to make a co-owner first, and owners
   now have a "Make co-owner" action.

Decided 29 September 2026:

7. **A leaver loses access to everything at that hospital, period.** Hospital work is done in a
   separate account on the hospital's email domain (sharing model §8.1), so there is nothing of the
   hospital's for the leaver to keep and nothing of their private practice for the hospital to take.
8. **The hospital shuts access off with no need for the leaver's input**, and everything the leaver
   had is frozen or flagged and routed to their department lead, owners and admins by default. A
   cooperative handover is never assumed.
9. **Moving to a non-clinical role freezes clinical work too**, as departure does. Being built.
10. **The three removal paths are intentional** (§2). "Leaving voluntarily" is the member's own
    "Leave this practice", distinct from the hospital removing them.
11. **Offboarding beyond what is built is lower priority** than sharing v2 and the deletion revisit.

Remaining, lower priority:

- Freeze unsigned drafts and unfiled dictations on a move to a non-clinical role (decision 9;
  being built).
- A departure line in the thread, and forward routing of the composer to the new assignee (today
  the thread waits, and says so, until someone covers).
- A care-record snapshot to the patient's Vault on handover.
- Correction of a departed author's **signed** note on behalf of the practice (frozen drafts are
  already resolvable).
- EHR connections owned by the tenant rather than the clinician (with `ehr-integration-plan.md`).
- Account closure and the foreign keys (§5.7; roadmap "Close my account").
- The status CHECK constraint on `practice_members`, and `ended_at` on department rows.
- Tasks and future appointments are flagged on the needs-cover list, not assigned to anyone
  automatically; a named default owner for them (the department lead) is not built.
- G11 in `sharing-infrastructure-v2.md`: a non-clinical member with view-all or an assignment can
  still file a "From your clinician" document into a patient's Vault (from definitions).

Left open by the September round, for a later decision:

- A leaver who *also* holds a private share with a hospital patient still reads
  that patient's encounters through the private share, as any privately shared
  clinician does. That is the patient's own consent and was left alone. Under the
  one-account-per-place-of-work model this arises only when a patient invited the
  clinician's hospital account personally.
- Records written before this change whose context was ambiguous (the author
  also had a private share, or belonged to several practices the patient shared
  with) stay unstamped and keep the old reading.
- A dictation recorded with no patient chosen has no practice, so it stays its
  author's.
- Frozen drafts of a patient who has since disconnected cannot be resolved by
  anyone (no break-glass), so they stay frozen.
- Moving to a non-clinical role does not freeze drafts; only departure does.
  *(Decided 29 September: it will — decision 9.)*
- A department lead who is not on the patient's care can mark a draft entered
  in error or archive it, but must be assigned before signing it off.

## 8. What was checked, and how

- Founding documents: sharing model, independent clinicians, tenancy plan,
  withdrawal and derived data, record corrections, admin guide, roadmap, audit
  pass 8.
- Migrations: `20260815054210` (affiliation and the RPC), `20261009030000`
  (the departure trigger), and the live definitions of every helper named here,
  read from the replayed database rather than from migration text.
- Behaviour: three rolled-back probes against `onecare_test_offb` after a full
  replay (69 suites passing), acting as each party through
  `request.jwt.claim.sub` and `SET LOCAL ROLE authenticated`, the same way the
  SQL suites do. Rows marked "from policy" in §3 were read, not exercised.
