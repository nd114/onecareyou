# Pricing & Monetization Roadmap

> **Read this first (August 2026).** This file grew in layers and the older tables below no longer
> match what is live or what is planned. The current position:
>
> - **Live and unchanged.** `/pricing` shows Enterprise as **"From $399/month"** with Contact Sales
>   beyond it. That is a deliberate public self-serve floor, not a stale number — large-hospital
>   deals are negotiated, and their rates are not published. No code change is pending here;
>   `src/lib/pricing-constants.ts` stays the source of truth for patient pricing.
> - **Do not conflate clinician pricing with enterprise pricing.** Solo/Pro are per-clinician
>   products. The hospital fee is an institutional contract. They move independently.
> - **Enterprise hospital pricing follows the v4 model** in §"Enterprise pricing model (v4)" below.
> - **Regional pricing is planned, not live.** Every patient market is on the global $9.99/$99.90
>   today.
>
> The 2026 tables further down that show Enterprise at **$249/month**, and the feature-gating table
> showing **Solo $79 / Pro $149**, are historical drafts. They are kept for the reasoning, not as
> current prices.

## Current Analysis

The existing pricing structure has several issues:

1. **Value positioning** - Free tier gives away too much
2. **Missing revenue** - No clinician/enterprise tiers
3. **Conversion gaps** - Limited upsell paths

---

## Proposed Pricing Tiers

### Free ($0/month)

**Target:** Casual users exploring the platform

- 3 medications max
- Basic vitals tracking (7-day history only)
- No AI features
- No Care Circle sharing
- No health exports

### Essential ($6.99/month | $55.99/year)

**Target:** Individual health-conscious users

- Unlimited medications
- Full vitals history (all time)
- Basic Care Circle (1 provider share)
- Manual data entry only
- Basic health exports (PDF)
- Email support

### Premium ($12.99/month | $103.99/year)

**Target:** Power users with complex health needs

- All Essential features
- **AI lab report parsing** (OCR upload)
- Unlimited Care Circle shares
- Health exports (PDF, CSV, FHIR)
- Medication interaction alerts
- Priority email support
- Custom health reminders

### Family ($24.99/month | $199.99/year)

**Target:** Caregivers managing multiple family members

- All Premium features
- Up to 5 family member profiles
- Unified family dashboard
- Caregiver access controls
- Shared medication lists
- Family health reports

### Clinician Solo ($49/month | $399/year)

**Target:** Independent practitioners, solo clinicians

- Up to 50 active patient connections
- Real-time vitals monitoring dashboard
- Guidance sending & tracking
- Alert rules (5 max per patient)
- Basic EHR sync (Vericlaim, HealthBridge)
- Email notifications
- Standard support

### Clinician Pro ($99/month | $799/year)

**Target:** Busy clinicians, small practices

- Up to 200 active patient connections
- Unlimited alert rules
- Team member access (2 seats included)
- Priority EHR sync with conflict resolution
- Custom practice branding
- Bulk guidance templates
- Push + email notifications
- Priority support

### Practice/Enterprise ($249/month | Custom annually)

**Target:** Multi-provider practices, clinics, hospitals

- Unlimited patient connections
- Unlimited team seats
- Dedicated account manager
- HIPAA BAA documentation
- Full API access
- White-label options
- Custom EHR integrations
- SLA guarantees
- Onboarding assistance

---

## Revenue Projections

### Patient/Consumer Tiers (6-Month Forecast)

**Assumptions:**

- Starting users: 100
- Monthly growth: 15%
- Free to Essential conversion: 8%
- Essential to Premium upgrade: 25%
- Premium to Family upgrade: 15%
- Churn rate: 5%/month

| Month | Users | Free | Essential | Premium | Family | MRR  |
| ----- | ----- | ---- | --------- | ------- | ------ | ---- |
| 1     | 100   | 89   | 6         | 3       | 2      | $93  |
| 2     | 115   | 100  | 8         | 4       | 3      | $131 |
| 3     | 132   | 112  | 11        | 5       | 4      | $178 |
| 4     | 152   | 126  | 14        | 7       | 5      | $241 |
| 5     | 175   | 142  | 18        | 9       | 6      | $319 |
| 6     | 201   | 159  | 23        | 12      | 7      | $416 |

