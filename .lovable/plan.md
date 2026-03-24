## SEO Optimization Plan for OneCare

### Current State: What's Wrong

The platform has **critical SEO gaps** that are preventing search engine visibility:

1. **No per-page meta tags** -- There is zero usage of `react-helmet` or any dynamic `<title>`/`<meta>` management. Every single page serves the same `<title>` ("OneCare - Your Health, Connected") and `<meta description>` from `index.html`. Google sees the same title for `/features`, `/pricing`, `/about`, `/contact`, etc. This is a major ranking penalty.
2. **No canonical URLs** -- No `<link rel="canonical">` on any page. Search engines may index duplicate or preview URLs.
3. **No structured data (JSON-LD)** -- Zero Schema.org markup. Google can't generate rich snippets (FAQ, Organization, Product, BreadcrumbList, etc.).
4. **SPA rendering problem** -- The app is a client-side React SPA. Googlebot can render JavaScript, but it's slower and less reliable. There's no pre-rendering or SSR fallback.
5. **Generic OG/Twitter images** -- The `og:image` points to a generic Lovable placeholder (`lovable.dev/opengraph-image-p98pqg.png`), not OneCare branding.
6. **Sitemap is static and incomplete** -- `public/sitemap.xml` is hand-maintained, missing pages like `/careers`, `/sitemap`, `/ehr-comparison`, and has no `<lastmod>` dates.
7. **No semantic HTML landmarks** -- Pages use generic `<div>` and `<section>` without `<main>`, `<article>`, or heading hierarchy best practices consistently.
8. **Missing image alt text in key places** -- The landing page mock dashboard has no `alt` attributes on visual elements.

---

### Implementation Plan

#### Step 1: Add Dynamic Per-Page Meta Tags

Install `react-helmet-async` and create a reusable `<SEO>` component.

- **New file**: `src/components/seo/SEOHead.tsx`
  - Props: `title`, `description`, `canonical`, `ogImage`, `ogType`, `noIndex`
  - Renders `<Helmet>` with unique `<title>`, `<meta name="description">`, `<link rel="canonical">`, Open Graph tags, Twitter card tags
  - Default fallback values from `brand-constants.ts`
- **Wrap App** with `<HelmetProvider>` in `main.tsx`
- **Add `<SEOHead>` to every public page** with unique, keyword-rich titles and descriptions:


| Page                 | Title                                                           | Description (truncated)                                                                                                |
| -------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `/`                  | OneCare -- Bridge the Gap Between Patient & Provider            | Eliminate information asymmetry. Share health updates with your doctors after leaving the hospital...                  |
| `/features`          | Features -- Care Coordination, Vitals Tracking & More | OneCare | Explore OneCare's health tracking features: health vault, medication management, vitals monitoring, care circle...     |
| `/pricing`           | Pricing -- Free & Premium Health Tracking Plans | OneCare       | Compare OneCare plans. Start free with medication tracking and vitals. Upgrade for health vault, advanced analytics... |
| `/about`             | About OneCare -- Our Mission to Connect Patients & Providers    | Learn how OneCare eliminates information asymmetry between patients and providers...                                   |
| `/contact`           | Contact Us | OneCare                                            | Get in touch with the OneCare team for support, partnerships, or feedback...                                           |
| `/help`              | Help Center | OneCare                                           | Find answers to common questions about medication tracking, vitals, care sharing...                                    |
| `/clinician/pricing` | Clinician Plans & Pricing | OneCare for Healthcare Providers    | HIPAA-ready clinician portal. Monitor patient vitals, manage care teams...                                             |
| `/careers`           | Careers at OneCare -- Join Our Healthcare Team                  | Explore open positions at OneCare. Help us bridge the gap between patients and providers...                            |


*(Similar unique titles/descriptions for all remaining public pages)*

#### Step 2: Add Structured Data (JSON-LD)

- **New file**: `src/components/seo/StructuredData.tsx` -- renders `<script type="application/ld+json">`
- **Landing page**: `Organization` + `WebApplication` + `FAQPage` schema
- **Pricing page**: `Product` with `Offer` schema (Free tier, Premium tier)
- **About page**: `Organization` with `foundingDate`, `description`
- **Careers page**: `JobPosting` schema for each open role
- **All pages**: `BreadcrumbList` schema based on current route

#### Step 3: Fix Open Graph & Social Sharing

- Update `index.html` default `og:image` to a proper OneCare branded image (or generate one)
- Add per-page OG images where possible via `<SEOHead>`
- Fix `og:url` to use the canonical URL per page
- Add `og:site_name: "OneCare"`

#### Step 4: Improve Sitemap

- Add missing pages: `/careers`, `/sitemap`, `/clinician/why-onecare`
- Add `<lastmod>` dates to all entries
- Remove any protected/authenticated routes that shouldn't be indexed
- Keep the static XML approach (sufficient for this site size)

#### Step 5: Add robots meta for protected pages

- Add `<meta name="robots" content="noindex">` to all authenticated routes (dashboard, settings, medications, etc.) via the `<SEOHead>` component with `noIndex={true}`

#### Step 6: Semantic HTML & Accessibility Improvements

- Add `<main>` landmark to each page's primary content area
- Ensure heading hierarchy: one `<h1>` per page, proper `<h2>`/`<h3>` nesting
- Add `aria-label` to navigation sections

#### Step 7: Performance & Core Web Vitals

- Add `loading="lazy"` to below-fold images
- Add `fetchpriority="high"` to hero section critical elements
- Ensure fonts are preloaded in `index.html` (if custom fonts are used)

---

### Technical Details

**Package to install**: `react-helmet-async`

**Files created**:

- `src/components/seo/SEOHead.tsx`
- `src/components/seo/StructuredData.tsx`

**Files modified**:

- `src/main.tsx` -- wrap with `HelmetProvider`
- `index.html` -- update default OG tags, add font preload
- `public/sitemap.xml` -- add missing pages, add lastmod
- All ~15 public page components -- add `<SEOHead>` with unique metadata
- `public/robots.txt` -- minor improvements

**Estimated scope**: Medium -- mostly additive changes (new component + import in each page). No breaking changes.