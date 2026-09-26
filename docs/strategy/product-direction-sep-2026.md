# Product direction — September 2026

A summary of the product conversations held after the September build work, from the
clinician-vs-patient UI comparison onward. It turns them into actions for OneCare (Part A) and
records the separate prescription-verification product (Part B) for a later, separate project.

Status keys: **Built**, **Needs checking**, **Next**, **Later**, **Dropped**.

---

## Part A — OneCare platform

### A1. Look and layout (clinician side)

**What we decided**
- Patients keep the warm cream brand look and the current 4-pillar layout. They mostly use a
  phone once or twice a day, and the warm look feels calm rather than clinical.
- Clinicians get a choice instead of a forced change. Both options live under
  **Settings → Preferences → Look & layout**:
  - Colour theme: *Warm Sanctuary* (current) or *Crisp Console* (founder-console paper and
    charcoal look, where red and amber alerts stand out more).
  - Navigation on larger screens: *Top tabs* (current two stacked bars) or *Side panel*
    (collapsible list down the left, like the founder console, freeing about 130–140px of height).
- Phones do not change. They keep the bottom bar and menu for one-handed use on ward rounds.
- We did not offer a phone layout choice: a top bar and a side panel both work badly on a phone,
  and keeping two phone layouts would double testing on every new feature.

| Item | Status |
| --- | --- |
| Theme choice in Settings | Built |
| Side panel choice in Settings, with collapse | Built |
| Click through every clinician page in side panel mode, signed in, to check spacing | Needs checking |
| Decide whether either option becomes the default after trying both | Next |
| Tablet split view (patient list on the left, chart on the right) | Later |

### A2. Problems found when looking at the platform as a clinician and as a patient

| Problem | What to do | Status |
| --- | --- | --- |
| The patient chart has 14 tabs, which is too much in a 10-minute consult | A one-page "at a glance" summary as the first thing a clinician sees | Next |
| Family members' adherence and instructions only show for the main account | Make them work for family members too. Family health is currently switched off, so this waits for delegated access to be designed | Later |
| Scribe audio can stop when a phone screen locks | Keep the screen awake while recording and recover dropped sections | Next |
| Finding a patient or page takes several clicks | Search everywhere (see A3) | Next |

### A3. New features we agreed to pursue

**1. Search everywhere (Cmd + K, plus a search button on phones)**
- One box that finds patients, pages, messages, documents and actions.
- Results obey the same access rules as the rest of the app: a front desk user never sees
  clinical notes, and a clinician only sees patients they have access to.
- Opening a patient from search is recorded in the audit trail.
- Patients get their own version that searches only their own record and the help pages.
- Main risks: leaking something through search results that the person could not otherwise open,
  and slow results on large hospitals. Search must be checked on the server, not only hidden on
  screen.
- Status: **Next**. First item to build.

**2. WhatsApp two-way messaging**
- A clinician's message in OneCare also reaches the patient on WhatsApp. The patient's WhatsApp
  reply appears back in the OneCare conversation.
- Needs: a WhatsApp provider (the connection is only prepared today, nothing is sent), approved
  message templates, patient opt-in, and a way to stop.
