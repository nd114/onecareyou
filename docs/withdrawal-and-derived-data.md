# Withdrawal, derived data, and whose responsibility is whose

The reasoning behind how OneCare handles a document that should not have been
sent, and what happens to data that was extracted from it. Written to be
revisited: every rule below says what it is, why, and what it rests on.

September 2026. Companion to `record-corrections-plan.md` (the three classes of
correction) and `sharing-access-consent-model.md` (who may see what).

**Not legal advice.** The regulatory references are the reasoning we relied on
and should be confirmed with counsel before anything here is asserted publicly.

---

## Contents

- [1. The two acts, and why they are not one](#1-the-two-acts-and-why-they-are-not-one)
- [2. What happens to data extracted from a withdrawn document](#2-what-happens-to-data-extracted-from-a-withdrawn-document)
- [3. The authorship objection, and why removal survives it](#3-the-authorship-objection-and-why-removal-survives-it)
- [4. Who acts: the platform, the clinician, the patient](#4-who-acts-the-platform-the-clinician-the-patient)
- [5. What OneCare is, in regulatory terms](#5-what-onecare-is-in-regulatory-terms)
- [6. The containment boundary](#6-the-containment-boundary)
- [7. The remnant](#7-the-remnant)
- [8. Why this is patient-first, not only compliance](#8-why-this-is-patient-first-not-only-compliance)
- [9. Regulatory references](#9-regulatory-references)
- [10. What is built, designed, and still open](#10-what-is-built-designed-and-still-open)

---

## 1. The two acts, and why they are not one

Withdrawing a document and reporting a privacy incident remove the same access
and are otherwise different in every respect.

| | Correction | Privacy incident |
|---|---|---|
| What was wrong | The content | The audience |
| Whose data | This patient's | Somebody else's |
| Who is harmed | This patient, acting on bad information | The person whose data it actually was |
| Right remedy | Issue a corrected version | Stop access, assess exposure |
| Who must be told | The patient | Patient, practice, possibly a regulator |
| External clock | None | GDPR 72 hours; HIPAA 60 days |
| Does it expire | Ordinary withdrawal closes at 10 days | Never |

They also want **opposite behaviour over time**, which is the clearest sign
they are different acts. A correction becomes *less* appropriate as time
passes: a document the patient has had for three months has been read and acted
on, and removing it helps nobody where a corrected version does. A privacy
incident is urgent regardless of age and never becomes inappropriate to fix.

The first design made the incident the third tier of one withdrawal mechanism.
That was wrong, and it had a practical cost: it pushed anybody with a
legitimate late correction to mislabel it as a breach in order to get past the
gate. Two doors, not one door with a lock.

## 2. What happens to data extracted from a withdrawn document

A lab report arrives, the assistant reads it, the patient approves, and values
land in their record. Later the document is withdrawn. Three outcomes,
determined entirely by the reason:

**Wrong patient.** The values are removed. Not flagged, not restricted —
removed from the record, with the event kept in the audit trail in Settings.
They were never this patient's data (§3). A marker left in the clinical series
would be a small ongoing disclosure about a stranger, and a hole in a trend
chart is a worse artefact than a row in a document list.

**A corrected version was issued.** Nothing cascades. The corrected document
arrives and is treated as what it is — a new document — and its values enter
the record dated to when the reading was taken. The old values are the
patient's to keep, edit or remove, with a direct link from the withdrawal
notice to the entry, including by asking the assistant and approving. This is
the platform working as designed: their record, their decision.

**Withdrawn with no replacement.** The values stay. When the patient approved
the extraction they made those values part of their record, citing a source;
the document was evidence, not a container. Losing the evidence does not
retract the claim. The citation on the value is marked unavailable, which is a
change in the detail view rather than a line item in a series.

**Anything computed from a withdrawn value** carries the withdrawal forward
rather than silently recomputing. A clinician who saw "reduce dose, eGFR low"
yesterday must not simply find no recommendation today — they must find the
remnant in its place, with a link to what happened, so they can prescribe
correctly. A warning disappearing needs an explanation more than a warning
appearing does.

## 3. The authorship objection, and why removal survives it

The strongest argument against removing wrong-patient values: the assistant
extracted them, but it did so on the patient's behalf and with the patient's
approval. In a real sense **the patient wrote them**, and removing what a person
wrote in their own record, without their action, is exactly the overreach this
platform exists to prevent.

It resolves, and the resolution is narrow enough to state precisely:

> **Authorship does not create a right to hold someone else's health data.**

When Patient B's record contains Patient A's haemoglobin, B did write it — but
what B wrote is A's medical information. B copying A's numbers into their
record no more makes those numbers B's than B typing them into a notes app
would. Removing them is not removing what B wrote about B; it is removing A's
data from where it should never have been.

That reasoning **only** holds where the values are known to be another person's,
and the only thing that establishes that is the reason code. So:

- `wrong_recipient`, `contains_other_patient_data` → another person's data.
  Containment.
- **Every other reason** → the patient's own record. Only the patient touches
  it.

This is the sole circumstance in which OneCare removes data from a patient's
record without the patient asking. It should be stated as such, publicly, and
nowhere should the platform imply a broader power.

## 4. Who acts: the platform, the clinician, the patient

**No clinician-facing button that reaches into a patient's record.** A clinician
cannot come to your house and take a letter back, and a screen offering "this
document also produced 8 readings — remove those too?" gives them exactly that.
The problem is not who clicks it; it is that it is a *discretionary act* at all.

Instead, removal is a **consequence**, not an action. The values were derived
from a document established as not this patient's; the basis for them is void,
so they revert. The nearest everyday analogue is a mistaken bank credit
reversed: nobody says the bank reached into the account, because the credit was
never theirs. What the bank must do is tell you, and log it.

So the sequence is: the practice declares the incident → containment follows
automatically → the patient is told → the audit trail in Settings holds the
record.

**Outside the platform, the clinician asks.** Where the patient forwarded,
exported or printed it, nothing technical is available and the clinician sends
a message: an apology for the error and a request to delete any copies passed
on. This uses the messaging that already exists, and it puts the request where
it belongs — from the person who made the error, not from the platform on their
behalf.

**OneCare never adjudicates.** A recipient may object to a withdrawal and the
objection attaches to the event and reaches the practice. There is deliberately
no outcome, reviewer or resolution field, and a test fails if one appears. This
is not modesty about our judgement; it is that mediating between a clinic and
its patient is a role this platform cannot carry at any scale, and a mechanism
implying otherwise would invite exactly that.

## 5. What OneCare is, in regulatory terms

The question that decides everything above: does containing a breach inside the
platform make OneCare a controller?

**No — and the reason matters.** Under GDPR the controller is whoever determines
the *purposes and means* of processing. For clinical records the practice
decides why and how patient data is processed for care; OneCare processes on
their behalf. That is a **processor**. Article 28(3)(f) obliges a processor to
*assist* the controller in complying with Articles 32–36, which is exactly
breach containment, and Article 33(2) obliges it to notify the controller of a
breach without undue delay.

Executing a containment the practice has declared is therefore **processor
behaviour, not controller behaviour**. The test is who decides. The practice
declares the incident; the platform executes. If OneCare instead removed data
on its own initiative, or adjudicated whether a withdrawal was justified, that
would be determining purposes — and it is precisely what the design refuses.

The position is a **split role**, which is ordinary for a platform of this shape:

- **Processor** for the practice's clinical records, under a DPA / BAA.
- **Controller in our own right** for the patient's own account — sign-up,
  the assistant, notifications, the Vault as a personal service. We decide the
  purposes of that processing and cannot pretend otherwise.

Two consequences worth being clear-eyed about:

1. A processor is **not** immune. Article 82(2) gives direct liability where a
   processor fails obligations directed at processors, or acts outside or
   contrary to the controller's lawful instructions. The protection is not the
   label — it is acting only on instruction and holding the audit trail that
   proves it. Which is what the incident record is for.

2. "The clinician is the controller, so it is their responsibility" is right
   about the *breach* and wrong as a general shield. Our exposure is our own
   conduct: security, acting on instructions, assisting properly, and not
   over-reaching. The design keeps all four.

Under HIPAA the same shape: **Business Associate** to a covered entity, with
breach notification running to the covered entity rather than to individuals or
regulators directly.

## 6. The containment boundary

A general propagation graph — *sent to → viewed by → forwarded to → imported
into → derived into* — is the right instinct and the wrong artefact. It
accumulates edges nobody maintains and gives false confidence that the picture
is complete.

Sort every edge instead by whether we can observe it:

**Inside the boundary — we know, and can act.** Delivered, opened, downloaded,
included in a share, derived into, exported.

**Outside — we cannot follow.** Forwarded, screenshotted, printed, described to
someone.

A download or export is not a leaf; it is a **boundary crossing**, and it is
recorded as one. That is precisely what determines whether Article 19
notification of recipients is possible or falls under "disproportionate effort",
which is the question the practice actually has to answer.

One thing this constrains: a private individual forwarding data to a friend is
very likely within the household exemption (Art 2(2)(c)), so **no obligation can
be imposed on the recipient — only cooperation requested.** Another reason the
outside-the-boundary answer is "ask", and the inside answer cannot be.

## 7. The remnant

Not "tombstone". No emoji.

**In the Vault**, a withdrawn document leaves an entry in its place — named for
the original, marked withdrawn, carrying the neutral reason, when it was
visible, whether it had been opened, and the clinician's message where one was
sent. An incident record standing where the document was, so the history is
followable rather than a gap.

**In a clinical series**, a withdrawn value leaves a remnant in its position,
linked to the same incident record. Both the patient and any clinician reading
the chart see why the value is not there, which is what lets a prescriber act
correctly instead of wondering.

**The patient's own note** against a removed value survives and attaches to the
remnant. Their words are theirs. Clinician and patient both see the remnant and
the note, and settle it between themselves — the same as any real-world
correction between a doctor and a patient.

**What the patient is told, once**, in the notice and the audit trail: what was
removed, why, that it was not theirs, and what to do if they shared it or acted
on it. Never who the other patient was.

## 8. Why this is patient-first, not only compliance

The reason the platform removes wrongly-disclosed data is not that a regulation
requires it. It is that **both patients are ours to protect**, and the removal
serves both:

- **The person whose data it was** has had their most private information put in
  front of a stranger. Leaving it there because removing it is awkward is
  choosing the convenience of the platform over the dignity of a patient.
- **The person who received it** did not ask for someone else's diagnosis and
  should not have to carry it. Receiving information about a stranger's illness
  is not neutral — it can be distressing, and it puts them in a position they
  never chose.

Stating it this way matters for the public documentation. "GDPR requires it"
invites the reader to see compliance theatre. "We will not leave one person's
private health information sitting in another person's record, and we will tell
you when it happens" is the same rule and the actual reason.

## 9. Regulatory references

Reasoned from; to be confirmed with counsel.

**GDPR**

| Article | Bearing on this design |
|---|---|
| 2(2)(c) | Household exemption — a private individual forwarding to a friend is likely out of scope, so no obligation can be imposed on them |
| 4(12) | A personal data breach includes *accidental* disclosure — a misfiled document qualifies |
| 5(1)(f) | Integrity and confidentiality; the basis of the containment duty |
| 9(2)(h) | Health and treatment processing — the lawful basis for retaining clinical records |
| 15(1)(c) | The data subject may ask who the recipients were |
| 16 | Rectification — the patient can correct inaccurate information |
| 17(1) | Erasure |
| 17(3)(b),(c),(e) | Exceptions: legal obligation, public-health, and legal claims — why a patient **cannot** demand deletion of a clinician's legitimate assessment or the evidentiary history of care |
| **18(1)(a)–(d), 18(2)** | **Restriction of processing** — the legal name for the remnant: retained, marked, excluded from use. 18(1)(a) covers contested accuracy; 18(2)'s exception "for the protection of the rights of another natural person" fits the wrong-patient case exactly |
| 19 | Notify recipients of rectification, erasure or restriction, unless impossible or disproportionate — the reason the containment boundary is worth recording |
| 28(3)(f) | Processor assists the controller with Arts 32–36; containment executed on instruction is processor behaviour |
| 33(1), 33(2) | Controller notifies the supervisory authority within 72 hours; processor notifies the controller without undue delay |
| 34 | Communication to the data subject where the risk is high |
| 82(2) | Direct processor liability where it breaches processor obligations or acts outside lawful instructions |

**HIPAA** — Business Associate status (45 CFR 160.103); Breach Notification
Rule (45 CFR 164.400–414), with the BA notifying the covered entity; right of
access (164.524); amendment (164.526), which like GDPR permits amendment rather
than deletion of a clinical record.

**Guidance and practice** — EDPB Guidelines 9/2022 on personal data breach
notification, which treat misdirected correspondence as a confidentiality
breach and contemplate asking an erroneous recipient to return or destroy the
information. COPE retraction guidelines are the closest mature analogue for
derived work: a retracted paper is not deleted, and work citing it is flagged
rather than withdrawn — which is why corrections flag and only the
wrong-patient case removes.

## 10. What is built, designed, and still open

**Built.** `document_retraction_events` with the full evidence record; reason
codes carrying both a neutral patient sentence and an audit framing; authority
rising with age (sender → sender with reason → declared incident, with an
emergency route); concealed person references; withdrawal of chat attachments
enforced in the storage policy; the objection with no adjudication fields; the
practice register.

**Designed, not built.** Splitting correction from privacy incident into two
acts; the document link on derived values; restriction as a state distinct from
active and erased; the remnant in a clinical series; the change notice; the
clinician's apology-and-request message; "did it propagate" in the exposure
assessment; the public statement of the single removal exemption.

**Settled in discussion and worth recording as settled.** A re-sent document is
a new document — its values are approved fresh and dated to the reading, with
no reactivation of anything restricted. A patient's note survives on the
remnant. There is no time horizon on wrong-patient removal. Withdrawal remains
possible after a patient disconnects, because containment cannot depend on an
ongoing relationship.

**Still open.** Whether the public documentation states the exemption in the
guide, the terms, or both — and the wording, which needs counsel.
