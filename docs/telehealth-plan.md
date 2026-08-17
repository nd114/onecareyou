# Telehealth Plan — asynchronous first, video last

Status: **logged, not started.** To be revisited later. Nothing in this document
is scaffolded into the current build; it is written down so the sequencing
decision does not have to be re-argued when the question comes back.

---

## 1. What exists today

Checked against the codebase in August 2026, not assumed.

**There is no synchronous consult capability.** No video, no WebRTC, no
scheduling, no appointment model. The only `video` in the codebase is the camera
feed for the medication scanner. "Appointment" appears as a *guidance category
label* and in marketing copy. The platform's own patient copy currently says "no
appointments needed for updates" — which is accurate, and worth keeping in mind
before anything here is announced.

**What does exist is asynchronous telehealth, and quite a lot of it:**

| Capability | State |
| --- | --- |
| Secure patient↔clinician messaging with attachments | Built |
| Clinician guidance with due dates and acknowledgement | Built |
| Remote vitals monitoring with per-patient alert rules | Built |
| Encounters + ambient scribe | Built (in-person documentation) |
| Private doctor share — described in the docs as "the pathway for telehealth, second opinions and private consults" | Built as a *sharing* pathway; no consult mechanics |

So the honest position, and the one to use externally: OneCare does
**store-and-forward telehealth and remote patient monitoring** today. It does not
do **synchronous consults**. Those are two different regulated products, and the
gap between them is much bigger than a video widget.

---

## 2. The build order

Each phase is independently shippable and independently valuable. The order is
deliberate: every phase below is a prerequisite for the one after it, and video
is last because it is the only one that cannot be done well without the others.

### Phase 1 — the asynchronous consult as a first-class object

*Small, high value, no new compliance surface.*

Today an async consult is an unstructured message thread; nothing distinguishes
"what should I do about this rash" from "thanks, received". Make it a thing:

- a patient submits a question with a category and optional photo;
- it enters a queue with a stated response-time expectation;
- a clinician answers;
- it closes, and the exchange is retained as part of the record.

This is mostly UI over messaging that already exists, and it matches how care in
our launch markets actually happens. It is also the phase that makes the
"telehealth" claim concrete without any regulatory exposure that is not already
present.

### Phase 2 — scheduling

An appointment object — patient, clinician *or department*, time, mode, status —
plus reminders through the existing notification path, and hospital-side
visibility so a department can see its own diary.

Video needs this. But it is worth building on its own for **in-person** visits,
which is what the hospital tenant will actually ask for first. Build it against
the department model that already exists.

### Phase 3 — synchronous video

Only after 1 and 2. The build itself is modest **if you buy the transport** —
Daily, Twilio Video or LiveKit. Do not build WebRTC signalling in-house.

What is not modest:

- **Bandwidth reality.** Video consults in Nigeria will fail often. Audio-only
  is not a fallback nicety, it is the primary path; the flow must degrade to it
  automatically rather than failing and asking the patient to retry.
- **Regulatory.** Remote prescribing rules, cross-border licensing when a doctor
  in one country consults a patient in another, and the fact that a consult
  creates a documented clinical encounter (it does).
- **Recording.** A recorded consult is a record, with retention, consent and
  access rules attached. The existing model keeps transcripts and does not keep
  recordings — keep that, and do not let a video vendor's defaults quietly
  change it.
- **Billing.** Who pays, how, and what happens when the connection drops halfway
  through a paid consult.

### Phase 4 — triage and routing

Symptom intake that routes to the right department, sitting on the department
model already built. Naturally follows scheduling; not worth starting before it.

---

## 3. Recommendation

Do **Phase 1** when this comes back round. Do **Phase 2** with the hospital's
input, since they are the ones who will live in the diary. Treat **Phase 3** as a
separate product decision with its own scoping — including an explicit
conversation with the hospital about whether they want consults happening on our
platform or theirs.

Async consults plus remote monitoring is a defensible telehealth claim today.
Video without scheduling, without an audio fallback and without a regulatory
answer would be a demo, not a product.

---

## 4. Open questions to settle before Phase 1 starts

- Does an async consult create a billable event, and if so on which pricing tier?
- Response-time expectation: is it set per hospital, per clinician, or platform-wide?
- Does an unanswered consult escalate, and to whom?
- Does the consult thread belong to the patient's record permanently, or is it
  correspondence? (This decides retention and export behaviour.)
