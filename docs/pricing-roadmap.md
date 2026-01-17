# Pricing & Monetization Roadmap

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

| Month | Users | Free | Essential | Premium | Family | MRR |
|-------|-------|------|-----------|---------|--------|-----|
| 1 | 100 | 89 | 6 | 3 | 2 | $93 |
| 2 | 115 | 100 | 8 | 4 | 3 | $131 |
| 3 | 132 | 112 | 11 | 5 | 4 | $178 |
| 4 | 152 | 126 | 14 | 7 | 5 | $241 |
| 5 | 175 | 142 | 18 | 9 | 6 | $319 |
| 6 | 201 | 159 | 23 | 12 | 7 | $416 |

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

| Month | Total Clinicians | Solo ($49) | Pro ($99) | Enterprise ($249) | MRR |
|-------|------------------|------------|-----------|-------------------|-----|
| 1 | 5 | 5 | 0 | 0 | $245 |
| 2 | 8 | 8 | 0 | 0 | $392 |
| 3 | 12 | 11 | 1 | 0 | $638 |
| 4 | 16 | 13 | 3 | 0 | $934 |
| 5 | 20 | 15 | 4 | 1 | $1,330 |
| 6 | 25 | 18 | 6 | 1 | $1,725 |
| 7 | 30 | 20 | 8 | 2 | $2,270 |
| 8 | 36 | 23 | 10 | 3 | $2,864 |
| 9 | 42 | 26 | 12 | 4 | $3,510 |
| 10 | 49 | 29 | 15 | 5 | $4,211 |
| 11 | 56 | 32 | 18 | 6 | $4,962 |
| 12 | 64 | 35 | 21 | 8 | $5,866 |

**Clinician Year 1 Total:** ~$31,000
**Clinician Year 1 ARR (Month 12 × 12):** ~$70,000

---

### Combined Revenue Summary

| Revenue Stream | 6-Month | Year 1 | Year 1 ARR |
|----------------|---------|--------|------------|
| Consumer Tiers | $1,378 | $7,200 | $5,000 |
| Clinician Tiers | $7,534 | $31,000 | $70,000 |
| **Total** | **$8,912** | **$38,200** | **$75,000** |

**Key Insight:** Clinician tiers represent **81% of projected revenue** despite being a smaller user base. B2B is the primary revenue driver.

---

### Growth Scenarios

**Conservative (above):** 3-5 clinicians/month acquisition
**Moderate:** 8-10 clinicians/month with marketing → Year 1 ARR: ~$150,000
**Aggressive:** 15+ clinicians/month with sales team → Year 1 ARR: ~$300,000

### Revenue per Segment at Scale (Year 3 Target)

| Segment | Users | ARPU | MRR | ARR |
|---------|-------|------|-----|-----|
| Free | 10,000 | $0 | $0 | $0 |
| Essential | 800 | $7 | $5,600 | $67,200 |
| Premium | 400 | $13 | $5,200 | $62,400 |
| Family | 200 | $25 | $5,000 | $60,000 |
| Clinician Solo | 150 | $49 | $7,350 | $88,200 |
| Clinician Pro | 80 | $99 | $7,920 | $95,040 |
| Enterprise | 20 | $249 | $4,980 | $59,760 |
| **Total** | **11,650** | - | **$36,050** | **$432,600** |

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
| Factor | Traditional EHR | OneCare Clinician |
|--------|-----------------|-------------------|
| Per-seat cost | $200-500/month | $49-99/month |
| Implementation | $10K-50K upfront | $0 |
| Patient portal | Separate cost | Included |
| EHR integration | Extra fees | Built-in |
| Mobile experience | Poor/none | Native PWA |

**Value proposition:** 50-80% cost savings while adding patient engagement features traditional EHRs lack.

---

## Implementation Priority

1. **Stripe Integration** - Enable payments
2. **Feature gating** - Enforce tier limits
3. **Upgrade prompts** - In-app upsell CTAs
4. **Annual pricing** - 2-month discount toggle
5. **Provider tier** - After core tiers stable

---

## Notes

- Annual pricing gives ~2 months free (incentive)
- Provider tier creates B2B revenue stream
- Family tier has highest ARPU potential
- Free tier serves as funnel, not destination
