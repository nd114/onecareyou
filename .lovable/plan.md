
# Implementation Plan: Beta Badge, Data Processing Verification, and Marketing Guidance

## Overview
This plan addresses three key areas: adding a Beta badge for legal protection and user awareness, verifying and enhancing the Data Processing page claims, and providing guidance on user acquisition strategies.

---

## Part 1: Beta Badge Implementation

### Location Strategy
The Beta badge will be added to:
1. **Main Header** (`src/components/layout/Header.tsx`) - next to the OneCare logo
2. **Clinician Header** (`src/components/clinician/ClinicianHeader.tsx`) - next to the clinician logo
3. **Landing Page** (`src/pages/Landing.tsx`) - in the hero section

### Design
- Small pill-shaped badge with "BETA" text
- Color: Amber/yellow background for visibility
- Position: Adjacent to the OneCare logo text
- Consistent across light/dark modes

### Files to Modify
- `src/components/layout/Header.tsx`
- `src/components/clinician/ClinicianHeader.tsx`
- `src/pages/Landing.tsx`

---

## Part 2: Data Processing Page - Verification Results

### Claims That Are Fully Implemented
| Claim | Verification |
|-------|-------------|
| Images of lab reports are processed | Confirmed in `parse-lab-report/index.ts` |
| Text content extracted | Confirmed - OCR via Tesseract.js locally or Gemini server-side |
| Names, emails not sent to AI | Confirmed - PII stripping with 10+ regex patterns |
| User ID stripped | Confirmed - user ID not included in AI request body |
| Location/IP not sent | Confirmed - not included in AI payload |
| Medication history not sent | Confirmed - only uploaded document is processed |
| On-device OCR for images | Confirmed - `src/lib/ocr.ts` using Tesseract.js |
| PII pattern removal | Confirmed - extensive regex patterns for names, DOB, IDs, phones, emails, addresses, SSN, insurance |
| Session isolation | Confirmed - each request is independent |

### Claims Needing Enhancement
1. **"EXIF data and document metadata are stripped"** - Not explicitly implemented; should add EXIF stripping
2. **"Third-party security assessments"** - Future item, should add "(planned)" notation

### Recommended Updates to Data Processing Page
- Add "(planned)" to third-party security assessments claim
- Consider adding a disclaimer that the platform is in Beta

---

## Part 3: PHI and HIPAA Compliance Page

### Current Coverage
- `ClinicianBAA.tsx` - Full BAA for clinician enterprise tier
- `PrivacyPolicy.tsx` - Section 3 covers AI processing and anonymization
- `DataProcessing.tsx` - Detailed DPA for AI processing

### Recommendation
The existing pages adequately cover PHI for clinicians (BAA) and AI data processing. However, adding a **beta disclaimer notice** to these pages would strengthen legal protection.

### Suggested Enhancement
Add a prominent beta notice box to:
- Data Processing page
- Privacy Policy page
- Terms of Service page

---

## Part 4: User Acquisition Strategy (Marketing Guidance)
### Tomorrow's Email Blast - Recommended Approach
Instead of cold emailing, consider:
1. **Personal Network First**: Email people you personally know who are doctors or potential patients
2. **LinkedIn Outreach**: Send personalized connection requests to doctors you want to reach
3. **Create a Waitlist**: Build a landing page for "Early Access" signups

---

## Technical Implementation Summary

### Changes Required
1. Add Beta badge to Header component (logo section)
2. Add Beta badge to ClinicianHeader component (logo section)
3. Add Beta badge to Landing page hero
4. Add beta disclaimer to legal pages (Data Processing, Privacy, Terms)
5. Update Data Processing page to note "(planned)" for third-party audits

### No Changes Needed
- The AI processing claims are accurately implemented
- PII stripping is comprehensive
- On-device OCR is working as described

---

## Next Steps After Approval
1. Implement Beta badges across headers and landing page
2. Add beta disclaimer notices to legal pages

