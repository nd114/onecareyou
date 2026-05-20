# OneCare Tech & Process Opportunities (2025–2026)

Captured from the May 2026 housekeeping audit. These are things that didn't
exist or weren't viable when OneCare was first scoped. Use this doc when
prioritizing roadmap work and for clinician/investor narratives.

---

## 1. AI / model layer

| Opportunity | Why now | OneCare fit |
|---|---|---|
| **Ambient clinical scribe** (Whisper-3 / Gemini Live) | Real-time speech-to-SOAP is now <2s latency and HIPAA-deployable | Add to clinician patient detail: tap mic, get structured note + auto-tag vitals/meds mentioned. Massive time saver. |
| **Vision models for med reconciliation** | GPT-5 / Gemini 3 Pro Image read a pill bottle or hospital discharge sheet in one shot | Replace OCR + manual matching with a single vision call. We have `identify-pill` stub; expand. |
| **Voice-first patient entry (elderly)** | Web Speech API + Lovable AI is good enough now | "Hey OneCare, log my blood pressure" — huge for chronic-disease populations. |
| **Per-patient predictive risk scoring** | Small models can fine-tune on a patient's own vital trends | Surface in clinician `PatientRiskIndicator` with an explanation, not just a color dot. |
| **Auto-generated patient-friendly summaries** | Already have document summarization | Extend to: lab result → "What this means for you" card. |
| **Patient AI with medication knowledge** | Lovable AI Gateway supports tool/function-calling with our existing drug-lookup edge function | Give the patient assistant scoped access to drug interactions, side effects, and dosing — with safety constraints (no diagnoses, no prescription advice). |
| **Health news & breakthrough digest** | Public sources (FDA recalls, MHRA alerts, NIH announcements) + LLM summarization | Surface to patients: "A medication you take has a new safety advisory" or "New research on your condition." Build trust + retention. |
| **Conversational onboarding** | LLM extracts structured data from natural language | Replace 8-step form with "Tell me about your health" voice/text intake. |
| **Clinician copilot for guidance drafting** | Templates + LLM = personalized, fast | One-click "draft guidance based on this patient's recent vitals." |

---

## 2. Interop & data

| Opportunity | Why now |
|---|---|
| **SMART on FHIR launch from EHRs** | Epic and Cerner both support standalone+EHR-launch apps. OneCare can be installable from inside Epic, bypassing IT procurement. |
| **TEFCA / QHIN go-live (US, 2024–25)** | A QHIN intermediary (Particle Health, Health Gorilla) can pull a patient's history from ~90% of US providers via one API. Skip per-EHR integration. |
| **Apple Health + Google Health Connect** | Both expose vitals/medications via simple SDK now. One integration ≈ device coverage. |
| **Carequality + CommonWell** | Document exchange standards now reliable enough for production. |
| **Direct device webhooks** | Dexcom, Omron, Withings, iHealth all expose patient-authorized webhooks | Skip Validic-style middleware fee. |

---

## 3. Process / GTM (not tools)

| Opportunity | Description |
|---|---|
| **Clinician-led patient acquisition** | Stop selling to patients directly. Sell only to small clinics; they bring 50–500 patients each. CAC drops 10×. |
| **Specialty wedge** | Pick *one* specialty (cardiology, endocrinology/diabetes, post-discharge CHF) and own it. Generic "health tracking" loses to MyChart. Cardiology + diabetes both have measurable RPM CPT reimbursement codes — clinician sells himself. |
| **Reimbursement-aware features** | Map features to CPT codes 99453/99454/99457 (RPM), 99490 (CCM). Clinician revenue justification = our pricing justification. |
| **Open-source the patient-owned data model** | Publish the 4-model data-sharing schema as an open standard. Defensible IP + PR moment. |
| **Embedded BAA + click-through onboarding** | Solo practitioners hate paperwork. We're 80% there; finish + market as "Sign up in 5 minutes, BAA included." |
| **Public AI safety/transparency page** | Patients increasingly want to know what AI does with their data. Be first to publish a clear AI report card. |
| **"Patient bill of rights" charter** | Public document committing to: patient owns the record, right to export, right to revoke, plain-language consent. Marketing wedge + legal posture. |
| **Pharmacy partnership channel** | Independent pharmacies (vs CVS/Walgreens) have post-discharge med-rec workflows but no software. Bundle OneCare as their digital arm. |
| **University health center pilots** | Captive, tech-fluent populations. Single contract = thousands of users. Validates wedge cheaply. |
| **Caregiver-first persona** | Adult children of aging parents are an underserved user with high willingness to pay. Family plan + delegated-access framing already exists in DB. Market it directly. |

---

## 4. Defensive moves

