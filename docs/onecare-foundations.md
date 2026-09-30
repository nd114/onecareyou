# OneCare's foundational pillars

**What this is.** The founding statement of what OneCare stands for and how it behaves. Every other
document in this repository is rooted here: the rules docs specify these pillars in detail, the plans
build them, and the guides explain them to patients and clinicians. Where another document disagrees
with this one, one of them is wrong and gets fixed — deliberately, not by drift.

**Last reviewed:** 29 September 2026.

A pillar is a commitment, and not every commitment is in the product yet. Anything marked
*(building)* is decided and on the [roadmap](./roadmap.md) but not yet live — say so when presenting
it.

---

## What OneCare is

A health record the patient controls, with workspaces on top for the clinicians and hospitals who
care for them.

**The mission: end the information asymmetry between patients and clinicians.** Today the patient is
the one person in their care who never sees the whole record, and the clinician in front of them
often sees only a slice of it. OneCare gives both sides the same clear picture — the patient decides
who sees it, and everyone can see what happened, when, and who did it.

---

## The pillars

### 1. The patient holds the power

**Every connection starts with the patient, and only the patient widens what is shared.**

- The patient invites a clinician or connects to a hospital, picks what they see, and can narrow,
  pause or end it at any time. Nothing is redirected or re-shared on their behalf.
- One exception, and it hands power back: a clinician or hospital may open a managed record for
  someone not yet on OneCare. The patient then claims it, and from that moment it is theirs to
  control.
- There is no back door. Nobody reads a record without an active share — no "break-glass" override
  for staff. In an emergency, help comes through people the patient chose, such as their next of
  kin — never by staff overriding a share.

*Specified in:* [Sharing, access and consent model](./sharing-access-consent-model.md) §1–2 and §6.

### 2. Clarity on both sides

**Both sides see the full picture, and are told plainly what the other side can see.**

- Clinicians work best with the whole record, so sharing with a hospital defaults to everything —
  disclosed on the screen where the patient connects, never buried in settings, and any category
  can be switched off before or after.
- Absence is visible. When something is withdrawn, hidden or deleted, a remnant says so in its place:
  what, when, who and why.
- Say the uncertainty. "We could not check" is never shown as "nothing found".
- Plain words, not an EHR's density: one primary action per screen, no jargon the patient has to
  decode.

