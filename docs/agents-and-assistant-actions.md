# Agents, and letting the assistant do things

Two related pieces of work: agents that help someone get *onto* the platform,
and an assistant that can act *inside* it. They share one piece of machinery —
a proposal the person approves before anything happens — so they are designed
together even though they ship separately.

---

## Part 1 — Onboarding agents

### Which ones, and why those

Three, in this order. Each targets a moment where someone abandons.

#### 1. The clinician migration agent — **highest value**

**The moment:** a clinician has decided to try OneCare and now has to move
their patient list, their note templates and their way of working. This is
where they stop.

**What it does:** takes whatever they have — a CSV, a spreadsheet, an export
from their current system — and walks it. It proposes a column mapping, shows
what it thinks each row is, and asks about the rows it is unsure of rather than
guessing or silently dropping them.

**Why an agent rather than a form:** the input is never the shape the form
expects. A form makes the human do the mapping; an agent proposes one and asks
about the exceptions, which is a much shorter conversation.

**What already exists:** `ClinicianPatientImport`, `staff-csv.ts`, and
`import-patient-records`. The agent is a better front end to machinery that is
largely built.

#### 2. The hospital setup agent

**The moment:** a hospital has said yes and now needs departments, a staff
roster, roles and an allowlist configured before anyone can use it.

**What it does:** asks for the org chart in whatever form exists, proposes
departments and role assignments, flags the people it cannot place, and shows
the resulting access — *"this configuration means 14 people can read clinical
notes"* — before anything is written.

**Why it matters:** `practice_role_permissions` was empty for a long time and
every role meant nothing. A setup agent that makes the consequence visible is
the difference between roles being configured and roles being defaulted.

#### 3. The patient first-week agent — **smallest, do last**

**The moment:** someone signs up, sees an empty record, and leaves.

**What it does:** turns "add a medication" into a conversation. Reads a photo of
a box, asks about the schedule, proposes the entry.

**Why last:** the empty-state and checklist work in the onboarding review may
solve enough of this without an agent.

### How they are set up

All three are the same shape:

```
person supplies input  →  agent proposes a set of changes  →  person reviews
                                                                    ↓
                            nothing written                    approves
                                                                    ↓
                                                       changes applied, logged
```

**The agent never writes directly.** It produces a *proposal* — a typed list of
changes with a plain-English description each. The human approves the whole
set or edits it first. This is the same pattern as the assistant's proposed
actions (`ProposedActionsCard`, `ai-actions.ts`), which is deliberate: one
approval mechanism, one audit trail, one thing to get right.

**Where they run:** server-side, as edge functions, for the same reason the
FHIR validator does not ship to the browser — they need credentials and
model access that must not be in a bundle.

**What they can touch:** each agent gets an explicit, narrow set of writes.
The migration agent can create patient records and invitations; it cannot
change practice roles. The setup agent can configure departments and roles; it
cannot read a clinical note. These limits are enforced by RLS under the
acting user's own identity — an agent has no privileges its operator lacks.

That last point is the important one. **An agent is not a service account.** It
acts as the person who invoked it, so everything already built about who can
see what applies unchanged.

---

## Part 2 — Assistant actions inside the app

### What is being asked for

The assistant should be able to do things — add a medication and schedule it,
stop one, take you to the right screen — with the person approving each action
before it happens, and every action logged.

### What already exists

More than it looks. `ai-actions.ts` and `clinician-ai-actions.ts` execute typed
actions; `ProposedActionsCard` renders a proposal for approval;
`useAIChat` tracks whether a proposal was applied, discarded or is still
waiting, and tells the model so it never claims a change was made when it was
not. `patient_action_log` records what happened.

So the pattern is built and proven on the clinician side. The patient side is
thinner.

### The four gates, in order

Nothing acts until all four have passed. They are listed in the order they must
be checked, because a later gate cannot compensate for an earlier one.

1. **Consent to AI at all.** Already enforced (`useAIConsent`) — the assistant
   will not answer without it. Actions must not be a second, quieter grant:
   consent to *use* the assistant is not consent for it to *change things*, so
   this needs its own explicit opt-in.

2. **The action is one we allow.** A closed set of typed actions, not free-form
   database access. A model that can propose arbitrary writes is a model that
   will eventually propose a bad one.

3. **The person approves it.** Per proposal, showing exactly what will change
   in their words — *"Add Metformin 500mg, twice daily at 08:00 and 20:00"* —
   not a JSON blob. Destructive actions (stopping a medication) are separated
   from additive ones and never bundled into a single approval.

4. **It is logged as the person's action, attributed to the assistant.** This
   is where the audit bug found earlier matters: `logAction` was not supplying
   `actor_user_id`, so every assistant action failed to log while looking
   exactly like one that had. Fixed — but it is the reason gate 4 gets its own
   tests before any of this ships.

### What must not happen

- **No silent action.** If the model decides mid-answer that something should
  change, it proposes; it does not do.
- **No bundling.** "Add this and remove that" is two approvals.
- **No retroactive consent.** Approving an action is not approving a category
  of actions.
- **No action without a record.** If the log write fails, that is visible now,
  not swallowed.

### Navigation actions are different, and simpler

"Take me where I can do X" changes nothing and needs no approval — the person
asked to go somewhere and they can leave. This already works
(`suggestedRoute`). Worth keeping the distinction sharp: *navigating* is not an
action, *writing* is.

---

## Sequencing

1. Patient-side action consent, separate from assistant consent.
2. Patient action set — add medication, schedule, stop medication — with
   approval UI and tests on the audit path.
3. Clinician migration agent, reusing the same proposal machinery.
4. Hospital setup agent.
5. MCP, only after all of the above, and only as a share. See
   `roadmap-logged.md`.
