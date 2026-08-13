# Patient guide

How every patient-facing part of OneCare works, in the order a new patient meets it.

## 1. Getting started

1. **Sign up** at `/sign-up` with email + password, or with Google. Email confirmation is required.
2. **Onboarding** collects name, date of birth, country (sets emergency numbers and units) and
   optional conditions and allergies.
3. **Install the app** — `/install` explains adding OneCare to the home screen. The patient app is a
   mobile-first PWA; it launches straight into Today.

Patients never see clinician or admin surfaces; role-aware guards redirect on every protected route.

## 2. The four pillars

Navigation is four pillars with sub-tabs beneath the header.

### Today
- Wellness routine for the day: medication times, appointments, tasks.
- Catch-up reminders for anything missed, never framed as failure.
- Alerts raised by the patient's own thresholds or by a clinician's rules.
- Quick actions: log a vital, mark a dose, add a document.

### My Health
- **Vitals** — blood pressure, heart rate, glucose, weight, temperature, oxygen saturation. Default
  view is the last 90 days, with trend charts, stats and an expandable chart modal. Each reading
  shows its source (self-entered, clinician-recorded, imported).
- **Medications** — name, dose, times, start/end dates, prescriber. Includes a scanner (photograph a
  pack, OCR fills the form), international drug resolution, interaction checking, and discontinuation
  with a reason. Expired medications deactivate automatically.
- **Health Vault** — documents with type, date, tags and AI summaries. Lab reports can be parsed into
  vitals. Care-record snapshots (see §5) also live here and cannot be deleted.
- **Adherence** — a plain-language report of doses taken over time, exportable.

### Care Team
- **Messages** — threads with each connected clinician, attachments supported. Threads stay readable
  after a relationship ends, but become read-only.
- **Care Circle** — who can see what:
  - *Clinician shares*: invite or accept an individual clinician, choose data categories
    (medications, vitals, documents, guidance) and whether they may record on the chart.
  - *Institution shares*: enter a hospital code and pick the categories to share with that
    institution; only clinicians assigned to the patient inside that institution can open the record.
  - *History*: every grant, change and revocation, with timestamps.
- **Family** — profiles for dependants with a global active-member switcher in the header. Documents,
  medications and vitals are per-member; messages and adherence stay on the primary account.
- **Caregivers** — delegated access with a scoped ability to add records on the patient's behalf.

### Learn
- **Ask AI** — the assistant. It can explain records, navigate to a screen, and *propose* changes.
  Nothing is written until the patient taps Approve, and the assistant is not allowed to claim it
  changed something it did not. Voice dictation transcribes first so the patient can proofread before
  sending. Files can be uploaded in the chat and are filed into the Vault.
- **Simple Mode** (`/assist`) — a full-page, text-only conversational shell over the same assistant,
  read-and-navigate only. Built for patients who find dashboards hard.
- **Knowledge Base** — plain-language explainers.

## 3. Consent and privacy

- AI features require explicit granular consent, captured per capability and revocable in Settings.
- Personally identifying details are de-identified before any external AI call.
- Avatars are private by default; sharing a photo with a clinician is an explicit choice.
- Data is encrypted at rest (AES-256) and in transit (TLS). There is no end-to-end encryption,
  because clinicians need server-side features — this is stated plainly in the privacy policy.
- **Settings → Audit trail** shows the patient every access to their record: who, when, what.

## 4. Offline behaviour

Vitals, medication actions and schedule changes made without a connection are queued locally and
sent when connectivity returns; a banner reports pending items and confirms when the queue drains.
Dashboard, vitals and medication reads are served from cache while offline.

## 5. Ending a relationship

Disconnecting a clinician or institution revokes future access immediately, but nothing is deleted.
OneCare files an immutable, watermarked **care record snapshot** of that clinician's messages and
guidance into the Vault, so the patient keeps the legal history. Snapshots cannot be deleted.

## 6. Plans and storage

Tiers, prices and limits come from `src/lib/pricing-constants.ts` and are shown on `/pricing`. Free
accounts include 500 MB of Vault storage; premium includes 10 GB. Usage is visible in Settings.

## 7. Support answers to common questions

- *"My clinician shows as an email, not a name."* The clinician has not completed their profile;
  names appear as soon as they do.
- *"A date looks one day off."* Fixed — date-only values are parsed in local time via
  `src/lib/date-only.ts`. Report any remaining case with a screenshot.
- *"I removed a clinician; why can I still see the thread?"* Legal preservation. It is read-only.
- *"Can the assistant change my medication?"* It can propose changes. The patient approves. It never
  changes doses and never diagnoses.