**Consumer 6-Month Total:** ~$1,378
**Consumer Year 1 Projected:** ~$7,200

---

### Clinician Tiers (12-Month Forecast)

**Assumptions:**

- Starting clinicians: 5 (beta users from existing relationships)
- Monthly clinician acquisition: 3-5 new signups
- Solo to Pro upgrade rate: 20% after 3 months
- Pro to Enterprise: Direct sales, 1-2 per quarter
- Clinician churn: 3%/month (lower due to B2B stickiness)

| Month | Total Clinicians | Solo ($49) | Pro ($99) | Enterprise ($249) | MRR    |
| ----- | ---------------- | ---------- | --------- | ----------------- | ------ |
| 1     | 5                | 5          | 0         | 0                 | $245   |
| 2     | 8                | 8          | 0         | 0                 | $392   |
| 3     | 12               | 11         | 1         | 0                 | $638   |
| 4     | 16               | 13         | 3         | 0                 | $934   |
| 5     | 20               | 15         | 4         | 1                 | $1,330 |
| 6     | 25               | 18         | 6         | 1                 | $1,725 |
| 7     | 30               | 20         | 8         | 2                 | $2,270 |
| 8     | 36               | 23         | 10        | 3                 | $2,864 |
| 9     | 42               | 26         | 12        | 4                 | $3,510 |
| 10    | 49               | 29         | 15        | 5                 | $4,211 |
| 11    | 56               | 32         | 18        | 6                 | $4,962 |
| 12    | 64               | 35         | 21        | 8                 | $5,866 |

**Clinician Year 1 Total:** ~$31,000
**Clinician Year 1 ARR (Month 12 × 12):** ~$70,000

---

### Combined Revenue Summary

| Revenue Stream  | 6-Month    | Year 1      | Year 1 ARR  |
| --------------- | ---------- | ----------- | ----------- |
| Consumer Tiers  | $1,378     | $7,200      | $5,000      |
| Clinician Tiers | $7,534     | $31,000     | $70,000     |
| **Total**       | **$8,912** | **$38,200** | **$75,000** |

**Key Insight:** Clinician tiers represent **81% of projected revenue** despite being a smaller user base. B2B is the primary revenue driver.

---

### Growth Scenarios

**Conservative (above):** 3-5 clinicians/month acquisition
**Moderate:** 8-10 clinicians/month with marketing → Year 1 ARR: ~$150,000
**Aggressive:** 15+ clinicians/month with sales team → Year 1 ARR: ~$300,000

### Revenue per Segment at Scale (Year 3 Target)

| Segment        | Users      | ARPU | MRR         | ARR          |
| -------------- | ---------- | ---- | ----------- | ------------ |
| Free           | 10,000     | $0   | $0          | $0           |
| Essential      | 800        | $7   | $5,600      | $67,200      |
| Premium        | 400        | $13  | $5,200      | $62,400      |
| Family         | 200        | $25  | $5,000      | $60,000      |
| Clinician Solo | 150        | $49  | $7,350      | $88,200      |
| Clinician Pro  | 80         | $99  | $7,920      | $95,040      |
| Enterprise     | 20         | $249 | $4,980      | $59,760      |
| **Total**      | **11,650** | -    | **$36,050** | **$432,600** |

---

## Features to Build Before Launch

### Essential Tier Requirements

- [ ] Medication limit enforcement (3 for free)
- [ ] Vitals history time-gating (7 days for free)
- [ ] Care Circle share limits
- [ ] PDF export functionality
- [ ] Subscription/payment integration (Stripe)

### Premium Tier Requirements

- [x] AI lab report parsing (already built)
- [ ] Medication interaction database
- [ ] CSV/FHIR export formats
- [ ] Custom reminder system
- [ ] Priority support queue

### Family Tier Requirements

- [ ] Multi-profile management
- [ ] Family dashboard view
- [ ] Caregiver role & permissions
- [ ] Shared medication list UI

### Clinician Solo Tier Requirements

- [x] Multi-patient dashboard (already built)
- [x] Patient vitals monitoring (already built)
- [x] Guidance system (already built)
- [x] Alert rules (already built)
- [ ] Patient connection limits (50 max)
- [ ] EHR OAuth integration (Vericlaim, HealthBridge)

