# Correcting a record after the patient owns it

Status: **design, with the urgent case built.** September 2026.

## The question

Locking a clinician out of a claimed record is too blunt. The record is
co-authored from the moment it is claimed — the clinic keeps writing to it, and
should. What must not happen is a clinician *silently rewriting* something the
patient has already read.

So the design problem is not "can they edit" but **which kind of change is
this**, and each kind wants different mechanics.

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
list, which is theirs.

**The mechanism already exists.** The AI assistant proposes and the patient
approves; nothing is written until they do; the approval is logged. A clinician
proposing a medication change should use the same object and the same words —
one review surface, one vocabulary, one audit shape. Building a second
approval system beside it would be how the two come to disagree.

Pending → accepted (applies, both logged) or declined (recorded, nothing
applied). A proposal the patient never answers stays pending and visible; it
does not expire into silence.

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

Retraction of documents is done. Next, in order of how much harm the absence
does: encounters marked entered-in-error (1), then clinician proposals reusing
the assistant's approval object (2), then addenda (4), then merge (2 in the list
above), which should not be attempted until the first three are settled.
