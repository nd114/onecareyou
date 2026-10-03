# Pricing ladder and tier gating: audit, recommendation, build plan

> Rooted in [OneCare's foundational pillars](../onecare-foundations.md): the patient holds the power, so a billing limit may stop a clinician from *adding* but never from *reading* what is already theirs, and never touches a patient's access to their own record.

Status: PROPOSAL. Nothing here is built or published. Read-only audit of the repo on 3 October 2026, plus pricing options.
Sources read: `docs/pricing-roadmap.md`, `billing-and-payments.md`, `enterprise-hospital-tenancy-plan.md`, `independent-clinicians-and-hospitals.md`, `src/hooks/useClinicianSubscription.ts`, `src/lib/pricing-constants.ts`, `src/pages/ClinicianPricing.tsx`, `supabase/functions/{check-clinician-subscription,create-clinician-checkout,import-patient-records,encounter-scribe,transcribe-segment,clinician-ai-chat,parse-lab-report,summarize-health-document}`, `supabase/migrations/20260817100000_protect_commercial_columns.sql`, `20260930144202_*.sql`.

---

## Part 1. Audit: where each limit is enforced

Legend: SERVER = SQL trigger/RLS or edge function that a direct API call cannot skip. CLIENT = React only. NONE = no code found.

| Limit / feature | Tier values in code | Enforcement | Bypass / note |
| --- | --- | --- | --- |
| Patient tier on `profiles.subscription_tier` ('premium') | free / premium | SERVER for the column (trigger `trg_guard_profile_commercial` pins it against client writes). | Good. A patient cannot self-upgrade. |
| Practice (tenant) commercial columns: tier, status, patient_limit, member_limit, storage_limit_gb, revenue_share_pct | set by admin console / Stripe | SERVER, `guard_practice_commercial_fields` (insert and update) | Good. Tenant admin cannot rewrite own contract. |
| **Clinician tier on `clinician_profiles`: `subscription_tier`, `subscription_status`, `patient_limit`, `trial_ends_at`** | trial/community/solo/pro/enterprise/expired | **NONE at the row**. RLS policy "Users can update their own clinician profile" (`20260117063816`) grants the whole row and no guard trigger on `clinician_profiles` was found in any migration (only `update_updated_at`). | A clinician can PATCH their own row to `enterprise`, `patient_limit=999999`, or push `trial_ends_at` into the future. `check-clinician-subscription` rewrites some of these when it runs, but only when the client calls it, and the trial branch trusts `trial_ends_at`. Verify live in the DB, then fix (build step 1). This is the same defect class as the August review. |
| Clinician patient cap (Community 25, Individual 150, Practice 1,000, Trial 5) | `TIER_LIMITS` in edge fn, `patientLimits` in checkout, `CLINICIAN_TIER_INFO` in client | **CLIENT**: Add/Invite buttons disabled when `billablePatientCount >= patientLimit` (`ClinicianPatients.tsx`). `billablePatientCount` is computed in the browser. | No trigger counts `provider_shares` / `practice_shares` / managed records. `import-patient-records` selects `patient_limit` and never uses it (500 records per call, repeatable). A direct insert or a scripted import exceeds any cap. |
| Over-limit behaviour (clinician patients) | n/a | CLIENT, and it is the right shape: only the Add/Invite action is disabled; the existing list still renders. Expired trial reports limit 0 with its own message. | Keep. Make sure the server version also blocks only *new* shares, never reads. |
| Team seats | `TEAM_SEAT_LIMITS` (Practice 6, others 1) | **NONE**. The constant is defined and not read anywhere else. `practices.member_limit` exists and is pinned against writes, but no trigger or edge function compares it with the count of `practice_members`. `team_management` gate is `hasFeatureAccess` (CLIENT). | Seat cap is not enforced. Unlimited members can be added, which also means the "shared logins" trap cannot even be priced. |
| Feature gates (`CLINICIAN_FEATURE_TIERS`: analytics, branding, team, BAA, EHR, compliance export, revenue tracking, departments) | per feature | **CLIENT** (`hasFeatureAccess`, used in ClinicianPractice, ClinicianPracticeSection, ClinicianSettings) | RLS and edge functions do not check tier. Anything reachable by API is free on every tier (EHR sync, exports, departments). |
| Ambient scribe (`encounter-scribe`, `transcribe-segment`, `transcribe-recording`, `clinician-dictation-process`) | pricing page: Individual "Metered", Practice "Included"; code feature map allows trial/solo/pro/enterprise | **NONE**. No tier check, no minute ledger, no quota in any of these functions. `duration_seconds` is client-supplied and only used for storage bytes. | Scribe is effectively unlimited and free for any signed-in clinician, including expired and Community accounts. Pricing copy says "Metered" but nothing meters. Biggest cost exposure (Part 2). |
| Assistant (`clinician-ai-chat`, `patient-ai-chat`) | "Metered" in copy; Community "Read-only" | **NONE** (no tier check, no usage count; only upstream rate limits) | Same as scribe. "Read-only mode" for Community is not enforced server-side either. |
| Patient free caps: 3 medications (`FREE_MEDICATION_LIMIT`), 3 documents (`FREE_DOCUMENT_LIMIT`) | free vs premium | **CLIENT** (AddMedication, Medications, HealthVault) | Direct insert bypasses both. They buy no revenue and burden honest chronic patients (see 2.6). |
| Patient AI lab parsing, AI document summaries | premium | SERVER (`parse-lab-report`, `summarize-health-document` read `subscription_tier` and refuse non-premium) | Good, and it relies on the pinned column. |
| Storage allowances (Free 500 MB, Premium 10 GB, Individual 10 GB, Practice 100 GB, hospital pooled) | `storage_limit_gb`, `storage_ledger` | Metered in SQL (`storage_ledger`, `get_*_storage_bytes`); hard enforcement on upload not verified in this audit | Check whether upload is refused at the allowance or only displayed. Over-limit must block new uploads only. |
| Enterprise self-serve | docs say "quoted, not self-serve" | `create-clinician-checkout` accepts `tier: "enterprise"` and uses the enterprise price ID; `check-clinician-subscription` maps that price to `enterprise` | Enterprise is already self-checkout-able by API even though copy says quoted. Either that is the founder's intent (it is, per this brief) or it is an accident; decide explicitly. Hospital contract terms (departments, revenue share) remain admin-set. |
| Demo accounts | enterprise | SERVER, narrow regex in edge fn | Good, documented. |
| Stripe price map | solo / pro / enterprise | SERVER (price chosen server-side, client tier ignored in checkout) | Good. Old price IDs still in `PRICE_TIER_MAP`; fine for grandfathering. |

### Gaps, ranked

1. **Clinician commercial columns are self-writable** (tier, patient_limit, trial_ends_at). Highest severity because every other gate reads them.
2. **Scribe and assistant are unmetered and un-gated server-side.** Cost risk is uncapped, and Community or expired accounts can use them.
3. **Seat cap and patient cap are client-only.** The "no shared logins" strategy requires a real seat count.
4. **Feature gates are client-only.** Fine for UI, not for anything with marginal cost or contractual meaning (EHR sync, exports, departments).
5. **Patient caps (3 meds, 3 docs) are client-only and also wrong in principle** (2.6).
6. Trial farming: unlimited fresh trial accounts, each with scribe. Combine with metering per person, and per email domain/practice.

### What must hold when we build enforcement (non-negotiable)

- Over limit blocks **new additions only**: new patient connections, new seats, new scribe minutes, new uploads. It never blocks reading, exporting, messaging, or clinical documentation on existing patients. A lapsed or expired clinician keeps read access to existing patients' records they were already shared (patients can revoke; billing cannot).
- A patient's own records, export, deletion, emergency info and sharing controls are never gated by any plan, theirs or their clinician's. A clinician's lapse never reduces what a patient can see or do.
- Grace first: soft warning at 80%, banner at 100%, a 7-day grace for seats and patients on payment failure (Stripe retries run anyway), then new-additions-only block. No sudden lockout.
- Server decides. Client banners are cosmetic and read from the same server function.

---

## Part 2. Pricing

### 2.1 The mid-market trap, restated

Without a tier between Individual ($99, one person) and Enterprise ($2,500), a 4-person clinic buys one Individual seat and shares the login. That breaks per-user audit trails (HIPAA 164.312(b) style accountability, and our own `hipaa_audit_logs`), hides true usage, and caps revenue. Today the seat cap is not even enforced (gap 3), so Practice at $299 can also be shared with anyone. The fix is a ladder where the price of "one more real person" is low and obvious, and the per-user cost of sharing a login is higher than the per-user cost of a seat.

### 2.2 Unit economics (back-of-envelope; change the inputs)

No scribe cost figures exist in the repo docs (code calls `google/gemini-3.5-transcribe` for speech-to-text and `google/gemini-2.5-flash` / `gemini-3-flash-preview` for note generation). **Stated assumptions, all from memory and unverified. Replace with the real provider invoice.**

| Input | Typical | Heavy / conservative | Note |
| --- | --- | --- | --- |
| Cost per scribe minute (STT + note LLM + retries) | **$0.03** | **$0.06** | One variable, `C`. Everything below scales linearly. |
| Payment processing | 3% + $0.30 | same | Stripe-style, from memory |
| Infra, storage, support per account | $8 Individual, $30 Practice, $70 Clinic | same | Rough guess, per month |
| Use of included minutes | 50% | 100% | Typical vs pooled minutes fully used |

Gross margin by tier (proposed ladder). Formula: price - minutes x C - infra/support - processing.

| Tier | Price | Minutes incl. | Margin, typical (50% use, C=0.03) | Margin, 100% use, C=0.03 | Margin, 100% use, C=0.06 |
| --- | --- | --- | --- | --- | --- |
| Individual | $99 | 300 | ~$79 (80%) | ~$78 (79%) | ~$69 (70%) |
| Practice | $299 | 1,500 | ~$237 (79%) | ~$214 (72%) | ~$169 (57%) |
| Clinic | $699 | 4,500 | ~$510 (73%) | ~$471 (67%) | ~$336 (48%) |
| Enterprise base | $2,500 | 15,000 | ~$1,850 (74%) | ~$1,720 (69%) | ~$1,330 (53%) |

Findings:

- **No tier loses money at its included allowance**, even at C = $0.06 and full use. The lowest margin is Clinic at 48% in the pessimistic case, which is acceptable but is the tier to watch.
- **The danger is unmetered use, not the allowances.** A full-time clinician scribing every visit (about 20 visits a day x 15 min x 20 days) is roughly 6,000 minutes a month, about $180 at C = $0.03 and $360 at $0.06, which is **more than the $99 Individual price**. Today nothing stops that (gap 2). 300 minutes is about 5% of a full-time scribe user, so Individual is really "scribe for selected visits". That must be said plainly on the page.
- The 300 min Individual allowance is also thin for the clinicians who value scribe most. That is deliberate upsell fuel: overage packs, then Practice.

**Overage pricing.** Sell minutes in packs, never per-minute surprise billing: **500 minutes for $40 ($0.08/min)**, auto-purchase optional and off by default; a hard stop at the allowance if no pack and no auto-top-up (new scribe sessions blocked, existing notes untouched). $0.08 gives 62% margin at C = $0.03 and 25% at C = $0.06. If real cost lands above $0.05, move to $0.10.

### 2.3 Options compared

| | A: three flat tiers | B: Practice + add-on seats | C: hybrid, Enterprise strictly institutional |
| --- | --- | --- | --- |
| Shape | Individual $99 / Practice $299 / Clinic $699-799 | Practice $299 incl. 5 seats; +$49-59 per clinician; staff fee; patient packs | Enterprise = hospitals only; Clinic $699 for 6-15; per-seat overage |
| Strengths | Simple page, easy to explain | Grows smoothly, no cliff | Clear segmentation, no cliff, fewest sales conversations |
| Weaknesses | Cliffs at 5 and 15; clinic of 6 pays $699 | Pricing page gets complicated; staff fee pushes login-sharing, the exact trap | Slightly more surface than A |
| Verdict | Good skeleton | Take the add-on seat idea, drop the staff fee | **Recommended: C, with B's add-on seat as the overage mechanism** |

Rejected: **charging for non-clinical staff.** A per-staff fee is an incentive to share the front-desk login, which recreates the audit trail problem. Include non-clinical staff in the tier at modest caps instead.

### 2.4 RECOMMENDATION: the clinician ladder

Stored keys stay `solo`, `pro`, `enterprise` (existing subscriptions keep resolving); add `clinic` as a new key. Only the labels and numbers below change.

| | Community | Individual (`solo`) | Practice (`pro`) | Clinic (`clinic`, new) | Enterprise (`enterprise`) |
| --- | --- | --- | --- | --- | --- |
| Price / month | $0 | $99 | $299 | $749 | From $2,500, self-serve bundle builder |
| Clinician seats | 1 | 1 | 5 included | 15 included | 25 included |
| Non-clinical staff | 0 | 0 | 5 included (fair-use) | 15 included | Unlimited |
| Patients | 25 | 150 | 1,000 | 3,500 | 5,000 base |
| Scribe minutes / month (pooled) | 0 | 300 | 1,500 | 4,500 | 15,000 |
| Storage (pooled) | 500 MB | 10 GB | 100 GB | 400 GB | 1 TB |
| Add-on clinician seat | n/a | n/a | $49 / mo (adds 150 min, 70 patients) | $45 / mo (same adds) up to 30, then Enterprise | $40 / mo |
| Support | community | email | priority | priority + named contact | dedicated |
| Distinguishing features | read-only assistant | custom alerts, scribe, encounters | team, analytics, invoicing, audit exports | multi-site routing, pooled scribe hours, audit exports | departments, sub-admins, custom subdomain, SSO, FHIR/EHR, BAA, branding |

Why $749 and not $699: $699-799 was the founder range. $749 keeps Clinic at $50 per clinician at 15 seats, under Practice's marginal $49 plus its base, and leaves room to discount to $699 annually. The crossover works: Practice with add-ons reaches $749 at 14 seats ($299 + 9 x $49 = $740), so the upgrade nudge to Clinic appears at about 13 seats and the ladder never has a price that decreases with size. Annual billing: 2 months free (existing convention).

Rules:
- **Seats are named people with their own login.** Seat invite fails server-side at the cap with "Add a seat ($49/mo)", which is self-serve checkout, so teams grow without a conversation. This is the anti-login-sharing mechanism: the cheap thing to do is add a person.
- **Patient cap is per account/tenant, counted server-side as distinct active patient shares** (provider_shares + practice_shares + managed records, deduplicated by patient). Over cap: new connections and imports blocked; nothing else changes. Revoked or ended shares free their slot immediately.
- **Scribe minutes are pooled per tenant, reset monthly, no rollover.** Warn at 80%. At 100%: offer a pack; otherwise new sessions are blocked. Bought pack minutes roll over for 12 months.
- Practice includes the ambient scribe **as an allowance of 1,500 pooled minutes, then metered**. It is not "Included, unlimited". Change "Included" in the comparison table (see 2.8).
- Community does not get scribe (server-enforced) and keeps a read-only assistant.
- Downgrade rules: if patients or seats exceed the lower tier, the account keeps working and reading; only new additions are blocked until under cap or upgraded.

**Self-serve Enterprise bundle builder** (founder wants pick, price, start instantly; sales meeting optional):
- Base $2,500 / month, includes 25 clinicians, 5,000 patients, 3 departments, 15,000 scribe minutes, 1 TB, custom subdomain `<slug>.onecare.you`, SSO, BAA, tenant branding.
- Builder sliders, all live-priced: +clinicians $40 each; +patients $150 per 1,000; +departments $200 each beyond 3; scribe packs 5,000 min for $350 ($0.07); FHIR/EHR connector $500 / mo each (live only when connector is genuinely available; otherwise sell as "request"); storage 1 TB for $129 (existing pack).
- Checkout via Stripe for monthly totals up to $9,000; above that or annual prepay, generate a quote and an invoice link in-product. Sales/integration call is an optional button on every step.
- Provisioning is automatic: the webhook creates the `practices` row (tenant_type `hospital`), sets the commercial columns through the service role, and emails the owner. The existing `admin_create_tenant` stays for contract deals.
- Not self-serve by default: revenue share (the v4 70/30 model is a negotiated contract term; self-serve tenants get 0%), on-prem or private-cloud FHIR pipelines, non-standard BAAs, multi-year prepay. These say "talk to us" and nothing else changes.
- Onboarding fee: optional paid assisted onboarding $2,500 (existing figure); the self-serve path is free with guided setup. Founder decision D3.
- Guard: Enterprise limits become the builder's chosen numbers, stored on the tenant row, enforced by the same triggers, so there is one enforcement path.

### 2.5 Patient side: free tier and chronic medication

Current: Free = 3 medications, 3 documents, 500 MB; Premium $9.99/mo or $99.90/yr = unlimited meds, 10 GB, AI lab parsing, AI summaries, vault, reports export.

**Evaluation.** A 3-medication cap is hostile to exactly the people the product exists for. A patient on 4+ chronic medications (hypertension plus diabetes plus statin plus an anticoagulant is ordinary) is the user with the most to gain and the highest interaction risk, and the app asks them to pay or leave a medication untracked. It is also a safety problem: **interaction warnings only help if every medication is entered.** Tracking is cheap (a few text rows), so the cap saves almost no cost. And it is client-only, so it earns nothing from anyone who bypasses it and punishes everyone who does not. Same logic for the 3-document cap.

**Recommendation.**
- **Remove `FREE_MEDICATION_LIMIT` and `FREE_DOCUMENT_LIMIT` entirely.** Unlimited medications, vitals, labs, interaction warnings, schedule, reminders for everyone, free.
- **Must stay free by principle:** access to one's own records, full export (all formats we have, not just PDF), deletion and withdrawal, emergency contacts and emergency info, interaction warnings, sharing to their own clinicians and revoking it, record corrections, the knowledge base. Anything that holds the patient's data hostage to payment fails the foundations doc.
- **Reasonable to charge for (things with real marginal cost or convenience):** storage beyond 500 MB (give chronic patients 2 GB free; Premium 10 GB; packs); AI assistant usage beyond a free monthly quota (e.g. 30 messages free, higher or fair-use on Premium); AI lab parsing and document summaries (already premium, server-enforced); family or dependent profiles when `FAMILY_HEALTH_ENABLED` turns on; recording and transcription storage; priority support; scheduled reports to a provider. Charging per extra sharing recipient is **not** recommended: a patient sharing with their cardiologist and GP and pharmacist is the product working.
- Reposition Premium as "Plus": about AI, storage and convenience, not about unlocking basic tracking. Price unchanged at $9.99 until regional pricing lands ($6 emerging markets, per the existing plan).
- Founder decision D5 covers whether the free storage change is acceptable.

### 2.6 Market anchors (from memory, must be verified before anyone relies on them)

- Ambient AI scribes for individual clinicians have commonly been priced somewhere in the low-hundreds of dollars a month, with some free or very cheap entry tiers and a few unlimited plans. Per-clinician EHR seats are commonly several hundred dollars a month (the existing repo table says $200-500). Hospital enterprise contracts are quoted and usually far above $2,500 a month. Treat all of this as orientation only, not as claims to publish. OneCare at $99 / $299 sits below typical scribe-only pricing while bundling a patient-controlled record, which is the positioning the pricing page already uses.

### 2.7 Decisions the founder must make

1. **Clinic tier price and seat count:** $749 for 15 clinicians (recommended) vs $699 or $799; and is 15 the right ceiling before Enterprise?
2. **Scribe policy:** allowance-then-metered with $40 / 500-minute packs and hard stop (recommended), vs a "fair-use unlimited" Practice tier (riskier: unmetered heavy users cost more than the tier price). Also: does Community get any scribe?
3. **Self-serve Enterprise scope:** instant checkout up to $9,000 / month and a free self-serve onboarding, with revenue share and custom integrations as contract-only? Includes whether a click-through BAA is acceptable to legal.
4. **Seat and staff rules:** non-clinical staff included (recommended, no staff fee) vs a staff add-on fee; and hard seat cap at the limit with a one-click add-seat purchase.
5. **Patient free tier:** remove the 3-medication and 3-document caps, give 2 GB free, and move monetisation to AI quota and storage (recommended).

### 2.8 Exact pricing-page changes (PENDING APPROVAL, do not apply yet)

Files: `src/hooks/useClinicianSubscription.ts` (`CLINICIAN_TIER_INFO`, `TEAM_SEAT_LIMITS`, `CLINICIAN_FEATURE_TIERS`), `src/lib/pricing-constants.ts` (`ENTERPRISE_TIERS`, patient lists), `src/pages/ClinicianPricing.tsx` (comparison table lines ~259-260), patient `/pricing`.

1. Add a **Clinic** column/card: $749/month, 15 clinicians, 3,500 patients, 4,500 scribe minutes, 400 GB, priority support, multi-site routing.
2. Practice card: "Up to 1,000 patients, 5 clinician seats + 5 non-clinical staff, 1,500 scribe minutes a month. Add clinicians for $49."
3. Comparison table: Ambient scribe row becomes Community "No", Individual "300 min / mo", Practice "1,500 min / mo (pooled)", Clinic "4,500 min / mo (pooled)", Enterprise "15,000 min / mo, packs available". Assistant actions row: "Metered" and "Included" replaced by the same style ("allowance, then packs"). Remove the word "Included" for scribe on Practice.
3b. Add footnote: "Over a limit, you can still see and use everything you already have. Limits only stop new patients, seats, scribe minutes and uploads."
4. Enterprise card: "From $2,500/month. Build your bundle and start today, or book a call." Replace "Contact sales" primary CTA with the bundle builder; keep call as secondary. Update `ENTERPRISE_TIERS`: collapse the four quote tiers (Single site / Mid / High / Enterprise+) into builder presets with the same numbers, or keep them as "starting points".
5. Patient `/pricing` and landing: delete "Track up to 3 medications" and the matching Landing bullet; Free becomes "Unlimited medications and drug-interaction warnings"; Free storage "2 GB"; Premium list drops "Unlimited medications"; add "Higher AI assistant allowance". Remove `FREE_MEDICATION_LIMIT` and `FREE_DOCUMENT_LIMIT` and their banners (AddMedication, Medications, HealthVault).
6. Roadmap strip (`PRICING_ROADMAP`): replace "Per-seat pricing: Early 2027" with the live seat add-on once built.

---

## Part 3. Build plan, ordered

Safe to build now = enforces existing, already-published limits or closes holes, changes no prices.

| # | Piece | Type | Safe now? |
| --- | --- | --- | --- |
| 1 | **Pin `clinician_profiles` commercial columns** (`subscription_tier`, `subscription_status`, `subscription_ends_at`, `trial_ends_at`, `patient_limit`, `stripe_*`) with a BEFORE INSERT/UPDATE trigger modelled on `guard_practice_commercial_fields`; service role and admin trusted. Add a case to `supabase/tests/privilege_escalation.test.sql`. | Migration + test | **Yes, do first** |
| 2 | **Server-side limit function** `entitlements_for(user)` returning tier, patient_limit, seat_limit, scribe allowance, storage; single source for edge functions and the client (replaces the three divergent maps). Resolve tenant tier when the user belongs to a practice. | SQL function + edge helper in `_shared/` | Yes |
| 3 | **Patient cap trigger** on new `provider_shares` / `practice_shares` / managed-record insert: count distinct active patients, refuse the INSERT over cap with a clear error. Reads never blocked. Make `import-patient-records` use the cap (it already selects it). | Migration + edge | Yes (existing numbers); ship with grace rules |
| 4 | **Seat cap trigger** on `practice_members` / invites against `practices.member_limit` (set limit in the Stripe webhook). | Migration | Yes once member_limit values are correct for existing tenants (backfill first) |
| 5 | **Usage ledger** `usage_events(tenant/user, kind, units, source_id, at)` plus `scribe_minutes_this_period()`; scribe, transcribe and assistant edge functions record server-measured minutes (from audio length server-side, not client `duration_seconds`) and refuse new sessions over allowance. Start in **log-only** mode to learn real usage and real cost before enforcing. | Migration + edge | Log-only: yes. Enforcing: after D2 |
| 6 | **Stripe webhook** (does not exist; entitlement currently refreshes only when the client calls `check-clinician-subscription`) that writes tier, limits and period onto the server rows on subscription events, including add-on seat and pack items. | Edge function | After D1/D4 for new SKUs; reconcile existing SKUs now |
| 7 | **Add-on products:** seat ($49), scribe pack ($40/500), patient pack; one-click upgrade/add flows replacing disabled buttons. | Stripe + UI | After approval |
| 8 | **Clinic tier** (`clinic` key, price ID, limits, copy) and the comparison-table edits in 2.8. | Constants + UI | After approval |
| 9 | **Enterprise bundle builder** (price calculator UI, checkout with line items, provisioning webhook creating the tenant row through the service role). | UI + edge | After D3, last |
| 10 | **Patient tier changes:** remove the two caps; AI quota for patient assistant; storage allowance. | Constants + UI + small SQL | After D5 (removing caps alone is safe and kind: do it as soon as approved) |
| 11 | **Over-limit UX:** shared banner reading `entitlements_for`; copy states "existing patients and records are unaffected". 80% warnings. | UI | With 3-5 |
| 12 | **Tests:** every limit gets a "direct API call is refused", a "reads still work over limit", and a "patient's own data unaffected" assertion. | SQL tests | With each step |

Order: 1 -> 2 -> 3, 4 (backfill) -> 5 log-only -> 6 -> approvals -> 7, 8, 10 -> 5 enforcing -> 9.

## Open items and caveats

- All scribe cost figures and market anchors above are assumptions from memory. Replace `C` with the real blended cost per minute from provider invoices after a month of log-only metering (step 5) and re-run the table.
- Upload enforcement of storage allowances was not verified here.
- The existing `ENTERPRISE_TIERS` quote bands ($2,500 to $9,000+) are kept as bundle presets; enterprise revenue share (70/30) remains a contract term and is not offered self-serve.
- The audit is by static read. Gap 1 should be confirmed against the live database (`pg_trigger` on `clinician_profiles`) before anyone describes it as exploitable.
