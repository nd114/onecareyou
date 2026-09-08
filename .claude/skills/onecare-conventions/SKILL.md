---
name: onecare-conventions
description: Use when working anywhere in the OneCare codebase — designing a feature, writing a migration, reviewing a change, writing a commit message, or deciding how a record correction, deletion, consent or sharing question should behave. Carries the platform's decision rules, its verification commands, and the shape its comments and commits take. Trigger on OneCare, patient record, clinician, consent, sharing, vault, retraction, proposal, or any change under supabase/migrations.
---

# OneCare conventions

## The eight rules

Design decisions here are settled by these, in roughly this order of force.
When a new question comes up, the answer is usually already implied by one.

**1. Nothing is hard-deleted where there is a legal record.** Archive, retract,
supersede, mark `entered-in-error` — never `DELETE`. Somebody has to be able to
answer what existed, when, and who saw it. Deleting the evidence of a problem
is not a fix for the problem.

**2. The patient decides about their own data; the clinician decides about
their own account of care.** Neither can overwrite the other. A clinician's
note of what they observed is the clinical record and a patient cannot erase
it — a record a patient could delete is no use to either party in a dispute.
A patient's medication list is theirs and a clinician cannot edit it — they
propose, the patient accepts.

**3. Absence is visible.** A gap is worse than a marker. Where something is
withdrawn, hidden or suppressed, say so in its place, with who did it and why.
A record that quietly changes shape is worse than one that says something was
taken out of it.

**4. Enforced at the row, not the client.** If a rule is not in an RLS policy
or a SECURITY DEFINER function, it is not a rule — it is a convention the next
caller will not know about. Client guards are for the message, not the
enforcement.

**5. Consent is checked at the moment of the act.** Not remembered from when
the page loaded, not inferred from an assignment that exists, not "held access
once". Revocation takes effect on the next read.

**6. A promise in the UI must be a capability in the database.** See the
`empty-promise-audit` skill. A person consenting to something the system cannot
do has consented to a fiction.

**7. One vocabulary.** Do not build a second approval object, a second share
permission set, a second interaction checker beside the first. Two systems for
one idea is how they come to disagree. Extend the existing one — a value in a
CHECK constraint and a branch in a function, not a new table and a new screen
the user has to learn.

**8. Say the uncertainty.** "We could not check" is not "no interactions
found". An assistant that cannot reach a drug database says so. A risk score
with no assessment behind it reports as unassessed, not as low.

## Corrections: which of the three classes is this?

Before designing any "the clinician got it wrong" feature, decide which class
it is. They want different mechanics and conflating them loses one or the
other. See `docs/record-corrections-plan.md`.

1. **Additive clinical event** — the clinic's contemporaneous account. Written
   directly, always visible, patient may dispute (addendum) but not veto.
2. **Change to the patient's own data** — proposed, applied only on acceptance,
   through a fixed key list. `record_change_proposals`.
3. **Retraction** — urgent, cannot wait for acceptance, enforced in every read
   path at once, row and file survive, exposure window recorded.

## Verification

`npx tsc --noEmit` is a **no-op** here — the root tsconfig is solution-style.
The real commands:

```
npm run typecheck        # tsc --noEmit -p tsconfig.app.json
npx vitest run
./scripts/db-test.sh     # replays migration history, runs every SQL suite
npm run build
```

Run all four before reporting a state. Every new SQL or unit test is verified
by breaking the code and watching the right assertion fail — see
`verify-before-claiming`.

Postgres for the SQL suites:
`su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pgtest/pgdata -l /tmp/pgtest/pg.log start"`.
Container restarts kill it. Never use `pkill` — it kills the shell.

## Comments and commit messages

Comments say **what failure this exists to prevent**, not what the code does.
The reader can see what it does.

> Deliberately not applied to `mark_dose_taken`: recording that you took a
> hospital-prescribed medicine is adherence, not an edit to the prescription.

Not:

> Check if the medication is editable.

If a line's stated justification turns out to be redundant, remove the line
rather than leave a comment that overclaims.

Commit messages open with the failure, then the fix, then what was checked.
State the bug plainly, including when it was your own — "the intent was right
and the wiring was not" is the register. Close with the counts that were
actually run. No model identifiers anywhere in the repo.

## Currently paused, by the user's decision

Family-member targeting. Voice-first phases. QHIN (OneCare is judged to
supersede it as adoption grows). Do not build these without being asked again.