### Clinician Pro Tier Requirements

- [ ] Increased patient limit (200 max)
- [ ] Unlimited alert rules
- [ ] Team member seats (invite system)
- [ ] Practice branding settings
- [ ] Bulk guidance templates
- [ ] Priority EHR sync queue

### Practice/Enterprise Tier Requirements

- [ ] Unlimited patients/seats
- [ ] HIPAA BAA document generation
- [ ] Full API access layer
- [ ] White-label configuration
- [ ] Custom EHR integration support
- [ ] SLA monitoring dashboard

---

## Competitive Positioning

### vs. Traditional EHR Add-ons

| Factor            | Traditional EHR  | OneCare Clinician |
| ----------------- | ---------------- | ----------------- |
| Per-seat cost     | $200-500/month   | $49-99/month      |
| Implementation    | $10K-50K upfront | $0                |
| Patient portal    | Separate cost    | Included          |
| EHR integration   | Extra fees       | Built-in          |
| Mobile experience | Poor/none        | Native PWA        |

**Value proposition:** 50-80% cost savings while adding patient engagement features traditional EHRs lack.

---

## Implementation Priority

1. **Stripe Integration** - Enable payments
2. **Feature gating** - Enforce tier limits
3. **Upgrade prompts** - In-app upsell CTAs
4. **Annual pricing** - 2-month discount toggle
5. **Provider tier** - After core tiers stable

---

## Regional Pricing Strategy (Planned)

**Status:** Deferred — launch with single global pricing, implement regional pricing post-launch.

**Problem:** The Solo tier at $79/mo is prohibitive for many African practitioners (e.g. Nigerian clinicians), while $399/mo Enterprise is already 50-80% cheaper than Western EHR competitors.

**Planned Approach:**
1. **Dual pricing tiers** — separate price points for emerging markets (Africa, SE Asia, Latin America) vs. Western markets (US, EU, UK, Canada, Australia).
2. **Auto-detection by country** — use Stripe billing address (not IP/geolocation) to assign the correct regional price. This prevents VPN exploitation since payment method country is verified by the card issuer.
3. **Anti-abuse safeguards:**
   - Stripe billing address verification (card country must match regional tier)
   - Flag accounts where billing country changes frequently
   - Terms of Service clause prohibiting regional pricing abuse
4. **Marketing angle:** Position as "OneCare for Africa" or localized landing pages, not as a "discount" — frame it as accessibility and market-appropriate pricing.

**Why not now:**
- Need sufficient user data to set correct regional price points
- Stripe multi-currency setup requires additional configuration
- Want to validate core pricing before adding complexity

---

## Clinician Feature Gating (Current)

| Feature                       | Solo ($79) | Pro ($149) | Enterprise ($399+) |
| ----------------------------- | ---------- | ---------- | ------------------- |
| Vital threshold alerts        | ✅          | ✅          | ✅                   |
| Custom alert thresholds       | ✅          | ✅          | ✅                   |
| Clinical guidance tools       | ✅          | ✅          | ✅                   |
| Patient adherence reports     | ✅          | ✅          | ✅                   |
| Email & push notifications    | ✅          | ✅          | ✅                   |
| Patient limit                 | 25         | 100        | Unlimited           |
| Patient engagement analytics  | ❌          | ✅          | ✅                   |
| Team member access            | 1 seat     | 3 seats    | Unlimited           |
| Practice branding             | ❌          | ❌          | ✅                   |
| HIPAA BAA                     | ❌          | ❌          | ✅                   |
| EHR/FHIR integration          | ❌          | ❌          | ✅ (coming soon)     |
| API access                    | ❌          | ❌          | ✅ (coming soon)     |
| Dedicated account manager     | ❌          | ❌          | ✅                   |

**Design rationale:** Pro needs meaningful differentiation beyond patient limits — analytics and team seats provide that. Enterprise gates high-touch features (branding, BAA, dedicated support) that justify the price jump.

---

## Notes

- Annual pricing gives ~2 months free (incentive)
- Provider tier creates B2B revenue stream
- Family tier has highest ARPU potential
- Free tier serves as funnel, not destination
- Enterprise displayed as "From $399/month" to signal custom pricing availability

