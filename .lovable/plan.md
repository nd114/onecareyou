## Goal

Get OneCare beta-ready in one focused milestone. Everything else (WhatsApp transport, hardware/RPM, virtual Rx, native store build, blog engine) is deferred to post-beta and tracked in `docs/launch-plan.md`.

## Scope — what ships in this batch

### 1. Beta blockers (B1–B6)

- **B1 — Family-member switcher everywhere.** Mount `HeaderFamilySwitcher` (already exists) into the patient `Header` so it filters Vitals, Schedule, Medications, Adherence, Vault, Dashboard. Confirm every list/query reads `activeMemberId` from `FamilyContext`. Audit each page and add the filter where missing.
- **B2 — Cookie banner re-appears after Accept.** Bug in `CookieConsentBanner`: `useEffect` reads `localStorage` once, but `acceptAll` / `acceptNecessary` set `showBanner=false` without persisting to the same key check order. Reproduce, fix the persistence/read path, add a Vitest case.
- **B3 — Onboarding skip/resume.** Add a "Skip for now" link on each onboarding step and persist `last_completed_step` on the profile so returning users resume where they left off.
- **B4 — Mobile pass + PWA** (see section 2).
- **B5 — Demo account daily reset.** New scheduled edge function `reset-demo-accounts` (cron daily 03:00 UTC) that re-seeds demo patient + clinician via existing `seed-demo-data` function. Demo data will also need to be updated so it is recent for the tester (mot having the most recent details logged to have been 3 months ago, for example - should be recent).
- **B6 — Beta pack placeholders.** Fill `[INSERT DATES]` and `[INSERT GOOGLE FORM LINK]` in `docs/beta-tester-pack.md`.

### 2. Mobile-first pass + installable PWA

