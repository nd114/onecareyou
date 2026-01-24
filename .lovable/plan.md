
# Comprehensive Platform Review: Clinician Test Readiness

## Executive Summary
The platform has a solid foundation for clinician features, but several issues need resolution before clinical testing. The primary concerns fall into three categories: **Brand Consistency (SSOT violations)**, **Clinician UX Issues**, and **Functional Gaps**.

---

## Part 1: Single Source of Truth (SSOT) Violations

### 1.1 Brand Name Inconsistencies
**Critical Issue**: "OneCare" still appears in multiple files despite rebranding to "Marpe"

| Location | Issue | Priority |
|----------|-------|----------|
| `src/pages/EHRComparison.tsx` | 15+ instances of "OneCare" in comparison data, headings, and descriptions | HIGH |
| `src/index.css:7` | Comment: `/* OneCare Design System */` | LOW |
| `docs/comprehensive-platform-review.md` | Title and content use "OneCare" | MEDIUM |
| `docs/requirements-implemented.md` | Title and overview use "OneCare" | MEDIUM |
| `docs/clinician-gaps-implementation-plan.md` | Competitive table uses "OneCare" | MEDIUM |
| `docs/pricing-roadmap.md` | Comparison table uses "OneCare" | MEDIUM |

### 1.2 Email Domain Inconsistency
**Critical Issue**: Two different domains are used inconsistently

| Domain | Used In |
|--------|---------|
| `@marpe.health` | Privacy Policy, Data Processing, Terms of Service (legal/DPO emails) |
| `@marpe.care` | Footer, Help Center, Privacy Policy children's section |

**Recommendation**: Standardize on ONE domain (suggest `@marpe.care` for consistency with published URL).

### 1.3 Missing Brand Constants File
**Problem**: No centralized constants file exists. Brand values are hardcoded across 10+ files.

**Recommendation**: Create `src/lib/brand-constants.ts`:
```typescript
export const BRAND = {
  name: 'Marpe',
  tagline: 'Your Health, Connected',
  domain: 'marpe.care',
  emails: {
    support: 'support@marpe.care',
    privacy: 'privacy@marpe.care',
    legal: 'legal@marpe.care',
    dpo: 'dpo@marpe.care',
  },
  urls: {
    app: 'https://marpecare.lovable.app',
  }
} as const;
```

---

## Part 2: Clinician-Side Issues for Testing

### 2.1 Header Consistency (FIXED)
The `ClinicianHeader` is now correctly used across clinician pages including BAA and Enterprise Inquiry.

### 2.2 Navigation Alignment (FIXED)
Desktop navigation is now properly centered using the three-column flexbox pattern.

### 2.3 Pages Still Using Generic Header
| Page | Current Header | Should Use |
|------|----------------|------------|
| `ClinicianPricing.tsx` | `<Header />` | `<ClinicianHeader />` |
| `ClinicianWhyMarpe.tsx` | `<Header />` | `<ClinicianHeader />` |
| `EHRComparison.tsx` | `<Header />` | `<ClinicianHeader />` (if clinician-only) |

### 2.4 Functional Issues to Verify Before Testing

| Feature | Status | Notes |
|---------|--------|-------|
| Clinician Sign-Up Flow | Working | Two-step process (account + profile) |
| Patient Invitation | Working | Email-based invitation with limit enforcement |
| Guidance Creation | Working | Full category/priority/due date support |
| Patient Risk Indicator | Working | Uses VITAL_RANGES for assessment |
| Alert Rules | Working | CRUD operations functional |
| Subscription Tiers | Working | Solo/Pro/Enterprise with Stripe |
| BAA Signing | Working | SignaturePad implemented, structured address fields |
| Notifications Bell | Working | Popover with unread count |

### 2.5 Potential UX Issues for Clinician Testing

1. **Dashboard Welcome Message**: Shows "Welcome back, Doctor" generically - should use clinician's title and name (e.g., "Welcome back, Dr. Smith")

2. **Patient Limit Enforcement**: Works correctly but upgrade flow opens Stripe in new tab (may confuse some users)

3. **Guidance Templates**: Listed as "Coming soon" in Pro tier but no UI indication in the Create Guidance dialog

4. **EHR Connections Section**: Present in settings but not fully functional (placeholder status)

---

## Part 3: Pre-Clinician Test Checklist

### Critical (Must Fix)
- [ ] Replace all "OneCare" with "Marpe" in `EHRComparison.tsx`
- [ ] Standardize email domain across all files
- [ ] Update `ClinicianPricing.tsx` to use `ClinicianHeader`
- [ ] Update `ClinicianWhyMarpe.tsx` to use `ClinicianHeader`

### High Priority (Should Fix)
- [ ] Create `brand-constants.ts` for centralized branding
- [ ] Update Dashboard welcome to use clinician's actual name/title
- [ ] Update documentation files to use "Marpe" consistently

### Medium Priority (Nice to Have)
- [ ] Add "templates coming soon" indicator in guidance dialog for Pro users
- [ ] Update CSS/config comments from "OneCare" to "Marpe"
- [ ] Review and update internal comparison data

---

## Part 4: Technical Debt Summary

| Category | Count | Example |
|----------|-------|---------|
| Hardcoded email addresses | 8 locations | Footer, legal pages |
| "OneCare" references | 20+ | EHRComparison, docs |
| Inconsistent domain usage | 2 domains | `.health` vs `.care` |
| Missing centralized constants | 1 file needed | brand-constants.ts |

---

## Implementation Estimate

| Task | Effort |
|------|--------|
| Fix EHRComparison.tsx branding | 15 min |
| Fix ClinicianWhyMarpe/Pricing headers | 5 min |
| Standardize email domains | 20 min |
| Create brand-constants.ts | 30 min |
| Update documentation files | 30 min |
| **Total** | **~2 hours** |

---

## Conclusion

The clinician features are functionally complete and ready for testing with minor fixes. The primary risk is **brand confusion** from inconsistent naming. Resolving the SSOT issues before clinician review will ensure a professional, polished experience.
