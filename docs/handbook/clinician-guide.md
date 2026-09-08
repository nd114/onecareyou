# Clinician guide

How the clinician surface works, for clinical partners, onboarding and sales engineering.

## 1. Accounts and access

- Clinicians sign up at `/clinician/sign-up`, complete a profile (name, title, specialty, licence,
  country) and sign the BAA before patient data is exposed.
- A clinician can work solo or belong to a practice/institution. Solo clinicians see a reduced
  Practice page — enterprise-only cards are hidden entirely.
- Session timeout is 30 minutes of inactivity (HIPAA), based on real activity events.

## 2. The four pillars

### Today
One unified inbox, ordered by urgency: vital alerts, unread patient messages, guidance awaiting a
reply, and open practice tasks. Everything is actionable in place. There is no separate "Alerts"
screen — that duplication was removed.

### Patients
- A simple paginated, searchable list. Open a patient for the detail view; nothing dense is shown at
  list level.
- Three kinds of patient appear here:
  1. **Connected patients** — the patient granted this clinician a private share.
  2. **Institution patients** — the patient shared with the institution and this clinician is
     assigned to them.
  3. **Managed records** — charts the practice keeps for patients with no OneCare account, created
     manually or via CSV import, with duplicate detection.
- Patient detail shows medications, vitals, documents, guidance, encounters and internal notes,
  limited to the categories the patient shared.
- Managed records have their own chart page: visits log, vitals, medications and a printable clinical
  summary.

### Communicate
- **Messages** — threads per patient, attachments supported.
- **Guidance** — structured instructions with a status the patient can respond to; DB-backed
  templates and specialty packs speed this up.
- **Dictations & scribe** — record or upload audio, get a transcript, then an AI-drafted SOAP note
  attached to an encounter. The clinician edits and signs; nothing is filed unsigned.
- **Referrals** — intra-OneCare referrals to another clinician on the platform.

### Practice
Cards appear according to the member's capabilities:
- **Team** — invite members, assign roles (owner, admin, provider, staff, clinician, nurse,
  front desk, billing, read only), remove members.
- **Institution patients** — patients who shared with the institution, and assignment of each to
  specific clinicians.
- **Hospital code** — the institution's short code that patients type to connect, with an
  availability check.
- **Storage & durability** — pooled usage against the tenant allowance, with pack upgrades.
- **Revenue share** — the agreed share for partner institutions.
- **Subscription**, **EHR connections**, **branding**.
- **Ownership invitations** — if OneCare invited this person to own the tenant, the invitation is
  accepted here.

Practice is its own destination, separate from Settings — it is where the practice is run, not
configured.

## 3. Tasks, encounters, templates, audit

- **Tasks** — practice-level work items with assignee, due date and status.
- **Encounters** — the clinical unit of work: type, time, participants, SOAP content, sign-off.
- **Clinical templates** — reusable guidance and visit structures, per practice.
- **Audit** — who accessed which patient and when, exportable as a one-click compliance pack.

## 4. Clinician AI assistant

The assistant reads only what the clinician can already read, and works propose → approve → apply:

1. The clinician asks for something ("draft guidance for this patient's BP trend").
2. The assistant returns a proposal card with the exact payload.
3. On approval the action is applied and written to `patient_action_log`.

It never writes first, never prescribes, and cannot act on patients outside the clinician's access.

## 5. Alerts

Clinician alert rules define thresholds per patient or cohort. Breaches raise entries in Today and,
where configured, notifications. Patient-side care alerts are separate and patient-owned.

## 6. Enterprise notes

- Institution consent is one object (`practice_shares`) and assignment is another
  (`practice_patient_assignments`) — sharing with a hospital does not expose the record to every
  clinician in it.
- Storage is pooled at tenant level and billed to the tenant.
- Whitelabelling and `<slug>.onecare.you` subdomains: slug management ships in the app; wildcard DNS
  and certificates are a hosting task. **(coming soon)** for the branded domain itself.
- Connected EHR write-back is deliberately out of scope until partner agreements exist; import and
  provenance are live.

## 7. The patient chart

Fifteen tabs deep, with an **action rail** that sticks under the header as you scroll. It carries
Send guidance and Set alert, and a menu with Start encounter, Add task, Refer, Message and My notes.

Once the page header scrolls out of view the rail reveals the patient's name and risk chip. That is
a safety feature rather than a convenience: writing an encounter note two screens down with nothing
on screen naming the patient is how wrong-patient documentation happens.

### The risk badge shows its working

Opening the badge gives the rule that produced the level against this patient's counts — "High
because 3 findings are outside their normal range: two or more moves the level up even with nothing
critical" — plus each finding with the range it breached and when it was taken.

It also names what it did **not** weigh. A measurement with no reference band in the engine
contributes nothing, and saying so is the difference between "we looked and it was fine" and "we
never looked". A cholesterol of 400 with no band would otherwise leave the badge reading Stable.

## 8. Dictation

Record up to ten minutes. The recording is transcribed, then summarised, and each is approved
separately before anything reaches a record.

- **Rename** a dictation at any time; the label no longer has to be typed before you press record.
- **Archive** rather than delete. A filed dictation is part of a patient's chart, and the database
  refuses to delete one.
- A recording that reaches the time limit is **saved**, not discarded, and you are told the limit
  was reached.
- "Approved" and "filed" are different states, and the badge says which.

## 9. Notifications

Per category rather than per channel. **Patient threshold alerts are always on** — you set those
thresholds because the reading matters, and a rule that can be muted from a settings page is a rule
you cannot rely on. They appear in the list marked as such, with the reason, rather than being
hidden.

## 10. Practice administration

### Departments
Create, rename, archive and (owner only) delete. Deleting requires the department to be archived
first, so no single action ends something people are working in, and the audit entry carries the
department's name, its membership with leads, and every patient routed there — because the delete
cascades through both tables and an entry saying only "department deleted" would point at nothing.

### Coverage
A tab that answers who is falling through the gaps between the rosters, worst first:

1. Patients sharing with you and assigned to nobody.
2. Patients not routed to a department.
3. Departments with no lead, and departments with nobody in them.
4. Clinicians carrying no patients.

Alongside it, owner KPIs and a caseload spread — median against average, busiest against lightest —
and a CSV carrying figures and findings together.

Two rules keep it from crying wolf. A gap is only a gap where the structure exists, so a practice
with no departments is not told its patients are un-routed. And only clinical roles carry patients,
so a receptionist assigned to nobody is a receptionist rather than an idle clinician.

### Assignment-first access
Off by default. Turned on by an owner or administrator, a clinician sees only the patients assigned
to them and the practice-wide view becomes an administrative right. Existing staff are narrowed at
the moment it is switched on, new staff inherit it, and both directions are audited.

It is off by default deliberately: at a practice where assignments have not been made, turning it on
empties every clinician's panel. Check the Coverage tab's unassigned count before switching.

### Patient records the practice creates
Authorized staff — clinical roles, administrators, and anyone with the invite capability — can
create records for people not yet on OneCare, and read the ones their practice made. Once a patient
claims a record it belongs to them and the practice stops editing it; corrections after that go
through the patient.

Where a practice has its own medical record number, store it in the record's MRN field. It is a
reference for reconciliation, not an identity: OneCare has one identity per person.

## 11. What the assistant will and will not do

It proposes; you approve. Nothing is sent or written until you do, every write runs under your own
session so row policies apply, and the approval is logged against your account.

It carries a line saying it is AI-generated and that clinical decisions, and everything written to a
record, remain yours.
