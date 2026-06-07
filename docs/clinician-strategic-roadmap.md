# OneCare — Clinician Strategic Roadmap

**Purpose:** capture clinician-side opportunities that are strategically valuable but **intentionally out of the current build scope**. This is the talk-track doc for investor/clinician conversations so we can credibly point at "we know about it and here's when" without scope-creeping engineering.

**Companion to:** `clinician-gaps-implementation-plan.md` (what we're building), `future-roadmap.md` (sequence), `tech-and-process-opportunities.md` (market catalog), `qhin-integration-plan.md` (interop), `.lovable/plan.md` (current sprint plan — Clinician Depth + PWA hardening).

---

## How to read this doc

Each item lists:
- **Pitch** — what we tell a clinician / investor it does.
- **Fit** — why it belongs in OneCare's wedge.
- **Why not now** — the concrete blocker (capability, regulatory, customer demand, dependency).
- **Trigger** — the signal that flips it from "strategic" to "build."

---

## 1. Ambient clinical scribe

- **Pitch:** Tap once, speak the visit, get a structured SOAP note + auto-tagged vitals/meds + a draft patient summary — all linked to the encounter.
- **Fit:** Sits naturally on top of our new `encounters` object (Phase 1.4) and the existing `clinician_dictations` flow. Hard differentiator vs SimplePractice/Practice Fusion.
- **Why not now:** Needs a higher accuracy bar than free-tier ASR provides; needs the Encounter object in production first; we want at least 5 paying clinicians to ground the prompt on real notes.
- **Trigger:** Phase 1.4 ships + ≥5 Pro-tier clinicians active.

## 2. e-Prescribe (Surescripts / EPCS)

- **Pitch:** Send prescriptions directly to the patient's pharmacy from the encounter.
- **Fit:** Closes the post-discharge workflow loop; major reason clinicians stay tethered to legacy EHRs.
- **Why not now:** Surescripts certification is multi-month + per-state DEA EPCS audits + identity proofing. Build cost is wildly disproportionate to paying-customer count at this stage.
- **Trigger:** Partner offering (e.g. DoseSpot, Rcopia) once we have a customer who will sign a paid contract conditional on it.

## 3. Lab & imaging orders

- **Pitch:** Order a lipid panel inside OneCare; results land in the patient's vault and pre-attach to the next encounter.
- **Fit:** Natural pair with QHIN-imported labs; matches our "one continuous record" wedge.
- **Why not now:** Order routing is Health-Gorilla / Quest / LabCorp territory; sequenced **after** Particle (read) is live and stable.
- **Trigger:** QHIN read path in production + a specialty pilot (cardio/endo) asking for it.

## 4. CDS Hooks 2.0 (clinical decision support)

- **Pitch:** Guideline-based suggestions on patient open (e.g. "statin eligible," "overdue A1c") drawn from the patient's own record.
- **Fit:** Compounds the Encounter + risk-explanation drawer (Phase 4.3) with evidence-backed prompts.
- **Why not now:** Requires structured Problem List + ICD-10 + a curated rule library. The data substrate isn't there yet.
- **Trigger:** Problem List + ICD-10 lookup ship (gap doc §"Cross-Role Missing Features").

## 5. SMART-on-FHIR launch from Epic / Cerner

- **Pitch:** OneCare appears as an app launchable from inside Epic.
- **Fit:** Bypasses IT procurement for hospital-system buyers.
- **Why not now:** QHIN gives us ~90% of the same data without per-EHR App Orchard fees and 12-week certifications. The asymmetry only flips if a specific buyer demands it.
- **Trigger:** Named hospital-system customer with a signed LOI.

## 6. External public API + webhooks

- **Pitch:** Programmatic access to patients/vitals/guidance for Enterprise customers.
- **Fit:** Enterprise differentiator (gap doc §12).
- **Why not now:** No paying enterprise customer has asked. Building API surface without users = ossifying the wrong abstractions.
- **Trigger:** Two Enterprise prospects request it during sales.

## 7. SLA dashboard & public status page

- **Pitch:** Real-time uptime + incident history at status.onecare.you.
- **Fit:** Required for any Enterprise contract with an SLA clause.
- **Why not now:** No SLA contracts in force. Better Stack / Statuspage can ship in a day when needed.
- **Trigger:** First signed Pro+/Enterprise contract with an uptime clause.

## 8. Telehealth video

- **Pitch:** Start a video visit from inside the encounter; recording attaches to the Vault.
- **Fit:** The Encounter object (Phase 1.4) is the anchor; without it, video is just another tab.
- **Why not now:** Partner (Daily.co / Twilio Video / Zoom Health) is the right buy-vs-build call; cost only justified when paying clinicians ask.
- **Trigger:** Phase 1.4 lands + ≥3 clinicians request it in feedback.

## 9. Patient device & pharmacy webhooks

- **Pitch:** Dexcom CGM, Omron BP, Withings scales push vitals into OneCare automatically; pharmacy refill status syncs to the medication card.
- **Fit:** Patient-side completeness story; reduces manual logging fatigue.
- **Why not now:** Each integration is per-vendor BAA + OAuth + normalization. Sequenced after QHIN read so we have a single normalization pipeline.
- **Trigger:** QHIN ingestion stable for 60 days.

## 10. Cross-practice referral network

- **Pitch:** Refer a patient to any OneCare clinician with one click; receiving clinician gets a scoped, time-boxed view and can accept into their panel.
- **Fit:** Compounds the wedge — every new practice increases the value of the network for the existing ones.
- **Why not now:** Needs the intra-practice referral object (Phase 2.5) as the substrate, plus a critical mass of practices to make discovery meaningful.
- **Trigger:** >5 paying practices live + Phase 2.5 shipped.

## 11. RPM / CCM revenue console

- **Pitch:** Per-patient timer + auto-suggested CPT codes (99453/99454/99457, 99490) at month-end, with one-click claim export.
- **Fit:** Directly justifies our Pro+ pricing to clinicians ("OneCare pays for itself in one billed patient").
- **Why not now:** Needs the Encounter object + reliable device-sourced vitals (#9). Without device feed, the time-tracking is too manual to be credible.
- **Trigger:** Phase 1.4 + ≥1 device webhook live.

## 12. SOC 2 Type II

- **Pitch:** Independent attestation that our security controls operate over time.
- **Fit:** Removes the single biggest enterprise procurement blocker after BAA.
- **Why not now:** Audit cycle = 6+ months observation; cost = $25–60k. Premature until we have Enterprise revenue justifying it.
- **Trigger:** $50k ARR or first Enterprise prospect requiring it.

## 13. Multi-language clinician UI

- **Pitch:** Clinician UI in Spanish, Portuguese, Arabic for international expansion.
- **Fit:** Patient i18n is already scaffolded; mirror it for clinicians when we open a non-English market.
- **Why not now:** Expansion is patient-first; clinician demand follows.
- **Trigger:** First non-US-English clinician pilot.

---

## Anti-roadmap (explicitly *not* building)

These come up in conversation and we should decline them politely.

- **Becoming a QHIN ourselves** — capital-intensive, regulatory, no leverage. We layer on Particle / Health Gorilla.
- **General-purpose EHR features** (scheduling templates, claims clearinghouse, payer eligibility checks). Our wedge is the post-discharge continuous record. Adding full EHR scope dilutes that.
- **Native iOS/Android with custom UI** — Capacitor wrapper around the PWA gets us 95% of the value at 5% of the cost. We invest in the web app.
- **In-house ML model training** — Lovable AI Gateway models cover what we need. Custom training is only worth it if we hit per-call cost ceilings.

---

## How this doc gets used

- During fundraising or clinician demos, pull the relevant section verbatim — these are pre-vetted answers.
- When a row's Trigger fires, move it into `clinician-gaps-implementation-plan.md` with an effort estimate and delete it from here.
- Quarterly review: re-check Triggers; add new rows from `tech-and-process-opportunities.md` as the market shifts.