- Main risks: medical details sitting on a phone others may see, WhatsApp's 24-hour reply window,
  wrong number linked to a patient. Default to a short notice ("You have a new message from your
  care team") with the full text optional and only after the patient agrees.
- Status: **Next**, after search. Blocked on choosing a provider.

**3. Voice logging by WhatsApp (readings and doses without opening the app)**
- A patient sends a voice note or text ("blood pressure 130 over 85", "took my metformin").
  OneCare turns it into a reading or dose record and replies to confirm.
- Nothing is saved until the patient confirms. Every entry is marked as coming from WhatsApp.
- Uses the WhatsApp connection from item 2.
- Status: **Later**, after item 2.

**4. Telehealth with the scribe built in**
- Video visits inside OneCare with a one-tap join link, no separate Zoom account.
- The scribe listens during the call and drafts the visit note for the clinician to review.
- Needs: a video provider, recording consent from both sides at the start of each call,
  poor-connection handling (audio-only fallback). See `docs/plans/telehealth-plan.md`.
- Better dictation (WisprFlow-style, accurate and fast in any text box) belongs here too: the
  live scribe and dictate button already exist and should be improved rather than rebuilt.
- Status: **Later**. Already on the roadmap; groundwork can start now.

**5. Clinician voice memo on a patient's chart**
- A quick recorded note attached to a patient, turned into text the clinician can edit.
- Status: **Next**, small and reuses the scribe.

**6. Critical reading escalation**
- When a reading is dangerous and nobody acknowledges it in time, it moves up: care team first,
  then a named caregiver if the patient agreed to that.
- Status: **Later**. Needs the patient's consent for caregiver alerts and clear wording that
  OneCare is not an emergency service.

### A4. Dropped or reshaped because of medical or legal risk

| Idea | Decision | Why |
| --- | --- | --- |
| AI writes discharge instructions and sends them to the patient | **Dropped** as automatic. Allowed only as a draft the clinician edits and signs before it reaches the patient | Wrong doses or missing warnings would be the platform's fault |
| Prescriptions that pharmacies scan and fill inside OneCare | **Moved to a separate product** (Part B) | It is pharmacy regulation, not care continuity, and would bloat OneCare |
| Medication summary after a visit | **Kept**, as a copy in the patient's Vault, labelled "Clinical record copy — not a pharmacy prescription" | Useful to patients with no pharmacy liability |

### A5. Suggested build order

1. Check the side panel and theme options on every clinician page; pick defaults.
2. Search everywhere (clinician first, then patient).
3. At-a-glance patient summary.
4. Scribe keeps working when the screen locks; clinician voice memo.
5. WhatsApp two-way messaging (once a provider is chosen).
6. Voice logging by WhatsApp.
7. Telehealth with the scribe.
8. Critical reading escalation.

Still open from earlier go-live work, and not replaced by the above: live Stripe keys and
webhooks, email sending domain, the EHR private-server address list, the remaining database
security warnings, and the five-role walkthrough.

---

## Part B — Separate product: prescription verification network

Kept outside OneCare on purpose. OneCare can be its first user, but the product is its own
company-scale project.

### B1. The problem
- In Nigeria and similar markets most prescriptions are paper with a handwritten signature.
  They are easy to forge, can be used at several pharmacies, and the doctor never learns whether
  the medicine was collected.
- The US (Surescripts) and Canada (PrescribeIT, provincial systems) already have electronic
  networks. Nigeria and most of Africa do not.
- Pharmacies there mostly use simple stock and till software (local products or spreadsheets),
  and many have nothing beyond a till and a paper book.

### B2. How it would work
1. The doctor issues the prescription in OneCare (or any connected system). It gets a unique,
   signed code printed as a QR code on paper or sent to the patient's phone.
2. The pharmacist scans it. The network shows whether it is genuine, still valid, and what has
   already been given out.
3. The pharmacist marks it filled (fully or partly). Scanning it anywhere else then shows it as
   used, which stops double dispensing.
4. If more is needed, the pharmacy asks through the network and the hospital is notified to
   issue a new one. The doctor sees what was collected.

### B3. Working with the pharmacy's existing system (no second screen)
| Level | How it works | Effort for the pharmacy |
| --- | --- | --- |
| 1. Scanner only | The existing barcode scanner reads the QR code and types the medicine details into their current software like a keyboard | None. Works with any computer |
| 2. Small helper app | A light app next to their software that checks the code and marks it filled | Install once |
| 3. Direct connection | Their stock software talks to the network, so a scan also lowers stock and records the sale | Done by their software supplier |
| Pharmacies with no computer | A phone web page to scan and mark filled | None |

### B4. Who to partner with
- **Pharmacy software suppliers** first: each one brings hundreds of pharmacies at once.
- **Pharmacy chains** for early proof (a few big names make others follow).
- **Regulators and professional bodies** (in Nigeria: Pharmacy Council of Nigeria, NAFDAC,
  NHIA; similar bodies elsewhere) for approval and, ideally, recognition as a trusted network.
- **Health insurers (HMOs)**, who gain most from stopping fraud and may pay for it.
- Individual pharmacies only where no supplier covers them.

### B5. Rough numbers (Nigeria, illustrative)
- Assumes a ₦50 fee per verified prescription.
- Roughly 120–160 million outpatient visits a year; if a fraction becomes digital prescriptions:
  - 10 million a year ≈ ₦500 million
  - 50 million a year ≈ ₦2.5 billion
  - 100 million a year ≈ ₦5 billion
- More income from insurer fraud checks, refill requests, and anonymised supply insight sold to
  manufacturers (only with strict privacy rules and regulator approval).
- Other countries add similar volumes at local prices. These are planning estimates, not a
  forecast; they need checking against real prescription volumes.

### B6. Risks
- Being treated as a regulated pharmacy or data network: needs legal advice before launch.
- Pharmacies ignoring it if it slows them down at the counter.
- Network trust: downtime means pharmacies cannot dispense, so it must keep working offline and
  be very reliable.
- Forged or photocopied QR codes: the code must be signed and checked online each time.

### B7. Suggested path
1. **Inside OneCare first**: signed QR prescriptions from partner hospitals, a phone scanning page
   for a handful of partner pharmacies, filled status shown back in the chart.
2. **Then spin out**: open the network to other hospitals and software, sign software suppliers,
   seek regulator recognition, then expand country by country.
