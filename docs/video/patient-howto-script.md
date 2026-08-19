# OneCare for patients — how-to narration script

Source of truth for the voiceover in `remotion/pipeline/beats.patient.json`. Edit the narration lines there (or here and copy across) before audio is rendered — each line becomes its own MP3, and its duration sets how long the matching on-screen action lingers.

- Demo account: `demo-patient-1@onecare.you`
- Beats: 21
- Estimated runtime: ~283s (~4.7 min)

## Welcome

### 1. OneCare — patient walkthrough  `p-intro`

On screen: open `/`, hold 1.2s, scroll to 500px

> Welcome to OneCare. In the next few minutes you'll see exactly how a patient keeps their whole health record in one place, and decides who gets to see it.

_~11.6s_

## Getting started

### 2. Sign in at /sign-in  `p-signin`

On screen: open `/sign-in`, hold 1.5s

> You sign in with your email and password, or with Google. New accounts confirm their email first, then onboarding asks for your name, date of birth and country, which sets your units and emergency numbers.

_~14.0s_

## Today

### 3. Today — your wellness routine  `p-today`

On screen: open `/dashboard`, hold 2.0s, scroll to 380px

> This is Today. Your wellness routine for the day sits at the top: medication times, appointments and tasks. Anything missed becomes a catch-up reminder, never a scolding.

_~10.8s_

### 4. Quick actions and alerts  `p-today-quick`

On screen: scroll to 800px, hold 1.5s, scroll to 1200px

> Alerts raised by your own thresholds, or by a clinician's rules, appear here too. And quick actions let you log a vital, mark a dose or add a document without hunting through menus.

_~13.2s_

## My Health

### 5. Vitals — 90-day view  `p-vitals`

On screen: open `/vitals`, hold 2.2s, scroll to 420px

> Under My Health, Vitals covers blood pressure, heart rate, glucose, weight, temperature and oxygen saturation. The default view is your last ninety days, with trends and statistics.

_~10.8s_

### 6. Every reading shows its source  `p-vitals-log`

On screen: scroll to 900px, hold 2.0s

> Every reading records where it came from — entered by you, recorded by a clinician, or imported from a hospital system. That provenance is what makes the record trustworthy at the next appointment.

_~13.2s_

### 7. Medications  `p-meds`

On screen: open `/medications`, hold 2.2s, scroll to 420px

> Medications hold the name, dose, times, dates and prescriber. You can photograph a pack and let the scanner fill the form, and OneCare resolves drug names internationally rather than assuming one country's brand names.

_~13.6s_

### 8. Interaction checking  `p-meds-interactions`

On screen: scroll to 900px, hold 2.0s

> Interactions are checked across everything on your list, and stopping a medicine asks for a reason so the history stays honest. Expired courses deactivate on their own.

_~10.8s_

### 9. Health Vault  `p-vault`

On screen: open `/health-vault`, hold 2.2s, scroll to 400px

> The Health Vault is where documents live — discharge summaries, labs, letters — each with a type, a date, tags and a plain-language AI summary. You can group them into folders, and lab reports can be parsed straight into your vitals.

_~16.4s_

### 10. Open and share a document  `p-vault-viewer`

On screen: scroll to 700px, hold 2.4s

> Documents open right inside the app, in light or dark mode, and download as a clean PDF. Sharing a single document creates a link that expires in five minutes, so nothing leaks quietly.

_~13.2s_

### 11. Adherence report  `p-adherence`

On screen: open `/adherence`, hold 2.2s, scroll to 450px

> Adherence turns all of those doses into a plain-language report you can export and hand to a clinician — no percentages without context, just what was taken and when.

_~11.6s_

## Care Team

### 12. Messages  `p-messages`

On screen: open `/messages`, hold 2.2s

> Care Team starts with Messages: a thread with each connected clinician, attachments included. If a relationship ends, the thread stays readable, but becomes read-only.

_~9.6s_

### 13. Care Circle — who sees what  `p-carecircle`

On screen: open `/care-circle`, hold 2.2s, scroll to 380px

> Care Circle is the heart of it. You invite an individual clinician and choose the categories they see — medications, vitals, documents, guidance — and whether they may record on your chart.

_~12.8s_

### 14. Institution shares and history  `p-carecircle-hospital`

On screen: scroll to 850px, hold 2.2s

> For a hospital you type its code and pick the same categories, and only the clinicians actually assigned to you inside that hospital can open the record. Every grant, change and revocation is listed with a timestamp.

_~14.8s_

### 15. Family and caregivers  `p-family`

On screen: open `/family`, hold 2.2s, scroll to 380px

> Family profiles let you track a dependant with a switcher in the header — documents, medications and vitals follow the member you've selected. Caregivers get delegated access, scoped so they can add records on your behalf.

_~14.4s_

## Learn

### 16. Ask AI  `p-ai`

On screen: open `/ai`, hold 2.4s

> Under Learn, Ask AI explains your own records in plain language, and can take you straight to a screen. It can propose a change — but nothing is written until you tap Approve.

_~13.2s_

### 17. Propose, then approve  `p-ai-approve`

On screen: hold 1.4s, scroll to 300px, hold 1.6s

> You can dictate a question and proofread the transcript before it sends, and upload a file mid-conversation, which is filed into your Vault. The assistant never claims it changed something it didn't.

_~12.8s_

### 18. Simple Mode at /assist  `p-simple`

On screen: open `/assist`, hold 2.4s

> Simple Mode is a full-page, text-only version of the same assistant for anyone who finds dashboards hard. It only reads and navigates — it never writes.

_~10.4s_

## Privacy

### 19. Settings — consent and audit trail  `p-privacy`

On screen: open `/settings`, hold 2.2s, scroll to 600px

> AI features need explicit, granular consent, and you can revoke it in Settings. Identifying details are removed before any external AI call, data is encrypted at rest and in transit, and the audit trail shows every access to your record: who, when, and what.

_~17.6s_

## Everyday

### 20. Offline and installable  `p-offline`

On screen: open `/install`, hold 2.2s, scroll to 400px

> Vitals, doses and schedule changes made without a connection are queued and sent when you're back online, with a banner that confirms when the queue clears. And the patient app installs to your home screen from the install page.

_~15.6s_

## Closing

### 21. onecare.you  `p-outro`

On screen: open `/dashboard`, hold 2.4s

> That's OneCare: one record you own, shared exactly as far as you choose, and a care team that can finally see what happens between visits.

_~10.0s_
