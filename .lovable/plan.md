

# Implementation Plan: BAA View State, Dark Mode Fix, Theme Toggle for Guests, and Careers Page

This plan addresses four distinct requests and a fifth strategic discussion.

---

## 1. BAA Page: Show Existing Agreement Instead of Re-signing

### Problem
When a clinician who has already signed the BAA visits `/clinician/baa`, they see the signing form again instead of viewing their existing agreement.

### Solution
Query for existing BAA on page load and conditionally render:
- **If signed**: Show a "view agreement" state with download PDF, signed date, and agreement details
- **If updated agreement version**: Show a notice that continued use constitutes acceptance of updated terms, with option to review and download

### Technical Changes

**File: `src/pages/ClinicianBAA.tsx`**

1. Add a query to fetch existing BAA agreement on mount (similar to `useClinicianOnboarding.ts`)
2. Create a new "Signed Agreement View" component state showing:
   - Agreement status badge (Active)
   - Signed date and version
   - Practice/signatory details (read-only)
   - Download PDF button
   - Agreement text in scrollable view
3. Add version comparison logic:
   - Store current agreement version as constant (e.g., `CURRENT_BAA_VERSION = '1.0'`)
   - If user's signed version differs from current, show an "Agreement Updated" banner
   - Text: "This agreement was updated on [date]. By continuing to use Marpe, you accept the updated terms."
   - Provide "Review Changes" and "Download Updated Agreement" options

### Database Consideration
The `baa_agreements` table already has an `agreement_version` column and `status` field, which supports this flow without schema changes.

---

## 2. Dark Mode: Fix Hero Section Gradient on Landing Page

### Problem
Looking at the screenshots, in dark mode the hero section background uses `gradient-hero` which is defined as:
```css
--gradient-hero: linear-gradient(135deg, hsl(168 76% 95%) 0%, hsl(199 89% 95%) 50%, hsl(234 89% 95%) 100%);
```

This light gradient is never overridden in the `.dark` class, causing a washed-out light background in dark mode that makes text unreadable (especially "Bridge the Gap Between" which appears in muted colors).

### Solution
Add a dark mode variant for `--gradient-hero` in `src/index.css`:

**File: `src/index.css`**

In the `.dark` class (around line 98-135), add:
```css
--gradient-hero: linear-gradient(135deg, hsl(220 20% 12%) 0%, hsl(220 25% 15%) 50%, hsl(225 25% 18%) 100%);
```

This creates a subtle dark gradient that matches the dark theme's background tones while providing visual interest.

---

## 3. Theme Toggle for Signed-Out Users

### Problem
The theme toggle (Sun/Moon icon) is only visible to authenticated users in the ClinicianHeader. Signed-out users on the public Header cannot change themes.

### Solution
Add theme toggle to the public Header component for all users.

**File: `src/components/layout/Header.tsx`**

1. Import `useTheme` from `@/contexts/ThemeContext`
2. Add the same theme toggle button pattern used in ClinicianHeader
3. Position it before the "Sign In" button in the right-side actions area
4. Include the toggle in the mobile menu as well

Code pattern to add:
```tsx
const { resolvedTheme, setTheme } = useTheme();

const toggleTheme = () => {
  setTheme(resolvedTheme === 'light' ? 'dark' : 'light');
};

// In the header actions area (before Sign In button):
<Button
  variant="ghost"
  size="icon"
  onClick={toggleTheme}
  aria-label="Toggle theme"
>
  {resolvedTheme === 'dark' ? (
    <Sun className="h-5 w-5" />
  ) : (
    <Moon className="h-5 w-5" />
  )}
</Button>
```

---

## 4. Jobs/Careers Page

### Overview
Create a public-facing careers page at `/careers` that showcases open positions and company culture.

### Proposed Structure

**New File: `src/pages/Careers.tsx`**

Sections:
1. **Hero**: "Join the Marpe Team" with mission statement
2. **Why Work With Us**: Company values, remote-first culture, healthcare impact
3. **Open Positions**: List of roles with category, location (remote), and brief description
4. **Application CTA**: Simple form or email link

### Routing

**File: `src/App.tsx`**
- Add route: `<Route path="/careers" element={<Careers />} />`

### Footer/Navigation
- Add "Careers" link to footer navigation

---

## 5. Strategy: First Hires for Lean Growth

You asked for thoughts on who to hire first. Based on your stage and the healthcare B2B2C model:

### Recommended Priority Order

| Priority | Role | Type | Rationale |
|----------|------|------|-----------|
| 1 | **Outbound Sales / Client Acquisition** | Paid, Part-time/Contract | Revenue generation is critical. Someone who can reach out to clinics, schedule demos, and close deals. |
| 2 | **Clinical Advisor** | Unpaid Advisory | A practicing physician or nurse who can validate features, provide credibility, and make introductions. Offer equity or future paid role. |
| 3 | **Content/Social Media** | Paid, Part-time/Contract | Healthcare content marketing builds trust. Someone who can write patient education content, case studies, and manage LinkedIn/X presence. |
| 4 | **Customer Success** | Paid, Part-time (later) | Once you have paying clinician customers, someone to onboard them and reduce churn. Could be combined with sales initially. |

### Positions to List on Careers Page
- **Sales Development Representative** (Remote, Part-time/Contract)
- **Healthcare Content Specialist** (Remote, Contract)
- **Clinical Advisory Board** (Unpaid, Physicians/Nurses welcome)
- **Product Feedback Panel** (Unpaid, Clinicians who want early access)

This approach keeps costs low while building the sales pipeline and clinical credibility needed for healthcare B2B.

---

## Summary of Files to Modify

| File | Changes |
|------|---------|
| `src/pages/ClinicianBAA.tsx` | Add existing BAA query, signed view state, version update handling |
| `src/index.css` | Add dark mode `--gradient-hero` variable |
| `src/components/layout/Header.tsx` | Add theme toggle for all users (authenticated and guests) |
| `src/pages/Careers.tsx` | New file - careers page |
| `src/App.tsx` | Add `/careers` route |
| `src/components/layout/Footer.tsx` | Add Careers link to footer navigation |

