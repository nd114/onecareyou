# Clinician Offboarding — when someone leaves a practice or hospital

> **Decisions taken and Phases 2–3 done — September 2026** (migration
> `20261010070000_offboarding_handover`, suite `offboarding_handover.test.sql`).
> The founder decided the §7 questions; see §7 for each answer. In short: a
> leaver loses all access to the hospital's patients and records, including
> what they wrote there (this reverses §1.5 and §5.3 below for hospital
> records; solo records are unchanged). Records now carry the practice they
> were written for, stamped by the server. Unsigned drafts and unfiled
> dictations freeze on departure and are routed to owners, admins and the
> patient's department lead, who sign off (addendum, authorship kept), mark
> entered in error, or archive — nothing is deleted. Admins see an impact
> preview (`offboarding_impact`) before ending a membership; open work lands on
> a needs-cover list in the Coverage tab (`practice_handover_queue`). Hospital
> threads belong to the hospital and are read and continued by the patient's
> current care team once the clinician has left. The patient is told once, on
> handover. The only owner is told to appoint a co-owner. Still open: Phase 4
> (EHR tenant ownership, account closure and the foreign keys), and the items
> listed at the end of §7.
>
> **Phase 1 done — September 2026** (migration `20261010030000`, suite
> `offboarding_closes_the_door.test.sql`). A leaver no longer writes to the
> hospital's record; membership ends only through `end_practice_membership` /
> `leave_practice` (role and view-all through `change_practice_member_access`),
> with owner rules in the row, `ended_at`/`ended_by`/`end_reason`, the
> `practice_membership_events` ledger and an audit row on every change;
> department rows end on every path; memberships cannot be deleted; moving to a
> non-clinical role clears view-all and clinician messaging is role-gated.
> Not done from the Phase 1 row: the status CHECK constraint (a fixture and
> possibly live rows use other values) and `ended_at` on department rows (they
> are removed, and the ledger entry keeps what was held). Phases 2–4 and the §7
> decisions are open.
>
> **Assessed September 2026.** What happens today when a
> clinician or staff member leaves a tenant, checked against the replayed
> database, and a design that follows from the founding documents rather than
> adding a new concept. Restart when: the decisions in §7 are taken. Phase 1 is
> small and closes holes that exist now; it should not wait for the rest.
>
> This document describes an intention, not current work.
>
> **Superseded in part, 28 September 2026.** The founder decided that a leaver
> loses *all* access to the institution's patients and records, including what
> they wrote there; legal access goes through the institution. Unsigned drafts
> and dictations are frozen and routed to the clinical lead, never deleted. So
> §1 item 5, §5.3 ("What the leaver keeps"), the G7 direction and decision 4 in
> §7 no longer stand, and decisions 2 and 3 are answered (freeze). See
> `docs/sharing-access-consent-model.md` §5.

Companion to `docs/sharing-access-consent-model.md`,
`docs/independent-clinicians-and-hospitals.md`,
`docs/enterprise-hospital-tenancy-plan.md` and `docs/record-corrections-plan.md`
(edge case 3, "a clinician leaves the practice").

---

## 1. The answer is already in the founding structures

Nobody wrote an offboarding design, but the documents that set up the platform
already decide almost all of it. Stated together:

1. **Two pathways that never merge.** `provider_shares` is the patient inviting
   a person; `practice_shares` plus an active `practice_members` row is the
   patient trusting an institution that assigns a person. Leaving a job ends the
   second and cannot touch the first. (`independent-clinicians-and-hospitals.md` §2)
2. **Consent is to the institution; the clinician's access is delegated.** "The
   patient's relationship remains with the hospital, not with whichever clinician
   currently holds the case." A departure is therefore a reassignment inside a
   relationship that continues, not the end of a relationship. (Sharing model §2B;
   tenancy plan §1: "reassignment must not require re-consent".)
3. **Nothing is deleted; ending a relationship changes access going forward.**
   (Sharing model §1.2, conventions rule 1.)
4. **The clinician's account of care is theirs and is never reattributed.**
   Entries stay attributed to the author, "with the practice as the responsible
   party". (Record corrections plan, edge case 3; conventions rule 2.)
5. **Decided alongside this work:** what a person filed stays readable by them,
   read-only; the hospital retains records created while the patient was theirs;
   authorship is never reattributed; like email, what was sent cannot be unsent,
   only removed from view by its owner.
