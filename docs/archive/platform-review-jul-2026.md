# OneCare Platform Review — July 2026

**Audience:** Internal working doc. Candid.
**Companion:** `docs/strategy/investor-onepager.md` (external, polished).

---

## 1. Product Hunt readiness

**Verdict: Soft-launch ready in ~2 weeks; hard PH launch in 4–6 weeks after Track 2 redesign lands.**

| Item | Status | Notes |
|---|---|---|
| Working product across patient + clinician | ✅ | Nav IA v2 shipped, RBAC live, encounters/templates/audit shipped |
| Distinctive visual identity | ⚠️ | Current UI reads generic (emerald+teal gradient stat cards + Inter/Jakarta). Track 2 redesign closes this |
| Landing hero with real screenshots | ❌ | Still uses mock dashboard numbers. Replace before PH |
| Tagline (< 60 chars) | ⚠️ | Draft: *"The shared health record patients and clinicians write together."* |
| Demo video (30–60s) | ✅ | `onecare-investor_v2.mp4` exists; needs a shorter PH cut |
| Maker story | ❌ | Draft founder note before launch |
| Hunter | ❌ | Line up a top-100 hunter or self-hunt with strong day-0 network |
| First-100 seed list | ❌ | Assemble beta users, advisors, health-Twitter warm contacts |
| Gallery assets (5–8 images) | ⚠️ | Reuse investor screenshots after redesign |
| Launch-day plan | ❌ | 5:00 PT drop, comment schedule, notion tracker, thank-you replies |
| No critical bugs across tiers | ⚠️ | Track 1 QA sweep this sprint clears this |
| Free tier working end-to-end | ✅ | |
| Public /pricing + /ehr-comparison | ✅ | Comparison feature just shipped |
| Trust signals (HIPAA, encryption, RLS) | ✅ | Footer trust strip live |
| SEO + llms.txt | ✅ | Job posting schema, llms.txt shipped |

**Do not launch on PH until:**
1. Track 2 redesign is live on 5 core surfaces
2. Landing replaces mock numbers with real product screenshots
3. Track 1 QA sweep zeros P0/P1 bugs
4. First-100 seed list has ≥ 60 confirmed upvoters

---

## 2. Competitive landscape

| Competitor | Segment | Feature parity | Where they beat us | Where we beat them |
|---|---|---|---|---|
| **Epic MyChart** | Patient portal for hospital systems | High (patient-facing) | Distribution, EHR integration | Portable across providers; patient owns record; no vendor lock-in |
| **Zocdoc** | Discovery + booking | Low overlap | Booking network | We're the record itself, not the front door |
| **SimplePractice** | SMB clinician SaaS | Medium | Scheduling depth, telehealth built-in, billing | Patient app is real; shared record; interop-native |
| **Spruce Health** | Clinician messaging | Low overlap | Messaging polish, phone/SMS routing | Full care record, not just comms |
| **Healthie** | Nutrition/wellness clinician SaaS | Medium | Wellness-specific templates | Broader medical scope, patient continuity across providers |
| **Elation Health** | Independent primary care EHR | High (clinician-side) | Deep EHR, billing, e-Rx | Patient-centric; family scope; consent model |
| **Athena / Epic (enterprise)** | Hospital EHRs | Not comparable | Enterprise contracts, compliance depth | Post-discharge continuity; patient portability |
| **Hint Health** | DPC billing/membership | Low | DPC-specific billing | We're the record, they're the till |
| **Practice Better** | Wellness practitioner SaaS | Medium | Client-facing polish | Medical-grade + interop |
| **Suki / Abridge / Nabla** | Ambient scribe | Low overlap (yet) | Scribe UX | We could bolt scribe in; they can't become the record |

---

## 3. USP — where we win hands-down

Beyond patient-centricity, the defensible layers:

### 3.1 Shared continuous record (the wedge)
One canonical record that patient AND clinician write to. Every incumbent forces the patient to a read-only portal *derived from* the clinician's EHR. We invert that: the record is the patient's, clinicians co-author with permission. **No US competitor of comparable scope is built this way.**

