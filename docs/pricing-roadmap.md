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

### Provider (Future - $29.99/month)
**Target:** Clinicians, pharmacists, healthcare practices
- Multi-patient dashboard
- Bulk patient data access via share links
- HIPAA compliance documentation
- Practice branding options
- Priority support
- API access for EHR integration

---

## Revenue Projections (Conservative 6-Month Forecast)

### Assumptions:
- Starting users: 100
- Monthly growth: 15%
- Free to Essential conversion: 8%
- Essential to Premium upgrade: 25%
- Churn rate: 5%/month

### Month-by-Month:

| Month | Users | Free | Essential | Premium | MRR |
|-------|-------|------|-----------|---------|-----|
| 1 | 100 | 92 | 6 | 2 | $68 |
| 2 | 115 | 104 | 8 | 3 | $95 |
| 3 | 132 | 117 | 11 | 4 | $129 |
| 4 | 152 | 132 | 14 | 6 | $176 |
| 5 | 175 | 149 | 18 | 8 | $230 |
| 6 | 201 | 167 | 23 | 11 | $304 |

**6-Month Total Revenue:** ~$1,002
**Projected Year 1 Revenue (with growth):** ~$5,280

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

### Provider Tier Requirements (Phase 2)
- [ ] Multi-patient dashboard
- [ ] Practice settings & branding
- [ ] HIPAA documentation
- [ ] API access layer
- [ ] Billing per-seat

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