6. **Absence is visible.** A patient whose doctor has gone should see that, in
   place, not find a thread that silently stops answering. (Rule 3.)

Put those together and the shape of offboarding is fixed: **the leaver loses
every write and every forward read at once, keeps a read-only view of what they
wrote, the hospital keeps everything created on its behalf and hands the open
work to someone else, the patient is told, and none of it touches the leaver's
private patients.** What follows is how far the code is from that.

## 2. How someone leaves today

There are three ways a membership ends in the product, and they do not agree.

| Path | Where | What it writes | Last-owner rule | Department roles | Assignments |
| --- | --- | --- | --- | --- | --- |
| **Remove** (team list) | `usePractice.removeMember` → `PracticeTeamSection` | Direct `UPDATE status = 'revoked'` | Not checked | Row left in place, dormant | Closed by trigger |
| **Archive** (hospital admin) | `usePracticeAdmin.archiveMember` → `PracticeAdmin` | Direct `UPDATE status = 'archived'` | Not checked | Row left in place, dormant | Closed by trigger |
| **Offboard** (affiliation) | `set_practice_affiliation_status` via `useClinicianAllowlist` | RPC, `status = 'revoked'` | Enforced | Rows **hard-deleted** | Closed by RPC and trigger |

The `ClinicianAllowlistCard` tells managers to "use the team list to offboard",
which sends them to the path that checks the least.

Paths that do not exist:

- **Leaving voluntarily.** No screen. The only mechanism is the `practice_members`
  DELETE policy, `can_manage_practice(practice_id) OR user_id = auth.uid()`,
  which hard-deletes the row.
- **Moving to a non-clinical role** is a direct `UPDATE role` from the team list.
- **Closing a clinician account.** No feature, although the Terms of Service
  (`TermsOfService.tsx` ~line 245) mention "the account deletion feature in
  settings".

What is right today, and should be kept:

- **Forward access ends immediately.** Every access helper requires
  `status = 'active'`; `institution_has_patient_access` answered false for the
  leaver the moment their row changed.
- **Assignments close on every path.** `trg_end_assignments_of_departed_member`
  (migration `20261009030000`) end-dates them when status leaves `active` or the
  role stops being clinical. Closed, not deleted.
- **Private patients are untouched.** `clinician_has_patient_access` still
  answered true for the leaver's own `provider_shares` patient after they were
  removed, as `independent_vs_institution.test.sql` asserts.
- **The hospital keeps the leaver's encounters.** A colleague with view-all still
  read both of the leaver's encounters afterwards, attributed to the leaver.

## 3. What happens to each thing, today

Checked on the replayed database (`onecare_test_offb`, 69 suites passing) with a
rolled-back probe: an owner, an admin, a departing provider who was assigned to a
hospital patient and led a department, a colleague with view-all, the hospital
patient, and one private patient of the leaver. The admin removed the leaver the
way the team list does. "Confirmed" means the probe observed it; "from policy"
means read from `pg_policies` but not exercised.

