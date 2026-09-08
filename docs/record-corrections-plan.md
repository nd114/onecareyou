# Correcting a record after the patient owns it

Status: **two of the three classes built.** September 2026.

## The question

Locking a clinician out of a claimed record is too blunt. The record is
co-authored from the moment it is claimed — the clinic keeps writing to it, and
should. What must not happen is a clinician *silently rewriting* something the
patient has already read.

So the design problem is not "can they edit" but **which kind of change is
this**, and each kind wants different mechanics.

**See also** `withdrawal-and-derived-data.md` — what happens to data extracted
from a withdrawn document, why removing wrong-patient values is not overreach,
and OneCare's processor/controller position with the references behind it.

## Three kinds of change, and why they differ

### 1. Additive clinical events — no acceptance, always visible

A clinician records what happened: a note, a reading they took, a result that
came back. This is the clinic's contemporaneous account of care.

The patient **sees** it and can **dispute** it. They cannot veto it. That is not
a platform choice — a clinician's note of what they observed is the clinical
record, and a record a patient can delete is not one anybody can rely on in a
negligence claim, an insurance dispute, or the patient's own defence.

*What the patient gets instead is an **addendum**: their own statement attached
to the entry, permanently, in their words.* This is how paper records have
always handled disagreement, and it is the humane answer to "you cannot delete
this". Not yet built.

### 2. Proposed changes to the patient's own data — acceptance required

"Change metformin from 500 mg to 1000 mg." This edits the patient's medication
list, which is theirs. **Built**, in `record_change_proposals`.

It was built because the alternative already shipped and was false. The
connection dialog offered "Accept & Collaborate — both you and your provider
can update records going forward" and wrote `meds_write: true` into
`data_sharing_agreements.permissions`. Nothing reads that column, and
`medications` carries no clinician INSERT, UPDATE or DELETE policy at all. The
patient was consenting to a capability that did not exist — and since the
"Take Ownership" option produced a byte-identical share, two of the dialog's
three choices were the same choice under different names.

The shape:

- A clinician with a **live** medications share proposes a start, a change or
  a stop. Checked at insert time, so a clinician whose access was revoked
  yesterday cannot put a decision in front of somebody today.
- Proposing writes nothing to the record. That is the entire distinction.
- The patient accepts or declines through `respond_to_change_proposal()`. The
  clinician cannot answer their own proposal, and neither can anyone else.
- Accepting applies the payload through a **fixed key list**. A proposal can
  change a dose, a frequency, an instruction — the things a prescriber decides.
  It cannot reach `user_id`, `id`, `source` or `external_id`, so accepting can
  never move a medication to another person or launder an imported row into an
  editable one. This is what "not carte blanche" means in code rather than in
  a comment.
- A change is a **diff**, not a replacement row: a payload naming only the dose
  changes only the dose.
- `source` stays `manual`. A non-manual source locks the patient out of editing
  their own row, and a change the patient chose to accept is theirs.
- Declined and withdrawn proposals survive, with the patient's reason. A
  declined change is as much a part of the history as an accepted one.
- Both the proposal and its answer are in `hipaa_audit_logs`, attributed to the
  clinician who proposed and recording who answered.

Deliberately *not* reusing the AI assistant's approval object, which the
earlier draft of this plan proposed. That object lives in a chat message and
dies with it; a clinician's proposal has to outlive the session it was made in,
be visible to both parties, and be answerable days later. Same idea, different
lifetime. What is shared is the principle — nothing is written until the person
whose record it is says so.

The one thing still open: a proposal the patient never answers stays pending
forever. It is visible to both sides and the clinician can withdraw it, which
is enough for now; an ageing-out rule would need to decide what a lapsed
prescription change means clinically, and that is not a decision to make in a
migration.

### 3. Retractions — urgent, cannot wait for acceptance

A discharge summary filed to the wrong Jane Evans. **This one is built**, because
it was a live privacy hole with no remedy: clinicians had INSERT on
`health_documents` and nothing else, so the only person who could archive
somebody else's letter was the person who should never have had it.

Four rules, each of which came from a failure mode worth naming:

- **Enforced at the access layer, not the client.** Outlook's message recall is
  unreliable because it asks a client to forget something already delivered. A
  row policy is the only place a retraction bites, so retracted documents leave
  every read path at once — the owner's, the per-document share, both
  whole-vault readers.
- **The row and the file survive.** Somebody has to answer what was disclosed,
  to whom, for how long. Deleting the evidence of a privacy incident is not a
  fix for the incident.
- **Visible absence.** The patient is told a document was withdrawn, when, and
  by whom — without the content coming back. Slack's "This message was deleted"
  tombstone is the right instinct: a record that quietly changes shape is worse
  than one that says something was taken out of it.
- **The exposure window is stated, not implied.** The audit entry records how
  many days it was visible and whether it was opened. Retraction stops further
  access; it cannot unsee what was already read, and an incident record that
  implies otherwise is worse than none.

## What other software does with the same problem

| Product | Mechanism | What we take from it |
|---|---|---|
| Google Docs | Suggesting mode — an editor proposes, the owner accepts, both the suggestion and its resolution stay in history | Class 2 exactly. The resolution is part of the record, not just the outcome. |
| Git | An erroneous commit is reverted with a new commit, never removed | Correct forward. History shows the mistake *and* the correction, which is what makes it auditable. |
| Slack / WhatsApp | Delete-for-everyone leaves a tombstone; edits are marked "(edited)" | Visible absence. A gap is worse than a marker. |
| Banking ledgers | A wrong entry is reversed by a compensating entry, never edited | Append-only. The balance changes; the history does not. |
| Wikipedia | Revision history with attribution, plus *revision deletion* for genuinely harmful content — hidden from normal view, retained for oversight, and the act itself logged | The closest analogue to a misfiled document: suppressed from the record's face, retained for accountability, and the suppression is itself a logged event. |
| Outlook recall | Frequently fails, because delivered copies stay delivered | The negative lesson, and the reason our retraction is a row policy rather than a request. |

## Scenarios still to work through

Named so they are not discovered one at a time in production:

1. **Wrong patient selected for a note or encounter.** The commonest real EHR
   error. Needs the FHIR `entered-in-error` status applied to encounters — the
   codebase already honours that status on *imported* observations, so
   extending it to clinician-authored content is consistent rather than novel.
2. **Two records, one human.** A merge is the hardest operation in any record
   system, and the one identity rule makes it tractable: merging links records
   to a single `auth.users.id`, it never mints a new one. Both source records
   must remain resolvable afterwards.
3. **A clinician leaves the practice.** Their entries stay, attributed to them,
   with the practice as the responsible party. Offboarding already keeps
   authored history; this is the same rule stated for corrections.
4. **A patient disputes something they cannot erase.** The addendum above.
5. **A retraction the patient already acted on.** They took a medicine that has
   since been withdrawn. Retraction must therefore *notify*, not just hide —
   the patient needs to know something they relied on has changed.
6. **Data filed under a name or gender the patient has since changed.** An
   amendment to identity attributes should propagate; a historical clinical
   statement should not be rewritten. These are different operations and
   conflating them loses one or the other.

## Sequencing

Document retraction and clinician proposals are done. Next, in order of how
much harm the absence does: encounters marked entered-in-error (1), then
addenda (4), then merge (2 in the scenarios above), which should not be
attempted until the first two are settled.

Proposals currently cover medications only. Extending them is a value in the
`kind` check and a branch in the apply function — deliberately, so the second
kind does not arrive as a second review surface the patient has to learn.
