
# Comprehensive Implementation Plan: Rebrand, Platform Review, and AI Strategy

This plan addresses a multi-faceted set of requirements spanning rebranding, platform readiness review, clinician provisioning, email configuration, and AI implementation strategy.

---

## Part 1: Rebrand from Marpe to OneCare

### Overview
Change all brand references from "Marpe" to "OneCare" with the new domain "onecare.you".

### Files Requiring Updates

#### Core Brand Constants
| File | Changes |
|------|---------|
| `src/lib/brand-constants.ts` | Update name to "OneCare", domain to "onecare.you", all email addresses |
| `docs/branding.md` | Update brand documentation to reflect OneCare |
| `index.html` | Update title, meta tags, Open Graph data |

#### Email Addresses to Update
| Old Address | New Address |
|-------------|-------------|
| support@marpe.care | support@onecare.you |
| privacy@marpe.care | privacy@onecare.you |
| legal@marpe.care | legal@onecare.you |
| dpo@marpe.care | dpo@onecare.you |
| careers@marpe.care | careers@onecare.you |
| eu-privacy@marpe.care | eu-privacy@onecare.you |
| compliance@marpe.care | compliance@onecare.you |

New email to add:
- hello@onecare.you (general contact)

#### Edge Functions Requiring Updates
| Function | File | Changes |
|----------|------|---------|
| send-welcome-email | `supabase/functions/send-welcome-email/index.ts` | Update "from" address, email template text, links |
| notify-job-application | `supabase/functions/notify-job-application/index.ts` | Update "from" address, recipient address, template text |

#### Components with Hardcoded Brand References
| File | Occurrences |
|------|-------------|
| `src/components/layout/Footer.tsx` | Brand name in logo, copyright |
| `src/components/layout/Header.tsx` | Brand name in logo |
| `src/pages/Landing.tsx` | "Marpe eliminates..." hero text |
| `src/pages/PrivacyPolicy.tsx` | Multiple "Marpe" references, email addresses |
| `src/pages/TermsOfService.tsx` | Multiple "Marpe" references |
| `src/pages/DataProcessing.tsx` | Email addresses |
| `src/pages/HelpCenter.tsx` | Email link, FAQ content |
| `src/pages/Careers.tsx` | Careers email address |
| `src/pages/ClinicianBAA.tsx` | Compliance email |
| `src/components/clinician/EHRConfigDialog.tsx` | "Marpe" reference |
| `src/components/clinician/EHRConnectionsSection.tsx` | "Marpe" reference |
| `src/components/ui/MarpeLogoIcon.tsx` | Rename to OneCareLogoIcon |

#### Documentation Updates
| File | Changes |
|------|---------|
| `docs/branding.md` | Complete rewrite for OneCare |
| `docs/comprehensive-platform-review.md` | Update all Marpe references |
| `docs/clinician-gaps-implementation-plan.md` | Update all Marpe references |
| `docs/future-roadmap.md` | Update all Marpe references |
| `docs/pricing-roadmap.md` | Update all Marpe references |
| `docs/requirements-implemented.md` | Update all Marpe references |

#### Logo and Assets
| Current | New |
|---------|-----|
| `src/assets/marpe-logo.png` | Need new OneCare logo asset |
| `src/components/ui/MarpeLogoIcon.tsx` | Rename to `OneCareLogoIcon.tsx` |
| `public/favicon.png` | Update if logo changes |

---

## Part 2: Configure Resend for Email Delivery

### Current State
- `RESEND_API_KEY` is already configured in secrets
- Emails currently use "from" address `welcome@updates.lovable.app` (Lovable default)

### Required Actions

#### 1. Domain Verification in Resend
You need to verify `onecare.you` in Resend:
1. Log into https://resend.com/domains
2. Add domain: `onecare.you`
3. Add the required DNS records (SPF, DKIM, DMARC)
4. Wait for verification to complete

