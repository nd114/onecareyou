# Agreed, not yet built

Decisions reached in discussion and not yet in code. Each says what was
settled and what is still open, so the next person picking one up is not
re-deciding it. September 2026.

Ordered by how much harm the absence does.

---

## 1. Retraction: a window, a remnant, and who arbitrates

**Settled.** Retracting a misfiled document stays possible **forever**. What
changes with time is who has to sign it, not whether it can be done.

| Age of the document | Who can retract | What it is |
|---|---|---|
| First 72 hours | The sender, alone. One action, reason required. | An immediate correction |
| After 72 hours | The sender **or the practice**, with a categorised reason, co-signed by the practice's privacy or admin role | A privacy incident, handled as one |

Why not a hard cutoff after 3 or 7 days. A time limit is right for *undo*,
where the harm is embarrassment and decays. This is a **disclosure**, where the
harm compounds. Misfilings are found late — when the wrong patient asks why
they have this, when the right one says their letter never arrived, when an
audit runs — so a 7-day window closes at roughly the moment discovery
typically happens. And "ask the patient to retract it" cannot be the remedy of
last resort: the practice is the controller and owns the duty, the patient who
was wrongly sent it owes nobody cooperation, and asking may itself require
explaining whose record it is.

The co-signature buys what the clock was meant to buy. A clinician cannot
quietly withdraw a diagnosis letter a patient depends on, because after 72
hours it takes two people. It also fixes something the current sender-only
design gets wrong: **a departed clinician's misfiling is currently unfixable by
anyone.** The practice route closes that.

"Ask the patient" stays available as a message. It is often the right first
move. It is never the only route.

### The remnant

Not "tombstone" — **remnant**, throughout. No emoji.

```
Discharge summary.pdf — withdrawn 3 September by Dr Adeyemi
Sent in error · Why?
```

"Why?" opens the reason, how long it was visible, whether it had been opened,
and what to do next.

**Two audiences, two fields.** The reason shown to the recipient must not name
the other patient — "belongs to Jane Evans of 14 Acacia Road" is a second
disclosure caused by the remedy for the first. So:

