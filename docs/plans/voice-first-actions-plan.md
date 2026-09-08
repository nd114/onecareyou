# Voice-first actions ("say it once, approve it once")

> **Paused — September 2026.** Paused by decision after phase one. Restart when: the assistant's written flows are settled, since every voice phase inherits whatever they decide.
>
> This document describes an intention, not current work. Nothing below is
> a commitment, and none of it should be read as describing how the
> platform behaves today.

Status: **scoped, not started.** September 2026. Written after reading what is
already built, so the estimates below are against real code rather than a blank
page.

The ask, in the owner's words: a mother with twins presses one button and talks,
and readings and events land in the right places; a busy clinician presses one
button and says *"Mr John James, age 42 needs paracetamol from the pharmacy; he
needs to check in with us in 2 days to be reevaluated and to see Dr Amanda
Sana"* — and gets back a single screen showing every action that implies, where
each one will be written, with one Approve. Nothing happens without that
approval, and the approval is logged.

---

## 1. How far away is this? Nearer than it looks, in the part that matters

The hard architectural decision has already been taken and built: **the
assistant proposes, the person approves, and only then is anything written.**
That is not a small thing to have settled. It is in `patient-ai-chat` and
`clinician-ai-chat` (tool calls collect `proposedActions` and the function
writes nothing), in `src/lib/ai-actions.ts` and `src/lib/clinician-ai-actions.ts`
(execution runs under the approver's own session, so RLS applies), and in the
system prompts, which forbid the model from claiming a change was made before a
SYSTEM NOTE says it was approved.

Voice input is also already there — `VoiceButton` feeds the assistant composer
on both sides, and the clinician dictation pipeline records, transcribes and
files.

So the mechanism exists. What is missing is **reach, resolution and review**.

### What the patient assistant can already do

Seven actions, all approval-gated: log a vital, add a medication, mark a dose
taken, change reminder times, drop one reminder time, stop a medication, delete
a mistaken reading. Plus two read-only lookups into the drug knowledge base.

For "a mother with twins dictating readings", the honest gap is smaller than it
sounds. She can already say "Ava's temperature was 38.2 this morning" and get a
proposal. What she cannot do:

- **Say several things in one breath and get several proposals reviewed
  together.** Multiple tool calls in one turn already work; the review UI shows
  them as one pending block, which is close. Needs testing under real dictation
  rather than typed text.
- **Direct a reading at a family member.** The snapshot and every tool are
  scoped to the signed-in user with `family_member_id` null. Twins are exactly
  the case this fails. **This is the single highest-value patient-side gap.**
- **Keep talking without stopping.** `VoiceButton` is push-to-talk. "Drive mode"
  means continuous capture with an end phrase or an explicit stop.

### What the clinician assistant can already do

Three actions: send a message, send guidance, set an alert rule. That is the
whole list.

Against the worked example, that means **most of the sentence has nowhere to
go**:

| What was said | Where it lands today |
|---|---|
| "Mr John James, age 42" | Nowhere — no entity resolution, the model matches names from a snapshot |
| "needs to take paracetamol" | Nothing. There is **no prescription object in the schema at all** |
| "get it from the pharmacy" | Nothing. There is no pharmacy side |
| "check in with us 2 days from now" | Nothing — appointments exist, the assistant cannot create one |
| "to be reevaluated" | Could become guidance |
| "and to see Dr Amanda Sana" | Nothing — no assignment or hand-off action |

So: **the patient side is a few features from the vision; the clinician side is
a new capability set.** That is the honest answer.

---

## 2. What has to be built, in the order that de-risks it

### Phase 1 — Entity resolution (blocks everything else)

"Mr John James, age 42" has to become a patient id, and "Dr Amanda Sana" a
colleague id, with the ambiguity handed to the person rather than guessed.

The pieces exist: `src/lib/identity-match.ts` already does fuzzy name, DOB and
phone matching for record import, and the search overhaul added fuzzy matching.
What is needed is a **resolver that returns candidates, never a winner** —
`{ query: "John James, 42", candidates: [...], confidence }` — and a UI where
the clinician taps the right one. A resolver that picks silently is the
wrong-patient bug with a microphone attached, and it is the reason this phase
comes first.

Rule: **an unresolved or ambiguous entity blocks its action from the approve
list.** It does not get approved "pending confirmation".

### Phase 2 — The review screen

One screen, every proposed action, grouped by what it touches, each showing:
what will be written, where, who sees it, and what it does not do. Approve all,
approve some, edit one, discard one. This is the "nice UI/UX" the owner
described and it is mostly assembly — `ProposedActionsCard` already renders a
pending block with approve/discard; it needs to scale from one action to eight
and to show destination.

Audit: approval is already logged. Each action needs the **transcript segment it
came from** stored alongside it, so an audit answers "why was this written" with
the words that caused it.

### Phase 3 — Clinician action breadth

New propose_ tools, each with an executor and an audit trail:

- `propose_book_appointment` / `propose_request_scheduling` (appointments exist)
- `propose_assign_clinician` (assignments exist)
- `propose_create_task` (tasks exist — this is nearly free)
- `propose_create_referral` (referrals exist — also nearly free)
- `propose_internal_note` (exists)

Four of these are wiring an existing feature to a tool definition. That is the
cheapest large win in the whole plan.

### Phase 4 — Prescribing, and the pharmacy

This is a **product, not a feature**, and it should not be smuggled in behind a
voice button. It needs, at minimum:

- A `prescriptions` table with prescriber, patient, drug, dose, route, quantity,
  refills, issue and expiry, and a status machine (issued → dispensed → expired
  / cancelled).
- A signing model. A prescription is a legal instrument; "the doctor tapped
  Approve in a chat UI" has to be defensible, which means a signature record,
  a tamper-evident hash, and a clear statement of what the doctor saw when they
  signed.
- Jurisdiction rules. Who may prescribe what, controlled substances, remote
  prescribing — none of which is code.
- The dispensing side: an authenticated live prescription on the patient's
  phone, a pharmacy that can verify and mark dispensed, and a partial-dispense
  state.

**Recommendation: split this out entirely.** Phases 1–3 make the assistant
genuinely useful and carry ordinary product risk. Phase 4 carries regulatory
risk and deserves its own plan, its own legal review, and its own schedule. The
voice work should not wait for it — everything except "prescribe paracetamol"
in the worked example is reachable without it.

### Phase 5 — Continuous capture ("drive mode")

Push-to-talk becomes a session: continuous transcription, on-screen running
text, an explicit "that's everything" to close. Depends on nothing above, and is
the piece that makes it feel like the thing the owner described. Should come
after Phase 2, so what it captures has somewhere to land.

---

## 3. Liability posture, stated plainly

The current posture is right and should not loosen as reach grows:

1. **Nothing is written without an explicit human approval.** No confidence
   threshold, no "high-confidence actions auto-apply". The moment there is an
   auto-apply path, the audit answer to "who decided this" becomes "the model".
2. **The approver sees the final text, not a summary of it.** Approving a
   paraphrase of what will be written is not approving what will be written.
3. **Ambiguity blocks, it does not default.** See Phase 1.
4. **The transcript is kept with the action.** What was said, what was
   proposed, what was approved, by whom, when.
5. **The assistant does not diagnose or choose treatment.** It records what the
   clinician decided. The distinction has to survive the convenience of voice —
   it is easiest to lose exactly when the interface gets frictionless.

---

## 4. Sequencing

Phase 1 (resolution) → Phase 2 (review screen) → Phase 3 (breadth) → Phase 5
(drive mode). Phase 4 (prescribing + pharmacy) runs on its own track, gated on a
legal answer rather than an engineering one.

Patient side, in parallel and cheap: **family-member targeting** for the
existing seven tools. A parent managing two children is the case the whole
patient assistant currently cannot serve, and it is a scoping change to the
tools and snapshot rather than new machinery.
