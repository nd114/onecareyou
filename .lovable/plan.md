

# USP-to-Functionality Gap Audit & Funding Plan

## Part 1: Copywriting Claims vs Actual Functionality

### CRITICAL GAPS (Claims with NO implementation)

| Claim | Where Claimed | Reality |
|-------|--------------|---------|
| "End-to-end encryption" | Features.tsx line 88 | FALSE. Data is encrypted at rest (database-level AES-256) and in transit (TLS), but there is NO end-to-end encryption. E2E encryption means even the server can't read data -- that's not the case here. This claim must be corrected to "Encryption at rest and in transit" |
| "Data anonymization" | Features.tsx line 88 (same line) | PARTIAL. PII stripping exists for AI lab parsing only. No general data anonymization. Misleading |
| "Calendar integration" | Features.tsx line 78 | NOT IMPLEMENTED. No Google Calendar, iCal, or any calendar export exists |
| "Refill reminders" | pricing-constants.ts (Premium feature) | NOT IMPLEMENTED. A `refill_date` column exists on `medications` but no reminder logic triggers from it. `useDueDateReminders` only handles clinician guidance items, not medication refills |
| "FHIR export for EHR integration" | ClinicianWhyOneCare.tsx line 432 | NOT IMPLEMENTED. Database tables for EHR connections exist, but no actual FHIR data exchange happens. The "Export to EHR (FHIR)" button on the Why OneCare page is non-functional |
| "Bidirectional sync with your existing EHR" | ClinicianWhyOneCare.tsx line 144 | NOT IMPLEMENTED. No actual EHR sync occurs |
| "Connect your existing EHR and see the difference" | ClinicianWhyOneCare.tsx line 493 | FALSE for launch. EHR edge functions exist but are stubs |
| "Real-time" data sharing/updates | Landing.tsx, Features.tsx, ClinicianPricing.tsx (10+ instances) | MISLEADING. No Supabase Realtime subscriptions exist (confirmed: zero `ALTER PUBLICATION` statements). Data refreshes only on page load or manual refetch. It's "near-time" at best |
| "Priority support" / "Dedicated account manager" | pricing-constants.ts, useClinicianSubscription.ts | NOT IMPLEMENTED. There is no support ticketing system, no chat widget, no differentiated support channels between tiers. It's a single contact form for everyone |
| "10,000+ Active Users" | About.tsx line 33 | COMPLETELY FALSE. This is a pre-launch beta. Must be removed or replaced with honest metrics |
| "50,000+ Medications Tracked" | About.tsx line 33 | FALSE. Same issue |
| "4.8★ User Rating" | About.tsx line 33 | FALSE. No app store listing exists |
| "99.9% Uptime" | About.tsx line 33 | UNVERIFIABLE. No monitoring is in place |
| "Join thousands of patients" | About.tsx line 182 | FALSE. Same pre-launch issue (Landing.tsx was fixed but About.tsx was missed) |
| "Updated database with 50,000+ medications" | Features.tsx line 56 | UNVERIFIED. The IDD import + FDA/RxNorm may cover this number, but the specific claim hasn't been validated |
| "Works with most common medications" (photo ID) | Features.tsx line 67 | MISLEADING. Photo ID relies on the `identify-pill` edge function which calls an external API. Accuracy and coverage are unverified |

### MODERATE GAPS (Partially true but overstated)

| Claim | Where | Reality |
|-------|-------|---------|
| "Automated Care Circle" alerts | ClinicianWhyOneCare.tsx line 122 | Care alerts exist but rely on a cron-triggered edge function (`check-care-alerts`), not real-time automation. Delivery reliability is unverified |
| "Seamless EHR Integration" | ClinicianWhyOneCare.tsx line 371 | Database schema and edge function stubs exist. Not "seamless" -- it's not functional yet. Should say "Coming soon" |
| "190+ countries database" | ClinicianWhyOneCare.tsx line 137 | The IDD database was imported but the actual country coverage hasn't been verified against this specific number |
| "14-day free trial. No credit card required." | ClinicianWhyOneCare.tsx line 492 | Trial mechanism exists (`trial_ends_at`), but the "no credit card" claim should be verified against the actual Stripe checkout flow |
| Solo plan "25 patients" vs comparison table "Patient Limit 25" | Mismatch between `CLINICIAN_TIER_INFO` (patientLimit: 25) and comparison table showing same | Consistent here, but the tier info line 18 says `patientLimit: 5` for trial. The "Start Free Trial" CTA on WhyOneCare page navigates to `/clinician/signup` which is a 404 (should be `/clinician/sign-up`) |

### BROKEN NAVIGATION

| Link | Where | Issue |
|------|-------|-------|
| `/clinician/signup` | ClinicianWhyOneCare.tsx lines 196, 496 | 404 -- correct route is `/clinician/sign-up` (with hyphen) |

### Pricing FAQ Inconsistency

Pricing.tsx FAQ line 31 says: "Premium unlocks unlimited medications, **vitals tracking, Care Circle sharing**, AI lab report parsing, and priority support."

But vitals tracking and Care Circle are FREE features (confirmed in pricing-constants.ts). The FAQ contradicts the feature lists.

---

## Part 2: Implementation Plan for Fixes

### Step 1: Remove false claims (About.tsx)
- Replace fake stats ("10,000+ Active Users", "50,000+ Medications Tracked", "4.8★", "99.9% Uptime") with honest beta-appropriate content (e.g., "Growing Community", "Comprehensive Database", "Built for Reliability", "Privacy-First Design")
- Fix "Join thousands of patients" to "Join early adopters"

