# OneCare — Modernization, QA, Strategy & Polish Sprint

Four tracks, sequenced so the fast wins land first and the redesign happens on a working, tested base.

---

## Track 0 — Google logo fix (5 min, ships first)

`src/components/auth/GoogleSignInButton.tsx` currently renders a single-color red "G". Replace with the official Google 4-color SVG (blue/red/yellow/green paths per Google Identity brand guidelines). No behavior change.

---

## Track 1 — Full role-matrix QA sweep

Drive Playwright headless against `http://localhost:8080` using the injected demo sessions.  Provision yourself the relevant access if any issues, but the following should suffice:  
Patient: [demo-patient-1@onecare.you](mailto:demo-clinician-1@onecare.you)  
Clinician: [demo-clinician-1@onecare.you](mailto:demo-clinician-1@onecare.you)  
Password for both: Demo123!  
  
Test matrix:

**Roles / tiers**

- Patient (Free, Family, Premium)
- Clinician (Solo, Practice owner, Practice member, Enterprise)
- Unauthenticated visitor (marketing + pricing + comparison)
- Persona lenses (read-only walkthrough): observer, policy maker, hospital manager, C-suite exec — validates that public marketing + `/for-clinicians` + `/ehr-comparison` actually speak to each.

**Flows tested per role**

1. Sign-in (email + Google button render/click), sign-up, onboarding
2. Nav pillars + sub-tabs (patient 4 pillars, clinician 4 pillars) — every link resolves, active state correct, no cross-role leakage
3. Patient core: Dashboard, Vitals add/edit, Medications add, Schedule, Health Vault upload+share, Care Circle invite, Messages, Assist (Simple Mode), Family switcher
4. Clinician core: Today/Triage, Patients list, Patient Detail tabs (Overview/Vitals/Meds/Vault/Guidance/Encounters/Notes/Activity/Network), Invite Patient dialog (previously greyed), Templates, Alerts, Audit, Compliance, Reports, Practice (RBAC add/remove member), BAA
5. Comparison feature (`/ehr-comparison`) — all rows render, CTAs route correctly, mobile layout
6. Pricing (`/pricing` audience toggle + `/clinician/pricing` 301)
7. Billing gates: upgrade prompts don't cross-leak into patient dashboard (regression check on the earlier bug)
8. PWA/mobile: manifest, standalone launch redirect, bottom nav visibility rules, FAB stacking, safe-area insets on iPhone viewport (390×844)
9. Auth edge cases: sign-out clears context, protected routes bounce, password reset

**Deliverable**

- `docs/qa-report-jul-2026.md` — bug ledger with severity (P0 blocker → P3 polish), reproduction, screenshot
- Fix everything P0/P1 in the same sprint; P2/P3 triaged into the doc for follow-up
- Screenshots saved under `/tmp/browser/qa-jul-2026/` and the worst offenders attached to the redesign brief in Track 2

---

## Track 2 — UI/UX modernization via redesign skill

Current visual system reads generic: emerald+teal gradient stat cards, Inter+Plus Jakarta, standard shadcn defaults, template-y hero. The redesign follows the two-act redesign skill:

**Act 1 — Pin the taste**
Capture the live preview (Landing, Patient Dashboard, Clinician Today) via Playwright element screenshots. Ask 3 visual questions in one round:

- Palette (4 curated swatches — leaning medical-trust: Ocean Deep, Navy Trust, Slate & Steel, Paper & Ink, or a custom clinical palette)
- Type pair (4 options — leaning editorial/clinical: instrument-serif-work-sans, dm-serif-display-fira-sans, sora-manrope, urbanist-epilogue)
- Layout (4 options — asymmetric, magazine, bento-grid, full-width-sections)

**Act 2 — Four rendered directions**  
Feed captured screenshots + locked palette/type/layout into `design--create_directions` to render 4 distinct compositions varying density, hierarchy, motion, and emphasis. User picks one via prototype question.

**Act 3 — Implement chosen direction**

- Rewrite tokens in `src/index.css` + `tailwind.config.ts` (copy verbatim from picked prototype)
- Refresh shadcn primitive variants once (Button, Card, Input, Tabs, Dialog, Badge)
- Restyle Landing hero, Patient Dashboard, Clinician Today, Pricing, Comparison — the 5 highest-traffic surfaces
- Add motion register (Framer Motion micro-interactions on cards, page transitions)
- Keep IA untouched — this is pure visual layer