- a **structured category** (wrong patient / superseded / contains another
  person's data / sent in error),
- **patient-facing text**, constrained,
- an **internal note** only the practice and the audit record see.

The category is structured rather than free text because free text cannot be
counted, cannot raise an alert when one clinician's misfilings spike, cannot be
translated, and cannot be filtered in an incident report. Free text says what
happened once, to one reader. A category says what keeps happening.

### Dispute — and who arbitrates

**We do not arbitrate, and must not appear to.**

Settled shape: **no dispute inside the first 72 hours.** That window is for
genuine, immediate correction and a dispute mechanism there would only add
friction to somebody fixing their own mistake. The remnant still appears, so
the patient is never left with an unexplained gap.

**After 72 hours the patient may object.** An objection is recorded against
the retraction, attached to the remnant permanently, and routed to the
practice — who is the data controller and the accountable party. OneCare's role
is to hold the record of what was withdrawn, why, when, and that it was
objected to. Not to decide who was right.

Where the patient is unsatisfied, the escalation is the one the law already
provides: their regulator. We surface that route rather than adjudicating.

**Still open:** whether an objection should temporarily restore the patient's
own view of the document. Argument for: they cannot contest what they cannot
see. Argument against: if it genuinely was somebody else's record, restoring it
re-opens the breach to make a point about process. Leaning against, with the
practice able to re-send if the retraction was wrong.

---

## 2. The Vault: scope, order, and where a thing came from

**Settled in principle.** The Vault is the patient's complete record, so it
needs a scope somebody can hold in their head and provenance on everything.

### What belongs in it

One rule: **anything that is a document about this person's health.** Not a
second store beside the medication list and the readings — those are structured
data with their own screens. The Vault is the unstructured half.

Today: uploads, clinician-sent documents, lab results, discharge summaries,
prescriptions, imaging reports, insurance, vaccination records, referrals,
visit notes, care records, and the patient's own appointment recordings and
their transcripts.

To bring in, because they are documents about this person's health and
currently live elsewhere: AI conversation exports the patient asked to keep,
generated summaries, signed assessments they were given, and the record bundle
produced on export.

### Organisation

Four axes, and only one of them is a folder:

- **Folders** — the patient's own arrangement. Their words, their order.
- **Category** — what kind of document it is. Fixed vocabulary, already exists.
- **Time** — `document_date` (when it is about), distinct from `created_at`
  (when it arrived). Sorting by the wrong one is why a five-year-old letter
  uploaded today appears first.
- **Source** — who put it there.

The failure to design against is a flat list of two hundred files named
`scan_001.pdf`. Categories and dates are assigned at upload, folders are
optional, and search covers all four.

### Provenance — "obtainable, not perpetual"

Every item carries, and can always answer:

- who put it there (patient, which clinician, which practice, which import)
- when it arrived, and what it is dated
- how it got here (uploaded, sent by a clinician, imported from which system,
  generated by OneCare)
- if generated: from what, and by which version
- every share it has been part of, and every access recorded against it
- if withdrawn: the remnant

Shown on demand — a "Where this came from" panel — not on the face of every
row. The row shows name, category, date and a source badge. The rest is one tap
away and always available.

Most of this exists: `source_context`, `uploaded_by_user_id`, `created_at`,
`document_date`, plus `access_audit_logs`. What is missing is a **single place
that answers the question**, rather than four tables a developer could join.

**Still open:** whether provenance is a view or an assembled panel. Leaning
view, so the export and the AI context read the same answer the patient does.

---

## 3. People do not report themselves in real time

**Partly built.** `stopped_by` / `stopped_reported_at` and
`medications_with_status` landed with the medication-stopping work. The
principle generalises and the rest is not built:

**Every self-reported fact has two times: when it happened, and when we were
told.** Storing one is how a record comes to say something false while every
individual write was true.

Where it still needs applying:

- **Adherence.** `schedule_entries.taken_at` is when the dose was taken;
  marking it three days late stamps the mark, not the dose. A patient
  back-filling a week is being honest and the record should say so — including
  to the risk engine, which should weight a dose confirmed a week later
  differently from one confirmed at the time.
- **Vitals.** `recorded_at` is settable; nothing records when it was entered.
- **Conditions and allergies.** No date at all for when they began.

**Settled:** report time is recorded everywhere a person can assert something
about the past, the gap is shown when it is material, and the gap is never
presented as an error. "Stopped in August, told us in September" is a true
statement about a real person and displaying it as a data-quality problem
teaches people to lie about dates.

---

## 4. Addenda, and editing them

**Settled.** A patient cannot delete a clinician's note. What they get instead
is an addendum: their own statement, attached to the entry permanently, in
their words. Both sides can write one; a clinician correcting their own note
writes an addendum rather than editing history.

An addendum is never approved or rejected. It is speech, not a change. That is
what makes it safe to grant unilaterally.

**Editing, decided:** editable for **one hour**, then fixed, marked `(edited)`
afterwards — the WhatsApp convention, which people already understand.

This is *not* a conflict with the no-hard-delete rule, provided **prior
versions are retained**. WhatsApp keeps none; a health record must. So: the
displayed text is the latest, `(edited)` says it changed, and the earlier
versions are obtainable the same way document provenance is — available, not
perpetual. Without version retention an edit window would be a way to rewrite
history quietly, which is exactly the thing addenda exist to prevent.

The same one-hour-and-`(edited)` rule should apply to **messages** between
patient and clinician, which currently cannot be edited at all. That means
bringing the chat up to what people expect from any messaging app — edit,
delete-for-everyone leaving a remnant, read state, reply-to. Worth doing as one
piece of work rather than bolting editing onto the current implementation.

---

## 5. Encounters marked entered-in-error

**Settled in shape, not built.** FHIR already has the vocabulary and this
codebase already honours `entered-in-error` on imported observations, so
extending it to clinician-authored encounters is consistent rather than novel.

- The **author** marks it, or the **practice** if the author has left. Reason
  required. No patient acceptance: it is the clinician's own account.
- The row survives, struck through, showing who marked it and when.
- The patient sees it happen.

**The thing that makes or breaks this:** if the status is only a badge, it is
not done. The AI will still summarise the encounter, the risk engine will still
count it, the export will still include it. The status has to remove it from
clinical reads at the view or policy level — not by every caller remembering to
filter. That is where this normally goes wrong.

---

## 6. Merge: two records, one person

**Settled in principle, deliberately last.**

The case: somebody is already on OneCare, and separately their clinician
created a record for them — a different email, a walk-in visit, a bulk import —
so there are two records for one human. Merging joins them.

Rules:

- Merging **links** both records to a single `auth.users.id`. It never mints a
  new one. Three ids for one person is the thing to avoid.
- Both source records stay resolvable afterwards. Nothing is hard-deleted.
- **The attribution problem, plainly.** `record_onboarding_provenance()` stamps
  `onboarded_via_practice_id` on the profile the first time a practice record
  is claimed, and the first institution to introduce somebody keeps the credit.
  That field is what the revenue share with institutions is calculated from. A
  merge that takes the surviving record's attribution would silently move the
  credit — if the hospital-created record is merged into a self-signup profile
  and the merge keeps the profile's (empty) attribution, the hospital that
  actually introduced the patient loses the revenue, with no error and no way
  to notice from inside the app.

  So: **a merge preserves the earliest attribution across both records, not the
  surviving record's.** Write that assertion before writing the merge.

Not to be attempted until 1, 4 and 5 are settled.

---

## 7. Proposals that are never answered

**Settled.** No silent expiry. A proposal the patient never answers stays
pending and **ages visibly**: "waiting since 3 September" on both sides, and it
groups on the clinician's list as needing follow-up.

`created_at` already exists, so this is a display rule and a grouping, not a
schema change.

Two additions agreed:

- a `proposal_waiting` notification category, which slots into the per-category
  preferences already built;
- a **bulk reminder** the clinician can send to everyone with an unanswered
  proposal, because chasing them one at a time is how they stop being chased.

The system says "unanswered". It does not decide what that means clinically —
that judgement stays with the clinician.

---

## 8. Remove the sharing-model selector from the clinician's dialog

**Settled, small.** `EditManagedRecordDialog` lets a clinician pick a
`data_sharing_model` — including `patient_managed`, which no longer exists
anywhere else — on a record the patient has not claimed.

On an unclaimed record that field is a note about intent, not enforcement. It
becomes real only when the patient claims the record and chooses for
themselves. So the dialog is pre-selecting an answer to a question that is the
patient's to answer, and doing it in permission-shaped language that implies
otherwise.

Remove the selector. The patient chooses at claim time. If a clinician wants to
record intent, that is a note.