---

## Storage as a priced dimension (Aug 2026)

Medical records are storage-heavy — PDFs, images, dictation transcripts, chat archives, snapshots.
Storage is metered per account and pooled per tenant (`storage_ledger`), and priced as **bundled
allowance + add-on packs**, never as a surprise per-GB line item.

### Included allowances

| Plan | Included storage |
| --- | --- |
| Patient Free | 500 MB |
| Patient Premium | 10 GB |
| Clinician Trial | 2 GB |
| Clinician Solo | 25 GB |
| Clinician Pro | 100 GB |
| Enterprise / Hospital | 1 TB pooled across the tenant |

### Add-on packs (monthly)

| Pack | Price |
| --- | --- |
| 50 GB | $9 |
| 250 GB | $39 |
| 1 TB | $129 |

Self-serve pack purchase is coming soon; packs are added manually today.

### Cost-control policy

- Audio is transcribed and the recording discarded by default — transcripts cost a fraction of audio.
- Documents keep one canonical copy; shares are signed URLs, not duplicates.
- Snapshots are HTML, not re-rendered PDFs.

### Durability we sell on

Multi-zone replication, point-in-time recovery, weekly independent export to separate storage, and
documented restore drills. This is a trust feature for clinicians as much as a cost line — it is
surfaced in Practice → Storage & durability and in patient Settings.

Source of truth: `src/lib/storage-constants.ts`.

---

## Enterprise pricing model (v4) — hospital contracts

Source: `OneCare_Enterprise_Pricing_Scenarios.xlsx` (v4). Summarised here so the repo does not
depend on a spreadsheet nobody can find later. **None of this is published or enforced in code** —
it is the basis for negotiated hospital contracts.

### Why the published floor is not the hospital price

At Year-3 maturity a large hospital's patient population alone is worth roughly $93,600/year in
subscriptions. A $399/month base is $4,788/year — about 5% of that, and the same price a 25-patient
solo practice pays. The floor is a small-practice entry point; hospital deals need their own range.

### B2B hospital fee, by size and region (monthly)

| Size tier | Range |
| --- | --- |
| Small practice / clinic (published floor) | $399 – $799 |
| Mid-size hospital | $1,500 – $3,500 |
| Large hospital | $2,000 – $8,000, by region |

| Large hospital by region | Low | Mid (modelled) | High |
| --- | --- | --- | --- |
| Nigeria / emerging Africa — **OC-LMC's tier** | $2,000 | **$2,750** | $3,500 |
| Europe | $3,000 | $4,250 | $5,500 |
| North America | $4,000 | $6,000 | $8,000 |

Europe and North America are illustrative and need real validation before external use.

### Patient subscription, by region (planned)

| Region | Monthly | Annual |
| --- | --- | --- |
| Nigeria / emerging Africa | $6 | $59.90 |
| Europe | $12 | $119.90 |
| North America | $12 | $119.90 |
| **Global default — live today** | **$9.99** | **$99.90** |

Nigeria's rate is benchmarked against local subscription norms (Netflix ~$6, DStv Confam ~$7.86).

### Other terms

- **Revenue split:** OneCare 70% / institution 30% of patient subscription revenue. Institutional,
  not per-clinician; solo and small practices stay on a flat fee with no split.
- **Onboarding:** $2,500 one-time at hospital scale, scaled by complexity (departments, integration
  scope) rather than region — it costs the same to onboard wherever the hospital is.
- **Storage overage:** ~$150/month typical, usage-based.
- **Seats:** unlimited and included. A clinician affiliated with several hospitals costs each of
  them nothing extra.
- **Prepay:** 20% discount, 2–3 year term. A 10-year prepay locks today's price against a decade of
  rising cost-to-serve — modelled and not recommended.

### What this implies for code, when regional pricing lands

The revenue-share card computes the hospital's share from `PRICE_INFO.premium_monthly.price`, which
is correct while every market pays the global rate. Once a patient's price varies by region, that
figure has to come from the patient's own subscription rather than a constant, or hospitals in
lower-priced regions will be shown inflated estimates. Flagged now so it is not discovered by a
hospital reading its own statement.