**Explicit anti-AI-generic rules applied**

- No emerald→teal gradient stat cards
- No purple/indigo-on-white
- No default Inter body + Plus Jakarta heading (change at minimum one of the two)
- No generic Sparkles/lucide-only iconography for brand marks
- Deliberate whitespace rhythm, one distinctive typographic move, one signature interaction

---

## Track 3 — Strategy, USP, fundraising docs

Two artifacts:

### 3a. `docs/strategy/platform-review-jul-2026.md` (internal, candid)

Sections:

1. Product Hunt readiness checklist (assets, tagline, launch-day plan, hunter, comment strategy, first-100 tactic) — go/no-go verdict
2. Competitive landscape matrix vs Spruce Health, SimplePractice, Healthie, Elation, Athena, Epic MyChart, Zocdoc, Hint Health, Practice Better — feature parity, pricing, moat gaps
3. USP articulation. Beyond patient-centricity:
  - **Shared continuous record** — one canonical record patient + clinician both write to
  - **Patient-consented data governance** — 4 sharing modes (hybrid ownership model already in memory)
  - **Post-discharge asymmetry wedge** — mission-doc positioning
  - **Family-scoped care** — caregiver_access + family switcher (unusual outside pediatrics)
  - **AI transparency** — explicit consent modes + de-identification (13 regex patterns)
  - **Interop-native from day 1** — QHIN/TEFCA + FHIR roadmap vs vendor lock-in incumbents
  - **Dual-sided pricing** — patient-first freemium + clinician SaaS, most competitors are single-sided
4. Where we win hands-down / where we're behind / where we're at parity
5. Risks: HIPAA scaling, clinician adoption cost, incumbent bundling
6. Where we should deploy
7. Next courses of action (short term, medium term, long-term)

### 3b. `docs/strategy/investor-onepager.md` (external, polished)

Problem → wedge → traction → moat → market ($26B readmissions, $50B RPM) → business model → ask. Distilled from 3a.

### 3c. Fundraising options section (in both docs, tuned)

- **Non-dilutive first (fastest close):** SBIR/STTR Phase I ($275K, 6-mo close), NIH DTR, Google for Startups Cloud AI Accelerator, AWS Impact credits, Rock Health Summit prizes, Startup Health cohort
- **Angel / pre-seed:** health-focused angels (Rock Health Angels, MedAngels, Halle Tecco's Rhia list), digital health syndicates on AngelList — 2–4 week close realistic
- **Accelerators:** Y Combinator, Techstars Healthcare, Cedars-Sinai, MassChallenge HealthTech — cohort timing
- **Strategic:** payer innovation funds (UnitedHealthcare Optum Ventures, Anthem, Blue Venture Fund), hospital system corp dev
- **Revenue-based financing:** Pipe, Capchase, Founderpath — once clinician MRR exists
- **Fast-close mechanics:** SAFE with cap, warm intros only, target 10–15 checks × $25K–$100K = $500K–$1M pre-seed in 6–8 weeks

---

## Sequencing (single sprint)

```text
Day 1  Track 0 (Google logo) + Track 1 QA sweep (Playwright)
Day 2  Track 1 fixes for P0/P1 bugs
Day 3  Track 3 docs written (strategy + investor + fundraising)
Day 4  Track 2 Act 1 — capture + 3 visual questions
Day 5  Track 2 Act 2 — render 3 directions, user picks
Day 6-7 Track 2 Act 3 — implement chosen direction across 5 surfaces
```

## Technical details

- QA harness: Playwright headless, viewports 1280×1800 (desktop) + 390×844 (mobile). Session injection via `LOVABLE_BROWSER_SUPABASE_*` env vars. Screenshots to `/tmp/browser/qa-jul-2026/`.
- Redesign lock: chosen prototype's CSS variables copied verbatim into `src/index.css`; no re-derivation.
- No schema changes, no new edge functions, no auth changes in this sprint.
- Google logo: inline 4-path SVG, no external asset.
- Track 3 docs are markdown-only under `docs/strategy/`.
- Ensure that Mobile and Tab views are also rightly changed/worked on without defect or error.

## Out of scope

- New features (messaging attachments, telehealth, ambient scribe — deferred)
- QHIN wiring (already documented, no code)
- i18n activation (Phase D)
- Native mobile store submission