#### 2. Update Edge Functions with Verified Domain
Once verified, update these edge functions:

**send-welcome-email/index.ts**
```typescript
from: 'OneCare <hello@onecare.you>',
```

**notify-job-application/index.ts**
```typescript
from: 'OneCare Careers <careers@onecare.you>',
to: ['careers@onecare.you'],
```

#### 3. Email Routing Configuration
Configure email forwarding/mailboxes for:
- hello@onecare.you (general)
- support@onecare.you (support)
- legal@onecare.you (legal)
- careers@onecare.you (hiring)

---

## Part 3: Provision Clinician Test Access

### Current Database State
Found 1 existing clinician:
- Luke Look (lukelook@grr.la) - subscription_tier: "expired"

### Provisioning Actions
Update the existing clinician and add a second test account:

```sql
-- Update Luke Look to Enterprise tier for testing
UPDATE clinician_profiles 
SET subscription_tier = 'enterprise'
WHERE user_id = '55831ff4-5a7f-42de-a11c-e1764dd7c3f1';

-- For a second clinician, they would need to:
-- 1. Register at /clinician/sign-up
-- 2. Then have their tier upgraded via SQL
```

The second clinician should register through the normal flow, then be upgraded similarly.

---

## Part 4: Advisory Panel Page

### Planned Feature
Add a page to showcase the Clinical Advisory Board and Product Feedback Panel members.

### Implementation (Future)
Create a new page at `/advisory-panel` that displays:
- Advisory board member profiles
- Areas of expertise
- Affiliation/credentials

Add to `docs/future-roadmap.md`:
```markdown
## Advisory Panel & Governance

### Clinical Advisory Board Page
- [ ] `/advisory-panel` page showcasing clinical advisors
- [ ] Advisor profile cards with credentials
- [ ] Integration with Careers page for recruitment

### Product Feedback Panel
- [ ] Display active beta testers and early adopters
- [ ] Testimonials and case studies section
```

---

## Part 5: Comprehensive Platform Review

### Multi-Perspective Analysis

#### 5.1 Patient Perspective

**Strengths**
- Clean onboarding flow with health profile setup
- Intuitive medication tracking with reminder scheduling
- Family member management (Care Circle)
- Vitals tracking with charts and export
- Drug interaction checking

**Issues Identified**
| Issue | Severity | Area |
|-------|----------|------|
| No guided tour for first-time users | Medium | Onboarding |
| Free tier limited to 3 medications - may frustrate users | Medium | Subscription |
| No offline data entry capability | Low | PWA |
| Care Circle requires manual code sharing | Medium | UX |

**Recommendations**
1. Add step-by-step onboarding wizard with tooltips
2. Implement email-based invite for Care Circle (no code copy)
3. Add "Quick Actions" floating button for common tasks

---

#### 5.2 Clinician Perspective

**Strengths**
- Patient list with risk indicators
- Vitals summary and adherence tracking
- Guidance and alert rule systems
- Patient notes (private)
- EHR connection infrastructure ready

**Issues Identified**
| Issue | Severity | Area |
|-------|----------|------|
| Luke Look has "expired" subscription tier | Critical | Access |
| No bulk patient actions | Medium | Efficiency |
| Alert rules require manual setup per patient | Medium | Workflow |
| No patient summary PDF export | Low | Reporting |

**Recommendations**
1. Fix clinician subscription tiers before launch
2. Add "Copy guidance template to multiple patients" feature
3. Implement alert rule templates that auto-apply to new patients

---

#### 5.3 Hospital/Enterprise Perspective

**Strengths**
- BAA signing workflow implemented
- Enterprise inquiry form exists
- EHR integration architecture in place

**Issues Identified**
| Issue | Severity | Area |
|-------|----------|------|
| No actual license verification | High | Compliance |
| BAA signing doesn't integrate with practice management | Medium | Legal |
| No multi-seat team management | Medium | Enterprise |
| No SSO/SAML support | Medium | Enterprise |