| Risk | Mitigation |
|---|---|
| Apple/Google absorb the patient side | Lock in clinician installed base — they're sticky in a way consumers aren't. |
| SimplePractice adds patient-owned mode | Open-source schema + first-mover narrative + clinician switching cost. |
| Particle/Flexpa commoditize FHIR | Become the *best* consumer of those APIs; don't try to be the API ourselves. |
| Regulatory drift (HIPAA, GDPR, UK Data Protection) | Quarterly compliance review; published audit log; SOC 2 Type II within 12 months. |

---

## How this doc gets used

- During quarterly roadmap planning, score each opportunity on impact × effort × time-to-market.
- Whenever a clinician asks "what's coming next," pull from sections 1 and 3.
- Whenever an investor asks "what's defensible," pull from section 4.
- Update this doc when a row ships or when a new tech wave makes a row obsolete.

---

## 6. Additional opportunities (May 2026 follow-up)

Captured per audit §3 NB ("I think there are a few more we can bring in"). These extend the original catalogue without replacing it.

### 6.1 AI / model layer (additions)

| Opportunity | Why now | OneCare fit |
| --- | --- | --- |
| **Agentic patient triage** (multi-step tool-using agent) | Tool-calling models can now plan a 5–10 step workflow reliably with safety rails. | Patient says "I missed my BP meds twice this week" → agent checks adherence, drafts a note to the clinician, schedules a catch-up reminder, and proposes a Care Circle alert — all behind one confirmation. |
| **On-device speech (Whisper-3 / Apple Speech)** | iOS and Android both ship usable on-device ASR; Capacitor can bridge it. | Voice entry for elderly / low-vision patients without sending audio to any cloud. PHI never leaves the device. |
| **Multimodal lab report parsing** | Vision models now read scanned PDFs + photos of paper labs reliably. | Extends existing Health Vault summarization to paper labs and handwritten discharge sheets, not just clean PDFs. |
| **Personalized clinical decision support (CDS Hooks 2.0)** | The CDS Hooks standard is mature and now supported by Epic, Cerner, Athena. | Clinician-side: when opening a patient, fire CDS hooks for guideline-based suggestions (e.g. statin eligible, overdue A1c) sourced from the patient's own data. |
| **AI-generated patient education micro-content** | Cheap, fast, and explicitly allowed under HIPAA when generated from the patient's own record. | Turn each new med into a 30-second "what to expect this week" card; turn each lab into a "what changed since last time" card. |

### 6.2 Interop & infrastructure (additions)

| Opportunity | Why now |
| --- | --- |
| **FHIR Bulk Data ($export)** | All major EHRs now support population-level FHIR export. Enables practice-wide analytics without per-patient pulls. |
| **Verifiable credentials / SMART Health Cards** | Standardized way to issue tamper-evident records (vaccinations, lab results) the patient owns. Fits the patient-owned-data wedge. |
| **Passkeys / WebAuthn for clinicians** | Eliminates the 30-min-session-timeout pain point and the password-reset support load. |
| **Edge functions on a regional fly.io/Deno Deploy** | Lower latency for non-US patients without leaving the Supabase ecosystem; helps with global English-speaking expansion. |
| **Postgres pgvector for clinical search** | Already available in Supabase. Enables semantic search across a patient's documents and notes without standing up a separate vector DB. |

### 6.3 Process / GTM (additions)

| Opportunity | Description |
| --- | --- |
| **"Bring your own clinic" referral loop** | Every clinician who signs up gets a one-click invite link for their patient panel. Tracks attribution; pays out account credit on patient activation. Compounds the wedge story. |
| **Public quarterly "AI report card"** | Publish counts of AI calls, data retention, model versions, and any incidents. Differentiator vs every closed AI in healthcare. Pairs with the §3 "AI safety/transparency page" item. |
| **Specialty pilot program** | Recruit 5 cardiology or endocrinology clinics for a 90-day paid pilot. Hard outcome metric (e.g. days between visits → adherence delta). The case study unlocks the rest of the specialty. |
| **Embedded compliance pack** | Ship a downloadable HIPAA/SOC2-lite evidence pack for small-practice IT review. Removes the single biggest sales blocker for clinics with no IT department. |
| **Patient advocacy partnerships** | Partner with chronic-disease patient associations (ADA, AHA, etc.). They get a co-branded Care Circle; we get distribution to motivated patients. |
| **Open API for caregivers** | Documented read-only API that family members / hired caregivers can use with scoped tokens. Locks in the "delegated caregiver access" feature we already have. |

### 6.4 Captured NBs from the audit (cross-reference)

- AI Assistant medication knowledge base — see `docs/future-roadmap.md` → "NB items captured from May 2026 audit".
- Health news & medical updates feed — see same section.