*Specified in:* [Sharing model](./sharing-access-consent-model.md) §2B;
[Record corrections](./record-corrections-plan.md); [Roadmap — Guardrails](./roadmap.md#guardrails).

### 3. A promise on screen is a rule in the database

**Consent is checked at the moment of each act, and enforced where no screen can walk round it.**

- Revoking a share takes effect on the very next read — not when a page reloads, not "eventually".
- Every access rule lives in the database's row-level security, not in the app. A screen may explain
  a rule; it never is the rule.
- Nothing is offered that the system cannot actually do. A person agreeing to a capability that does
  not exist has agreed to a fiction.
- One vocabulary: one set of permission categories, one way to share, one ledger of who shared what.

*Specified in:* [Sharing model — One vocabulary](./sharing-access-consent-model.md);
conventions rules 4–7 (`.claude/skills/onecare-conventions`).

### 4. Stopping sharing is not the end of care

**When a patient stops sharing, live data stops; the care relationship can carry on.**

- Stopping sharing ends the clinician's view of readings, medicines and documents on the next read.
  It does not have to end the conversation: the patient and their clinician can still message, and a
  late result or discharge summary can still reach the patient. *(building)*
- What a clinician sends goes straight into the patient's Vault, with a notification when it
  arrives and a visible origin on the document — "From Dr X · St Elsewhere" — so the patient always
  knows who put it there. A hospital's front desk may send paperwork too, labelled as the front
  desk, never as a clinician. *(Built: filing, the notification and the named origin.)* Additions a clinic makes to its own record of care while the
  patient is not sharing are delivered, labelled as such, when sharing resumes. *(building)*
- A clinician or hospital stepping back pauses the relationship rather than slamming a door; it can
  become active again. *(building)*
- If a patient has closed the relationship entirely and something urgent arrives, the institution
  contacts them outside the platform — it holds their contact details.

*Specified in:* [Sharing model](./sharing-access-consent-model.md) §3;
[Sharing infrastructure v2](./plans/sharing-infrastructure-v2.md) (the build).

### 5. Each party owns its own account

**The patient decides about their data; the clinician decides about their account of care. Neither
overwrites the other.**

- A clinician's note of what they observed is the clinical record. The patient can see it and add
  their own statement to it, but cannot erase it.
- A patient's medication list is theirs. A clinician proposes a change; nothing changes until the
  patient accepts.
- A misfiled document is retracted at once, everywhere, with the exposure recorded — urgency beats
  acceptance when it is someone else's data.

*Specified in:* [Record corrections](./record-corrections-plan.md);
[Withdrawal and derived data](./withdrawal-and-derived-data.md).

### 6. The institution is the custodian of what its staff create

**Records made at a hospital belong to the hospital's record, looked after by the hospital, with
the patient able to see who looked.**

- A clinician working for a hospital works in a separate account on the hospital's email domain.
  Their private practice is a different account. What a patient shared with a doctor personally stays
  with that doctor — the hospital cannot take it over, just as it could not take over a text to the
  doctor's own phone.
- When someone leaves, the hospital shuts off their access without needing their cooperation. They
  lose everything at that hospital; their open work is frozen and routed to the people responsible.
- Inside the hospital, access is need-to-know: the clinical staff on the patient's care and the
  governance roles that answer for it. Access is logged and the patient can see it, and the patient
  is told plainly at connection that the hospital team can read their conversations. *(Partly
  built: the care team reads a thread once its clinician has left; governance access, logging of
  thread reads and the connection notice are building.)*
- Sensitive conversations (mental health, sexual health, HIV, addiction) get a **private** tag that
  restricts them to the treating professionals the patient names. *Urgent, in review with clinicians,
  governance and legal before it is built.*

*Specified in:* [Sharing model](./sharing-access-consent-model.md) §2B and §5;
[Clinician offboarding](./plans/clinician-offboarding.md);
[Independent clinicians and hospitals](./independent-clinicians-and-hospitals.md);
[Hospital tenancy](./enterprise-hospital-tenancy-plan.md).

### 7. Records are preserved; deletion is the controller's decision

**Nothing is quietly lost. Whoever controls a record decides whether it is deleted — never OneCare
on its own.**

- The normal ways a record changes are hiding, archiving, retracting and marking entered-in-error.
  Each leaves a trace.
- Deletion is the controller's call: the patient for their own uploads, the institution for its
  records.
- Deletion is recoverable for 15 days, then permanent, and it is announced: the institution's
  responsible officials receive a batched notice of what will be permanently deleted and when.
  *(building — today there is no recovery window, and institutions cannot delete their records)*
- Deleting one party's record never reaches into the other party's copy or the patient's Vault.

*Specified in:* [Sharing model](./sharing-access-consent-model.md) §7 (draft, pending review).

### 8. We do not police what is not ours to police

**Where law, regulation or an institution's own policy governs, OneCare provides the capability and
the clarity, not the arbitration.**

- Retention periods are set by the laws that bind each institution. OneCare stores and exports; the
  institution decides.
- Whom a clinician works for is their business: several hospitals, contracts, their own practice —
  the platform supports any arrangement without special rules.
- Disputes between a patient and a clinic go to the clinic, and beyond it to the regulator. OneCare
  records what happened; it does not decide who was right.
- Use the structures the industry already has — email-domain affiliation, a recycle bin with a
  recovery window, controller and processor roles — rather than inventing new ones. Don't split
  hairs.

*Specified in:* [Sharing model](./sharing-access-consent-model.md) §1 and §7;
[Withdrawal and derived data](./withdrawal-and-derived-data.md) §4–5.

### 9. Honest about what OneCare is

**OneCare is a record and a workspace. It does not verify clinicians and it does not give medical
advice — and it says so plainly.**

- OneCare does not check a clinician's licence or credentials. That is for the hospitals, employers
  and regulators who already do it, and patients are told so in plain words wherever they connect
  with a clinician. The "Verified" / "Trust-based" badge is hidden; verification is on the roadmap
  to revisit much later.
- The assistant explains the patient's own record and quotes drug labels with the source named. It
  does not diagnose, prescribe or change a dose, and every answer says it is not medical advice.
- For a hospital's clinical records OneCare acts on the hospital's instructions (a processor). For
  the patient's own account it is responsible in its own right.

*Specified in:* [Withdrawal and derived data](./withdrawal-and-derived-data.md) §5;
[Assistant actions](./agents-and-assistant-actions.md); [Guide — the assistant](./guide/assistant.md).

### 10. Protected, portable, and closable

**The record survives failure, leaves with its owner, and an account can be closed without breaking
anyone else's record.**

- Triple protection: multi-zone replication, point-in-time recovery, and an independent weekly
  export to separate storage.
- A patient can take a full export of their record at any time.
- Closing an account disables sign-in and keeps the name on what that person wrote, so the record
  others rely on still says who wrote it. Nothing is decided by accident. *(building)*

*Specified in:* [Sharing model](./sharing-access-consent-model.md) §1 and §5;
[Service continuity](./continuity/service-continuity.md);
[Clinician offboarding](./plans/clinician-offboarding.md) §5.7.

### 11. Prove it, then prove it again

**A rule is only true once it has been tried and seen to hold.**

- Every access rule has a database test, and every test is shown to fail when the rule is broken.
- Features that touch consent, deletion or who-can-see-what are built, then re-vetted at least three
  times before release.
- When someone asks "are you sure?", the answer is a check, not a defence.

*Specified in:* [Audit, September 2026](./audit-2026-09.md); [Test strategy](./test-strategy.md).

---

## Where each pillar is specified

| Document | What it holds | Pillars |
| --- | --- | --- |
| [sharing-access-consent-model.md](./sharing-access-consent-model.md) | The canonical rules: who can see what, consent, ending, deletion | 1, 2, 3, 4, 6, 7, 8, 10 |
| [plans/sharing-infrastructure-v2.md](./plans/sharing-infrastructure-v2.md) | The build plan for sharing: relationship apart from data, alerts, document delivery | 4, 6 |
| [guide/sharing.md](./guide/sharing.md) | The patient-facing explanation | 1, 2, 4 |
| [record-corrections-plan.md](./record-corrections-plan.md) | Three kinds of correction | 2, 5 |
| [withdrawal-and-derived-data.md](./withdrawal-and-derived-data.md) | Withdrawal, derived data, controller and processor | 5, 8, 9 |
| [independent-clinicians-and-hospitals.md](./independent-clinicians-and-hospitals.md) | The two pathways that never merge | 6 |
| [enterprise-hospital-tenancy-plan.md](./enterprise-hospital-tenancy-plan.md) | Hospitals as institutions | 6 |
| [plans/clinician-offboarding.md](./plans/clinician-offboarding.md) | When someone leaves | 6, 10 |
| [roadmap.md](./roadmap.md) | What is built, next and deferred; the guardrails | all |
| [audit-2026-09.md](./audit-2026-09.md) | How the rules were tested, and what was found | 3, 11 |