- **Mobile audit** of patient routes only (Dashboard, Vitals, Medications, Schedule, HealthVault, CareCircle, Settings, Messages). Fix tap targets <44px, horizontal scrolls, table-to-card conversions, modal heights on 360px viewports.
- **Manifest-only PWA** (no aggressive service-worker caching — follows Lovable's PWA guidance):
  - Add `public/manifest.json` with `display: "standalone"`, OneCare icons (192/512), theme color, `start_url: "/"`.
  - Link manifest + apple-touch-icon + theme-color in `index.html`.
  - Replace existing `public/sw.js` (legacy push-notification SW) with a **kill-switch SW** that unregisters itself, then remove it next release. Reason: the current SW caches under name `meditracker-v1` and will conflict with offline-queue logic.
  - Build a dedicated `/install` page with platform-detected instructions (iOS Share→Add to Home Screen, Android browser-menu install).
- **Capacitor**: leave config as-is. No store build in this batch — flagged for post-beta milestone.

### 3. Offline mode (write queue + cached reads)

- Add `idb` (lightweight IndexedDB wrapper) dependency.
- New module `src/lib/offline/`:
  - `db.ts` — IndexedDB schema: `pending_writes` (id, table, op, payload, created_at, retries) and `cached_reads` (key, payload, fetched_at).
  - `queue.ts` — `enqueue(write)`, `flush()` on `online` event + on app focus. Exponential backoff, max 5 retries.
  - `cache.ts` — `cacheRead(key, payload)` and `getCachedRead(key)`.
- Wire write paths: vitals create, medication taken/missed log, schedule check-off, symptom note. These call queue if `!navigator.onLine`, otherwise call Supabase directly + also cache for offline read.
- Wire cached reads: dashboard summary, last 90d vitals, active medications, today's schedule. On page mount, render cached data with a "Last synced X ago" banner if offline, then refresh when online.
- **Out of scope**: AI chat, file uploads, messaging — show offline banner.
- New `OfflineBanner` component shown in patient header when `!navigator.onLine`.

### 4. Unified `/pricing` + public `/for-clinicians`

- **Unified `/pricing**`: rewrite `src/pages/Pricing.tsx` with a top-of-page `Tabs` toggle (Patients / Clinicians). Both tier sets render on the same canonical URL. `src/pages/ClinicianPricing.tsx` becomes a 301 redirect → `/pricing?audience=clinicians`. Update `pricing-constants.ts` consumers accordingly. Update sitemap + footer links.
- **New `/for-clinicians` public route**: clinician-oriented hero, value props (triage inbox, shared patient pools, EHR sync, BAA, audit log), social proof slots, pricing CTA → `/pricing?audience=clinicians`, sign-up CTA → `/clinician/signup`. Pulls copy from existing `src/pages/ClinicianWhyOneCare.tsx`. Add to sitemap, header public nav, SEO indexed.

### 5. WhatsApp provider-agnostic scaffold (no transport yet)

- New module `src/lib/whatsapp/`:
  - `provider.ts` — interface `WhatsAppProvider` with `sendTemplate`, `sendMessage`, `handleInboundWebhook`.
  - `noop-provider.ts` — default implementation that logs + no-ops in dev.
  - `index.ts` — exports `getProvider()`; reads `WHATSAPP_PROVIDER` env to pick implementation later.
- New edge function stub `whatsapp-webhook` (returns 200, logs payload). No real transport, no Meta verification yet.
- New DB columns on `messages`: `transport` (`'in-app' | 'whatsapp'`, default `'in-app'`), `external_message_id` (nullable). No behavior change today; lets us slot in Twilio or 360dialog later without migration.
- New `docs/whatsapp-integration-plan.md` capturing the Twilio vs 360dialog tradeoff for the post-beta decision.

### 6. Memory + docs

- Update `mem://index.md` Core with: "Patient app is mobile-first + installable PWA. Offline queue for vitals/meds writes via IndexedDB; cached reads for dashboard/vitals/meds. No SW caching of HTML."
- New memory files:
  - `mem://technical/architecture/offline-strategy` — write queue + cached reads design.
  - `mem://features/marketing/unified-pricing-and-clinician-landing` — IA decision.
  - `mem://features/messaging/whatsapp-scaffold` — provider-agnostic interface + post-beta decision pending.
- Update `docs/launch-plan.md` with deferred items and target sequencing.
- Add changelog entry `0.9.7`.

## Out of scope (post-beta, tracked separately)

- Hardware/RPM integration (Apple Health, Health Connect, BLE BP/glucose, Dexcom).
- WhatsApp actual transport (Twilio or 360dialog) + Meta Business verification flow.
- Virtual prescription framework.
- Capacitor native store builds (TestFlight, Play Console).
- Blog/content engine.
- Paystack + NGN regional pricing.

## Technical details

- **IndexedDB lib**: `idb` (~1KB gzipped, promise-based, well-maintained). Not Dexie — simpler API matches our scoped use.
- **Online detection**: `navigator.onLine` + `online`/`offline` events + a 5s ping to `${SUPABASE_URL}/auth/v1/health` to detect captive-portal/Wi-Fi-but-no-internet cases.
- **Queue flush**: on `online` event, on `visibilitychange` to visible, and on app mount. Idempotency key per write to avoid double-insert when network blips mid-flush.
- **PWA caching**: explicitly NO Workbox runtime cache for HTML. Kill-switch SW for the existing `meditracker-v1` SW must ship one release before fully removing `/sw.js`, otherwise devices with the old SW keep serving stale shells (per Lovable PWA guidance).
- **Pricing redirect**: handle in React Router via a `Navigate` element so the canonical URL is `/pricing?audience=clinicians`. Add `<link rel="canonical">` accordingly.
- **DB migration** (small): add `transport` + `external_message_id` columns to `messages` with safe defaults + index on `external_message_id`. RLS unchanged.

## Files affected (rough)

New:

- `public/manifest.json`, updated `public/sw.js` (kill-switch), `src/pages/Install.tsx`, `src/pages/ForClinicians.tsx`
- `src/lib/offline/{db,queue,cache,index}.ts`, `src/components/layout/OfflineBanner.tsx`
- `src/lib/whatsapp/{provider,noop-provider,index}.ts`, `supabase/functions/whatsapp-webhook/index.ts`, `supabase/functions/reset-demo-accounts/index.ts`
- 3 memory files, `docs/whatsapp-integration-plan.md`

Edited:

- `index.html`, `src/components/layout/Header.tsx`, `src/components/consent/CookieConsentBanner.tsx`, `src/pages/Onboarding.tsx`, `src/pages/Pricing.tsx`, `src/pages/ClinicianPricing.tsx`, `src/App.tsx` (routes), `src/hooks/useVitals.ts`, `src/hooks/useMedications.ts`, `src/hooks/useScheduleEntries.ts`, `src/hooks/useDashboardStats.ts`, `src/lib/changelog-data.ts`, `docs/beta-tester-pack.md`, `docs/launch-plan.md`, `mem://index.md`, `package.json` (add `idb`), `public/sitemap.xml`

## Validation

- Vitest: cookie-banner persistence, offline queue enqueue/flush, family-context filtering.
- Manual: mobile 360×800 walkthrough of each patient route; toggle airplane mode → enter vital → re-connect → confirm sync; install PWA on Android Chrome and iOS Safari; visit `/pricing` and toggle audience; visit `/for-clinicians`.
- Build check (automatic).

## Estimated effort

~5–6 working days end-to-end. Beta pack can go out the day after this lands.

&nbsp;

Lastly I hope for our mobile app approach that we really wouldn't need to build from scratch for it to have a native feel. Will capacitor be okay, or is there an alternative that will let us port the code and the AI can help with understanding and reconfiguring perhaps?