### Step 2: Correct misleading security claims (Features.tsx)
- Change "End-to-end encryption and data anonymization" to "Encrypted storage and secure data transmission"

### Step 3: Add "Coming Soon" labels to unbuilt features
- Calendar integration: remove from feature details or label "(coming soon)"
- Refill reminders: add "(coming soon)" in pricing-constants.ts
- FHIR export: already marked on clinician pricing table but NOT on WhyOneCare page -- add labels there
- Priority support / Dedicated manager: add "(not yet differentiated)" or remove until support tiers exist

### Step 4: Fix "real-time" claims
- Replace "real-time" with "continuous" or "shared" across Landing, Features, ClinicianPricing, Footer
- Or implement Supabase Realtime for vitals/medications tables (more work but makes the claim true)

### Step 5: Fix broken navigation
- Change `/clinician/signup` to `/clinician/sign-up` in ClinicianWhyOneCare.tsx (2 instances)

### Step 6: Fix Pricing FAQ
- Remove "vitals tracking, Care Circle sharing" from the Premium description in the FAQ since those are free

---

## Part 3: Funding Plan

### Why "Be Careful Who You Take Money From" Is True

1. **Mission dilution**: Health-tech investors often push for aggressive monetization (selling data, ads, paywalls on critical health features). OneCare's value prop is patient-owned data and free access. The wrong investor will demand you paywall vitals or sell anonymized data to pharma -- destroying the trust proposition.

2. **Premature scaling pressure**: VC money comes with growth expectations (10x in 18 months). For a health platform launching in Nigeria, you need time to build trust with communities, iterate on clinical workflows, and validate product-market fit. Forced scaling leads to cutting safety corners.

3. **Geographic misalignment**: Most US/EU health-tech VCs don't understand the African healthcare market. They'll push US-first strategies, ignore offline-first needs, and undervalue community-driven adoption.

4. **Control loss**: Taking a large seed round typically means giving up 15-25% equity + board seats. At this stage with one developer, that's giving away significant control before proving the model.

5. **Regulatory risk transfer**: Health-tech investors know HIPAA/regulatory liability. Some structure deals to shift compliance burden entirely to the founder. If a breach occurs, the founder absorbs the legal risk while investors are protected.

### Recommended Funding Strategy

**Phase 0: Bootstrap + Micro-grants (Now - Month 3)**
- Continue self-funding operational costs (~$1,000-2,000/month per launch plan)
- Apply to health-tech micro-grants:
  - **Google for Startups Africa** (up to $100K in credits + cash)
  - **Techstars Lagos** or **Y Combinator** (if applicable -- $500K standard deal)
  - **Bill & Melinda Gates Foundation Grand Challenges** (health innovation grants, $100K-$500K)
  - **USAID Digital Health** grants for African health-tech
  - **Africa Health Business** grants
  - **Savannah Fund** (East Africa-focused, $25K-$500K)
- Estimated obtainable: $25K-$100K in non-dilutive funding

**Phase 1: Angel Round (Months 3-6, after 50+ patients, 5+ clinicians)**
- Target: $50K-$150K
- Sources:
  - **Nigerian angel investors** in health-tech (Lagos Angel Network, Ventures Platform)
  - **Diaspora angels** -- Nigerian professionals in US/UK health systems who understand both markets
  - **Doctor-investors** -- practicing clinicians who see the problem firsthand (also become advisors)
- Terms: SAFE notes, no board seats, 10-15% equity cap
- Use of funds: Hire Community Growth Lead, Content Specialist, 6 months of runway

**Phase 2: Pre-Seed (Months 6-12, after 300+ patients, 25+ clinicians, $700+ MRR)**
- Target: $250K-$500K
- Sources:
  - **Future Africa** (pan-African pre-seed, $50K-$250K)
  - **Ingressive Capital** (West Africa focus)
  - **Flat6Labs** (MENA/Africa)
  - **Global Health Innovative Technology Fund (GHIT)** -- specifically for health platforms
  - **Impact investors** who align with patient-empowerment mission (Omidyar Network, Acumen)
- Terms: Priced round at $2M-$4M valuation, 15-20% equity
- Use of funds: Second developer, sales team, Kenya/Ghana expansion

**Phase 3: Seed (Months 12-18, after proven unit economics)**
- Target: $1M-$3M
- Sources: Health-tech focused VCs (TLcom Capital, Norrsken, Algebra Ventures)
- Only if growth metrics justify it and strategic alignment is confirmed

### Realistic Funding Estimates

| Stage | Amount | Probability | Timeline |
|-------|--------|-------------|----------|
| Grants/competitions | $25K-$100K | Medium-High | Months 1-4 |
| Angel round | $50K-$150K | Medium | Months 3-6 |
| Pre-seed | $250K-$500K | Medium (with traction) | Months 6-12 |
| Seed | $1M-$3M | Lower (needs strong metrics) | Months 12-18 |
| **Total potential (18 months)** | **$1.3M-$3.75M** | | |

### Key Funding Principles

1. **Non-dilutive first**: Exhaust grants and competitions before giving away equity
2. **Aligned investors only**: Health background, Africa experience, patient-first ethos
3. **Small checks, many backers**: 10 angels at $10K each is safer than 1 investor at $100K
4. **Revenue before fundraising**: Even $500/month MRR makes fundraising 10x easier
5. **Keep control**: Maintain >70% founder equity through pre-seed minimum

### What to Create

- `docs/funding-strategy.md` -- the complete funding plan above
- Fix all copywriting gaps identified in Part 1 across About.tsx, Features.tsx, ClinicianWhyOneCare.tsx, Pricing.tsx, pricing-constants.ts, and Footer.tsx