**Recommendations**
1. Add license verification partnership (future)
2. Implement team member invitation for practices
3. Add SSO capability for enterprise deployments

---

#### 5.4 Developer Perspective

**Strengths**
- Clean codebase with TypeScript
- Proper separation of concerns (hooks, components, pages)
- Supabase RLS policies well-implemented
- Edge functions properly authenticated

**Issues Identified**
| Issue | Severity | Area |
|-------|----------|------|
| Some email addresses hardcoded (not using brand-constants) | Medium | Maintainability |
| `supabase.auth.getClaims` may not work as expected | Medium | Auth |
| No unit tests for critical flows | High | Testing |
| No error tracking/monitoring (Sentry) | Medium | Operations |

**Recommendations**
1. Migrate all brand references to use `brand-constants.ts`
2. Review auth flow in `send-welcome-email` - `getClaims` is non-standard
3. Add Vitest unit tests for hooks
4. Integrate Sentry for error tracking

---

#### 5.5 Product Owner Perspective

**Strengths**
- Clear value proposition (patient-provider bridge)
- Subscription tiers defined
- Stripe integration ready
- Roadmap documented

**Issues Identified**
| Issue | Severity | Area |
|-------|----------|------|
| Clinician subscriptions show "expired" | Critical | Revenue |
| No analytics/metrics dashboard | High | Insights |
| Pricing page doesn't show clinician tiers clearly | Medium | Sales |

**Recommendations**
1. Ensure all test clinicians have valid subscriptions
2. Add project analytics (see analytics tool in Lovable)
3. Create dedicated clinician pricing section

---

#### 5.6 UI/UX Designer Perspective

**Strengths**
- Consistent design system (Radix + Tailwind)
- Dark mode support
- Responsive mobile layouts
- Smooth animations (Framer Motion)

**Issues Identified**
| Issue | Severity | Area |
|-------|----------|------|
| Hero section gradient fixed (was issue, now resolved) | Resolved | Visual |
| No loading skeleton consistency | Low | Polish |
| Some forms lack validation feedback | Medium | Forms |
| Mobile navigation could be streamlined | Low | Mobile |

**Recommendations**
1. Add skeleton loaders to all data-loading states
2. Ensure all forms show inline validation errors
3. Consider bottom navigation for mobile app

---

#### 5.7 QA Analyst Perspective

**Critical Test Cases to Verify Before Launch**

| Flow | Test Cases | Status |
|------|------------|--------|
| Patient Registration | Sign up, email confirmation, profile completion | Needs testing |
| Medication CRUD | Add, edit, delete, discontinue medications | Needs testing |
| Vitals Recording | Manual entry, lab report parsing, history view | Needs testing |
| Care Circle | Create share, copy link, revoke access | Needs testing |
| Clinician Registration | Sign up, profile setup, dashboard access | Needs testing |
| Patient-Clinician Flow | Invite, accept, view patient data | Needs testing |
| Subscription | Upgrade, manage, cancel (patient + clinician) | Needs testing |
| Password Reset | Request, email received, reset successful | Needs testing |
| BAA Signing | Form completion, PDF download, view signed | Needs testing |

**Automated Testing Gaps**
- No E2E tests with Playwright/Cypress
- Only 1 example unit test exists
- No integration tests for edge functions

---

### Summary of Critical Pre-Launch Fixes

| Priority | Item | Category |
|----------|------|----------|
| 1 | Complete rebrand to OneCare | Branding |
| 2 | Configure Resend with onecare.you domain | Email |
| 3 | Fix clinician subscription tiers | Access |
| 4 | Manual testing of all critical flows | QA |
| 5 | Review auth in send-welcome-email edge function | Security |

---

## Part 6: AI Implementation Strategy

### Currently Implemented AI Features
1. **Medication Identifier** (`identify-pill`) - Uses Gemini to analyze pill photos
2. **Lab Report Parser** (`parse-lab-report`) - OCR + vital extraction with PII stripping

