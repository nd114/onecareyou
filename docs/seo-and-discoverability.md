# SEO and discoverability

Status as of October 2026. Domain: `https://onecare.you`. Branch `wt/seo`.

## Findings (before)

- Pages already set their own title/description via `SEOHead` (react-helmet-async), several with JSON-LD (Organization, WebApplication, BreadcrumbList, FAQ helpers exist in `src/components/seo/structuredData.ts`). Good base.
- The app is a pure client-rendered SPA with no prerender. Googlebot renders JS; most AI crawlers (GPTBot, ClaudeBot, PerplexityBot) do not, so they saw only the generic `index.html` title for every URL.
- `sitemap.xml` was hand-written and wrong: it had a broken `<url>` fragment, listed `/knowledge` (no such route, a soft 404), sign-in/sign-up, and stale `lastmod` dates.
- `robots.txt` disallowed some app routes but missed many (`/billing`, `/ai`, `/messages`, `/admin`, `/beta`, `/clinician/*` screens) and said nothing about AI crawlers.
- No 404 signal: the catch-all `NotFound` returned HTTP 200 with no `noindex` (soft 404).
- Only some pages declared a canonical; none by default.
- `llms.txt` linked a non-existent `/knowledge`, claimed "HIPAA-aligned", and lacked "what OneCare is not".
- Share links (`/s#token`) already carry `noindex,nofollow,noarchive`, and the token is in the URL fragment (never sent to crawlers). Kept as is.
- Multi-locale: `docs/language-and-locale.md` says translation is plan only, so no hreflang was added (adding it now would be wrong).
- Bundle: `App.tsx` imports every route eagerly (no `React.lazy`), so the marketing landing downloads the app, clinician and admin code. Largest CWV risk. Not changed here (touches the whole router; needs its own PR and test pass).

## What changed

- `scripts/seo/public-routes.mjs`: one list of public indexable routes (plus docs slugs and job ids parsed from source, `lastmod` from git history) and `PRIVATE_PREFIXES`.
- `scripts/seo/generate-sitemap.mjs`: generates `public/sitemap.xml` and `public/robots.txt` from that list. Runs at the start of `npm run build` (and `npm run seo:sitemap`). robots now explicitly allows GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended, Applebot-Extended, Bingbot, Googlebot, DuckDuckBot for public pages and disallows every app/auth/share/token route (`/s$`, `/i/`, `/clinician/patient/` etc.).
- `scripts/seo/prerender.mjs`: post-build step with no new dependency. For each public route it writes `dist/<route>/index.html` with that route's own title, description, canonical, og/twitter tags and a `<noscript>` summary with internal links. The SPA still boots and replaces `#root`, so behaviour is unchanged. Requires the host to serve `dist/<route>/index.html` for `/route` (most static hosts do, with the SPA fallback for everything else).
- `SEOHead`: canonical now defaults to the current path (no query/hash) for every indexable page; `noIndex` pages emit none.
- `NotFound`: now `noindex` (soft-404 mitigation; see remaining work for real 404 status).
- `public/llms.txt`: accurate summary, an explicit "what OneCare is NOT" section (not medical advice, no clinician verification, no live FHIR, not "certified"), key URLs, notes for agents.
- `src/test/seo.test.ts`: fails if the sitemap/route list contains an app/auth/share route, if sitemap or robots drift from the generator, if a public page lacks a title/description or head component, or if snapshot/404 lose noindex.

## Remaining (needs a decision or a bigger change)

1. HTTP-level controls: `X-Robots-Tag: noindex` for `/s`, and real 404 status for unknown paths, need host config (headers/rewrites). Host is not in the repo; add whichever file the host reads.
2. Route-level code splitting (`React.lazy`) for app, clinician and admin routes; self-host fonts with `font-display: swap` and `preload`; ship a 1200x630 OG image (verify `public/og-image.png` dimensions and weight).
3. Per-page JSON-LD gaps: add FAQPage where a page has real FAQs (Pricing, ForClinicians), BreadcrumbList to docs pages, `MedicalWebPage` only on pages with clinician-reviewed content. Never add ratings, reviews or medical efficacy claims.
4. True prerender of body copy (not just head) via a headless-browser pass or SSG if AI-crawler visibility of body text matters; weigh against a new dependency.
5. Public `sign-in`/`sign-up` are crawlable but not in the sitemap, intentionally.

## Plan to reach thousands of organic visits

Reality check: this site has little public content today (about 28 URLs, mostly product and legal). Thousands of visits come from content, not tags. Prioritised:

1. **Foundation (this PR, then Search Console).** Done above; submit sitemap.
2. **Guides cluster, patient-held records (highest intent).** "How to get a copy of your medical records" (country-specific: UK SAR, US HIPAA right of access, Nigeria), "What is a patient-held health record", "How to keep a medication list", "How to track blood pressure at home". Each 800-1500 words, reviewed by a clinical advisor, with a clear not-medical-advice line.
3. **Sharing records with a new GP / specialist.** "Moving GP: what to bring", "How to share your health records with a new doctor safely", "Checklist for a hospital discharge".
4. **Medication tracking.** Honest programmatic pages from public drug-label sources (for example "Missed a dose of X: what the label says") only with cited sources and a clinician review step; thin auto-generated pages will be penalised.
5. **Clinician cluster.** "Ambient scribe: what to check before using one", "Patient-reported readings between visits", clinician-approval workflows, audit-log explainer.
6. **Trust pages.** Plain-language security, consent model, data-processing, subprocessors, "who can see my data". These also serve AI answer engines. Say only what is true; avoid "HIPAA certified".
7. **Comparison pages.** "OneCare vs paper folder / notes app / patient portals", factual and fair. Do not name competitors with unverifiable claims.
8. **Changelog/public roadmap page** with dated entries (fresh, linkable).
9. Internal linking: every guide links to Features, the relevant doc and a CTA; footer links to the guides hub.

## Founder checklist

1. Google Search Console: add the domain property (DNS TXT), submit `https://onecare.you/sitemap.xml`, use URL Inspection on `/`, `/features`, `/docs`.
2. Bing Webmaster Tools: import from Search Console; submit sitemap; enable IndexNow if the host supports it.
3. Check "Pages" report weekly for "Crawled - not indexed" and soft 404s.
4. Add Google Business/Organization profile details consistent with the JSON-LD (name, logo, contact email).
5. Verify `og-image.png` renders in the LinkedIn, Slack and X debuggers.
6. Backlinks and directories: Product Hunt, AlternativeTo, Crunchbase, G2/Capterra (only once real reviews exist, never fabricate), health-tech and digital-health directories, NHS/NHSX-adjacent and Nigerian health-tech communities, university and clinician newsletters, podcasts and guest posts by the clinical advisors, GitHub awesome-lists for health apps.
7. Share each guide with the clinical advisory board and their professional networks; one good citation beats many directory links.