### 3.2 Patient-consented data governance
Four sharing modes (see `mem://business/data-governance/hybrid-ownership-model`) — private, provider-scoped, family-scoped, fully shared — enforced at RLS + storage policy level. Competitors treat consent as a compliance checkbox; we treat it as core product.

### 3.3 Post-discharge asymmetry wedge
Hospitals discharge patients into a black hole. Readmissions cost the US ~$26B/year. Our shared record + AI catch-up reminders + care circle + guidance system directly attack this. This is the clinical claim we can defend with data once beta closes.

### 3.4 Family-scoped care
Family switcher + `caregiver_access` table with delegated permissions. Unusual outside pediatric EHRs. Every adult child managing an aging parent's care recognizes this instantly.

### 3.5 AI transparency
Explicit granular consent (`AIConsentDialog`), 13-pattern PII de-identification before any cloud LLM call, patient-scoped AI history (`AIHistorySection`). Competitors either bolt AI on with no consent surface, or refuse it altogether. We split the difference honestly.

### 3.6 Interop-native from day 1
QHIN/TEFCA plan documented; FHIR sync framework in place. Incumbents built pre-TEFCA and treat interop as a threat. We treat it as our distribution.

### 3.7 Dual-sided pricing / two-sided marketplace dynamics
Patient-first freemium (viral loop via Care Circle invites) + clinician SaaS ($99/clinician/mo baseline, tiered). Most competitors are single-sided — either clinician SaaS (SimplePractice) or patient portal (MyChart). Two-sided lets a clinician's practice bring 200+ patients, and a patient's care circle brings 3+ family caregivers.

### 3.8 Hands-down wins
- **Patient owns and ports the record** — no one else does this credibly
- **Family-scoped multi-member accounts** — market gap
- **Explicit granular AI consent** — regulator-favorable positioning
- **Free tier with real value** — every SMB clinician tool is $30+/mo minimum

### Where we're at parity
- Vitals tracking, medication management, document vault, secure messaging
- SOAP notes / encounters (shipped Phase 1)
- Templates library, audit log, compliance packs

### Where we're behind (and OK with, for now)
- Native mobile app store presence (Capacitor scaffolded, not shipped)
- Telehealth (video) — deferred
- Billing/insurance claims — out of scope, partnership territory
- Ambient scribe — roadmapped
- Deep RPM device integrations (Fitbit/Apple Health/Dexcom)

---

## 4. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Clinician adoption cost of a new tool | High | Free trial + solo tier; import existing patient CSV; QHIN pull to bootstrap records |
| HIPAA scale review | Medium | BAA framework already live; audit logging shipped; SOC 2 Type I after Series Seed |
| Incumbent bundling (Epic launching similar) | Medium | Move fast on patient portability + family scope where incumbents can't credibly copy |
| Two-sided cold start | Medium | Focus GTM on 1) clinicians with existing patient panels (bring their own patients) and 2) chronic-care patient communities (bring their own clinicians) |
| Regulatory drift (state privacy laws) | Low | Consent model already exceeds most state law floors |

---

## 5. Where to deploy first

**Beachhead 1 — Independent primary care & DPC clinicians (US)**
- 15K–30K clinicians, price-sensitive, hate their EHRs, patients are engaged
- Distribution: Hint Health community, DPC Frontier, DPC Alliance, r/DPC
- CAC target: < $200; LTV > $3,000

**Beachhead 2 — Chronic-care patients (US, 55+ demographic managing a parent or self)**
- Family switcher + care circle is the killer feature here
- Distribution: caregiver Facebook groups, AARP partnerships, patient advocacy nonprofits
- Free tier acquires; family plan converts

**Do NOT try to sell to hospital enterprise yet.** 18-month sales cycles kill startups.

---

## 6. Next courses of action

### Short-term (0–6 weeks)
1. Land Track 2 redesign
2. Zero P0/P1 bugs from Track 1 QA
3. Replace landing mock numbers with real screenshots
4. Ship Product Hunt with 60+ warm upvoters
5. Close $500K–$1M pre-seed on SAFE