### Pre-Launch AI Opportunities

#### 6.1 Clinician Alert Intelligence (Recommended)

**Use Case**: Clinicians want to be notified only when specific metrics are reached, not for every data point.

**Implementation Approach**:
```text
Clinician sets rules like:
- "Alert me when glucose > 180 mg/dL for 3 consecutive readings"
- "Alert me when blood pressure systolic > 140"
- "Alert me when medication adherence drops below 70%"
```

This is NOT new AI - it's rule-based logic that already exists in `check-vital-alerts`:
- The `clinician_alert_rules` table stores threshold rules
- The edge function checks thresholds and sends notifications
- No AI needed - just conditional logic

**Gap**: The UI for creating these rules exists (`CreateAlertRuleDialog`), but needs:
- Better presets ("High glucose alert", "Blood pressure warning")
- Consecutive reading logic (e.g., "3 readings in a row")
- Time-based constraints ("during night hours only")

#### 6.2 Natural Language Quick Actions (Future)

**Your Idea**: Let users type actions in one place and AI routes to the right feature.

**Examples**:
- "Log my blood pressure 120/80" - Routes to vitals
- "Add aspirin 100mg daily" - Routes to medications
- "Share my data with Dr. Smith" - Routes to Care Circle

**Implementation**:
```typescript
// New edge function: ai-quick-action
// Uses Lovable AI to parse intent and parameters
// Returns structured action to frontend
```

**Risk Assessment**:
- LOW RISK: Routing/parsing only - doesn't execute dangerous actions
- User still confirms before final action
- Could be a Premium feature

**Recommendation**: Add to post-launch roadmap. Requires careful prompt engineering to ensure reliable parsing.

#### 6.3 Clinician Transcript Summarization (Not Recommended for Now)

You mentioned a clinician uses "Health Bridge" for consultation transcripts. 

**Why NOT to build this now**:
1. Requires HIPAA-compliant audio processing
2. Liability concerns with AI-generated medical notes
3. Competes with established players (Health Bridge, Nuance DAX)
4. Out of scope for patient-provider bridge MVP

**Alternative**: Allow clinicians to paste existing transcripts and extract action items (guidance to send, alerts to set).

#### 6.4 Recommended Pre-Launch AI Additions

| Feature | Effort | Value | Recommendation |
|---------|--------|-------|----------------|
| Smart Alert Presets | Low | High | Yes - Add common rule templates |
| Medication Name Autocomplete | Low | Medium | Already exists (RxNorm lookup) |
| Vital Trend Insights | Medium | Medium | Post-launch - "Your glucose is trending up" |
| Quick Action Parser | Medium | High | Post-launch - v1.1 feature |

---

## Implementation Sequence

### Phase 1: Pre-Launch Critical (Days 1-3)
1. Complete OneCare rebrand (all files)
2. Configure Resend domain verification
3. Update edge function email addresses
4. Fix clinician subscription tiers
5. Manual QA of critical flows

### Phase 2: Launch Polish (Days 4-5)
1. Add advisory panel placeholder to roadmap
2. Fix any bugs found in QA
3. Update documentation
4. Review and deploy edge functions

### Phase 3: Post-Launch (Week 2+)
1. Implement smart alert presets
2. Add analytics tracking
3. Consider natural language quick actions
4. Add onboarding wizard

---

## Technical Notes

### Auth Issue in send-welcome-email
The current implementation uses:
```typescript
await supabase.auth.getClaims(token);
```

This is not a standard Supabase method. Should use:
```typescript
const { data: { user }, error } = await supabase.auth.getUser(token);
const userEmail = user?.email;
```

### Brand Constants Migration
After updating `brand-constants.ts`, search for and replace all hardcoded instances:
- `@marpe.care` - 77 occurrences
- `Marpe` (case-sensitive) - 889 occurrences across 55 files

The search results show exactly which files need updates.

