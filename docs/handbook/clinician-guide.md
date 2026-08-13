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