### Medium-term (6 weeks – 6 months)
1. 100 paying clinicians (Solo tier) + 5K patient MAU
2. QHIN sandbox live; first FHIR pull demo
3. Native mobile app store submission (iOS TestFlight → App Store, Android open beta)
4. SOC 2 Type I audit start
5. Case-study writeup with 3 DPC clinicians

### Long-term (6–18 months)
1. Ambient scribe integration
2. RPM device SDK
3. Payer pilot (one regional payer, chronic-care cohort)
4. Series Seed at 500 paying clinicians / 30K patient MAU / $600K ARR

---

## 7. Fundraising options — fast close paths

### 7.1 Non-dilutive first (fastest, no cap-table impact)
- **SBIR/STTR Phase I** — NIH/NSF, $275K, 4–6 month close, no equity. Fits our clinical claim.
- **NIH Digital Health Research grants** — 6–12 month cycles, $150K–$500K
- **Google for Startups Cloud AI Accelerator** — cloud credits + mentorship
- **AWS Impact / Activate credits** — $100K infra credit, 2 weeks
- **Rock Health Summit prize track** — $50K + intros
- **StartUp Health cohort** — long-form program, brand halo

### 7.2 Angel / pre-seed (2–4 week close realistic)
- **Rock Health Angels** — Halle Tecco's Rhia list, warm-only
- **MedAngels** — physician-investor network, natural fit for a clinician tool
- **Digital health syndicates on AngelList** — 5–15 checks × $25K
- **Warm-intro list to build now:** any advisor/investor within 2 degrees of the founder; former EHR execs; DPC-network physicians who invest

### 7.3 Accelerators
- **Y Combinator** — S26 batch application, high dilution but distribution unmatched
- **Techstars Healthcare (Cedars-Sinai, Chicago, Kansas City)** — sector-focused
- **MassChallenge HealthTech** — equity-free, mentorship
- Timing risk: accelerators mean a 3-month freeze; only take if the batch dates align with your runway

### 7.4 Strategic
- **Optum Ventures / UnitedHealthcare** — patient-portability thesis fits
- **Blue Venture Fund** — Blue Cross innovation arm
- **CVS Health Ventures** — post-Aetna, actively investing in adjacent care
- **Hospital system corp dev** — Mayo Clinic Innovation, Cleveland Clinic Innovations, MedStar Health
- Slow decision cycles (3–6 months); good for round-fillers not round-leaders

### 7.5 Revenue-based (post-revenue only)
- **Pipe / Capchase / Founderpath** — once MRR > $10K, can pull forward 6–12 months
- Non-dilutive; useful bridge

### 7.6 Fast-close mechanics (target: $500K–$1M in 6–8 weeks)
- Instrument: **SAFE** with $8M–$12M post cap, standard YC terms
- Check-size mix: 10–15 checks × $25K–$100K
- Warm intros only; do NOT cold email VCs at pre-seed
- Prepare in this order:
  1. 12-slide deck (problem, wedge, USP, traction, market, team, ask)
  2. 30s + 2min demo videos
  3. Metric one-pager (MAU, DAU, retention curve, NPS, top clinician logos)
  4. Data room (cap table, SAFE template, incorporation docs, product roadmap)
- **Do NOT** wait for a lead. Fill the round with rolling closes; the lead materializes when the round is 60% full.

---

## 8. Product Hunt: launch-day tactical plan

Day –14: assemble first-100 upvoter list, warm each one, confirm PT time zone
Day –7: freeze feature scope; QA blitz; polish assets
Day –3: line up hunter (Chris Messina, Rex Woodbury, or self-hunt if list is strong)
Day –1: final asset review; schedule 30 comments; brief team on response templates
**Day 0:** 12:01 AM PT drop; founder posts maker comment at 12:05 AM; first 30 upvoters activated between 12:00–2:00 AM PT; team on all-day response duty
Day +1: recap thread on X/LinkedIn; email launch list; ship "we launched" post
Day +7: retention numbers to investors; move to seed conversations