| Item | Leaver, after leaving | Hospital, after | Patient sees | Basis |
| --- | --- | --- | --- | --- |
| Hospital patients' vitals, meds, documents | Lost | Kept | Nothing changes | Confirmed |
| Open assignments | Closed | Patient left unassigned; no handover target | Nothing | Confirmed |
| Department lead | Dormant row kept (direct path) or row deleted (RPC path); restoring the member **revives the lead role** but not assignments | No prompt to appoint a new lead | — | Confirmed (row count); revival from `is_department_lead` |
| Their encounters | Still readable (author arm). **Unsigned draft still editable, and could be signed after leaving** | Readable, attributed | Shared notes stay visible | Confirmed |
| Addenda to their signed notes | **Can still add them after leaving** | Readable | — | Confirmed |
| Their internal notes (team) | **Can still rewrite and hard-delete them after leaving** | Readable until the leaver deletes them | Not visible to patients | Confirmed |
| Hospital managed records they filed (`clinician_patient_records`, unclaimed, `practice_id` set) | **Still readable, editable and hard-deletable** | Readable until the leaver deletes them | — | Confirmed |
| Messages they exchanged with a hospital patient | **Lost** — the policy asks for current institution access, not access at the time | **Never readable by colleagues, before or after** — threads have no `practice_id` | Thread stays open; patient **can still send**, nobody reads it, no marker | Confirmed |
| Sending new messages | Blocked | — | — | Confirmed |
| Tasks assigned to them (`practice_tasks`) | Still visible to them, with patient id and title | Managers see them; nothing reassigns | — | Confirmed |
| Future appointments (`fhir_appointments.clinician_user_id`) | Still readable (own-appointment arm) | Remain booked with the leaver | Appointment with a departed clinician | From policy |
| Unfiled dictations of hospital patients | Still readable and editable; filing now fails | **Never visible to the hospital** | — | Confirmed |
| Pending medication proposals | Still readable | — | Can still accept a proposal from someone who has left | From policy |
| Guidance they issued | Editable indefinitely (author UPDATE, no lock) | — | Visible | From policy; guidance can only be issued on a private share today |
| Alert rules | Private-share only; keep working for private patients | — | — | From policy |
| EHR connections | Belong to the clinician; leave with them | Lose the link | — | Schema (`ehr_connections` has no `practice_id`) |
| Audit of the departure | **None** — no `hipaa_audit_logs` row; `practice_members` has no ended-at, ended-by or reason; `updated_at` is overwritten on restore | Cannot answer "who removed them, when, why" | — | Confirmed |
| Correcting the leaver's notes | Leaver can still mark them entered-in-error | **Nobody at the hospital can** — encounter UPDATE is author-only | — | From policy |
| Their private (`provider_shares`) patients | Unchanged | Never had them | Unchanged | Confirmed |

Two further paths, probed separately:

- **Moved to billing.** Encounter reads stopped (confirmed) and assignments
  close through the same trigger (from its definition), but
  `can_view_all_patients` was left true, and because `institution_has_patient_access`
  is not role-gated the billing member **could still message the patient as a
  clinician** (confirmed) and can read and amend appointments (from policy).
- **The last owner.** An admin archived the only owner by direct `UPDATE`
  (confirmed), and an admin hard-deleted both a colleague's membership and their
  own (confirmed). The last-owner check exists only inside the RPC.

## 4. Gaps

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

## 5. Recommended design

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

### 5.3 What the leaver keeps

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
| **1. Close the holes at the row** (done) | `end_practice_membership` and `leave_practice`; trigger blocking direct status, role and view-all changes and enforcing the owner invariant; drop the DELETE policy; `ended_at`/`ended_by`/`end_reason`, status CHECK, membership ledger and audit row; author write policies need current access for hospital-context rows; clear view-all on role change and gate clinical acts on `institution_has_clinical_access`; switch `removeMember` and `archiveMember` to the RPC. New suite `leaving_a_practice.test.sql`, converted from this assessment's probe, each assertion watched failing first | **S–M**, 2–3 days | G1, G3, G4, G8, G11 |
| **2. Handover** (done, simplified) | Impact preview in the confirmation instead of required dispositions; assignments end as before and the patient goes on the "needs cover" list in the Coverage tab, with tasks, future appointments and pending proposals (reassign or withdraw from there); draft and dictation freeze with routing to leads and `resolve_departed_draft`; `practice_id` on dictations, internal notes, proposals and messages. Lead vacancy shows through the existing "departments without a lead" finding | **M** | G5, G6 |
| **3. The patient side** (done, partly) | `practice_id` on messages and the institutional thread read; patient notice on handover (`patient_notices`). Not done: a departure line in the thread and composer forward routing; the Vault snapshot on handover | **M** | G2, G10 |
| **4. The long tail** | Leaver's read-only "former workplaces" view with the message history helper; correction on behalf of the practice; EHR tenant ownership (with the EHR plan); account closure and the foreign keys | **M** across items; each independent | G6, G7, G9, G12 |

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

Left open by this round, for a later decision:

- A leaver who *also* holds a private share with a hospital patient still reads
  that patient's encounters through the private share, as any privately shared
  clinician does. That is the patient's own consent and was left alone.
- Records written before this change whose context was ambiguous (the author
  also had a private share, or belonged to several practices the patient shared
  with) stay unstamped and keep the old reading.
- A dictation recorded with no patient chosen has no practice, so it stays its
  author's.
- Frozen drafts of a patient who has since disconnected cannot be resolved by
  anyone (no break-glass), so they stay frozen.
- Moving to a non-clinical role does not freeze drafts; only departure does.
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
