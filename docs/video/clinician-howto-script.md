# OneCare for clinicians — how-to narration script

Source of truth for the voiceover in `remotion/pipeline/beats.clinician.json`. Edit the narration lines there (or here and copy across) before audio is rendered — each line becomes its own MP3, and its duration sets how long the matching on-screen action lingers.

- Demo account: `demo-clinician-1@onecare.you`
- Beats: 21
- Estimated runtime: ~267s (~4.5 min)

## Welcome

### 1. OneCare — clinician walkthrough  `c-intro`

On screen: open `/for-clinicians`, hold 1.6s, scroll to 500px

> This is the clinician side of OneCare: a light surface for following patients between visits, without buying another electronic record system.

_~8.4s_

## Access

### 2. Sign-up, profile, BAA  `c-access`

On screen: open `/clinician/sign-up`, hold 2.0s

> Clinicians sign up, complete a profile with title, specialty, licence and country, and sign the business associate agreement before any patient data is exposed. Sessions time out after thirty minutes of genuine inactivity.

_~13.2s_

## Today

### 3. Today — one triage inbox  `c-today`

On screen: open `/clinician`, hold 2.4s, scroll to 400px

> Today is one unified inbox, ordered by urgency: vital alerts, unread patient messages, guidance awaiting a reply, and open practice tasks. Everything is actionable in place — there is no separate alerts screen to check.

_~14.0s_

### 4. Work the inbox in place  `c-today-scroll`

On screen: scroll to 900px, hold 2.0s

> You clear the list from the top down. Each row carries enough context to decide, and opens the patient only when you actually need the chart.

_~10.4s_

## Patients

### 5. Patients — paginated and searchable  `c-patients`

On screen: open `/clinician/patients`, hold 2.4s, scroll to 350px

> Patients is a simple paginated, searchable list. Nothing dense at list level: connected patients who granted you a private share, institution patients you've been assigned, and managed records for patients with no OneCare account.

_~13.6s_

### 6. Patient detail  `c-patient-detail`

On screen: open the first patient in the list, hold 2.6s

> Open a patient and you get medications, vitals, documents, guidance, encounters and internal notes — limited strictly to the categories that patient chose to share with you.

_~10.8s_

### 7. Vitals with provenance  `c-patient-vitals`

On screen: open the Vitals tab, hold 2.4s, scroll to 350px

> Vitals arrive with their source attached, so you can tell a home reading from a clinic reading from an imported one before you act on a trend.

_~10.8s_

### 8. Medications and documents  `c-patient-meds`

On screen: open the Medications tab, hold 2.2s, open the Documents tab, hold 1.8s

> Medications show what the patient is actually taking, not what was prescribed at discharge. Shared documents sit alongside, with AI summaries you can skim before the consultation.

_~10.8s_

## Communicate

### 9. Guidance the patient can answer  `c-guidance`

On screen: open `/clinician/guidance`, hold 2.4s, scroll to 350px

> Guidance is structured instruction with a status the patient can respond to, rather than a message that disappears into a thread. Templates and specialty packs make the common cases a few clicks.

_~12.8s_

### 10. Messages  `c-messages`

On screen: open `/clinician/messages`, hold 2.2s

> Messages are threaded per patient with attachments, and stay preserved for the record once a relationship ends.

_~6.8s_

### 11. Dictations and scribe  `c-scribe`

On screen: open `/clinician/dictations`, hold 2.6s, scroll to 350px

> Dictations and scribe take a recording or an upload, return a transcript, then draft a SOAP note against an encounter. You edit and sign it — nothing is filed unsigned.

_~12.0s_

### 12. Clinical templates  `c-templates`

On screen: open `/clinician/templates`, hold 2.2s

> Templates are reusable guidance and visit structures held at practice level, so a team writes the same instruction the same way every time.

_~9.2s_

## Assistant

### 13. Propose, approve, apply  `c-ai`

On screen: open `/clinician`, hold 1.4s, open the assistant, hold 2.6s

> The clinician assistant reads only what you can already read, and works in one direction: it proposes, you approve, then it applies and writes the action to the log. It never writes first, never prescribes, and cannot touch a patient outside your access.

_~17.2s_

## Practice

### 14. Tasks and encounters  `c-tasks`

On screen: open `/clinician/practice`, hold 2.4s, scroll to 380px

> Practice work items carry an assignee, a due date and a status. Encounters are the clinical unit — type, time, participants, SOAP content and sign-off.

_~10.0s_

### 15. Team and roles  `c-practice-team`

On screen: scroll to 800px, hold 2.4s

> Team is where you invite members and set roles — owner, admin, provider, nurse, front desk, billing, read only — and remove people who leave. Cards appear only for the capabilities a member actually has, so a solo clinician never sees enterprise clutter.

_~17.2s_

### 16. Institution patients and hospital code  `c-practice-institution`

On screen: scroll to 1250px, hold 2.4s

> Institution patients are those who shared with the hospital rather than one clinician; consent and assignment are separate, so sharing with a hospital never exposes a chart to everyone in it. The hospital code is the short code patients type to connect.

_~16.8s_

### 17. Storage and subscription  `c-practice-storage`

On screen: scroll to 1700px, hold 2.4s

> Storage and durability show pooled usage against the tenant allowance, with packs to upgrade, and the subscription, EHR connections and branding sit alongside. Practice is where the practice is run — Settings is only where it's configured.

_~14.8s_

### 18. Bulk onboarding  `c-import`

On screen: open `/clinician/patients/import`, hold 2.4s

> Managed records can be created one at a time or imported from a spreadsheet, with duplicate detection and an error file back so a bad row never silently disappears.

_~11.6s_

## Compliance

### 19. Audit trail  `c-audit`

On screen: open `/clinician/audit`, hold 2.4s, scroll to 350px

> Audit records who accessed which patient and when, exportable as a one-click compliance pack. Patients see the same trail from their side — the transparency runs both ways.

_~11.2s_

## Enterprise

### 20. Institutions  `c-enterprise`

On screen: open `/clinician/practice`, hold 1.8s, scroll to 1000px

> For institutions, storage is pooled and billed at tenant level, and whitelabelling with a branded subdomain is coming soon. Write-back into connected electronic records stays deliberately out of scope until partner agreements exist — import and provenance are live today.

_~16.0s_

## Closing

### 21. onecare.you  `c-outro`

On screen: open `/clinician`, hold 2.4s

> One inbox, one chart per patient, and a clear record of who did what. That's OneCare for clinicians.

_~7.2s_
