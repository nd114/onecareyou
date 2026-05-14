## OneCare Site Review — May 14, 2026

### A. Analytics (last 30 days)


| Metric      | Value                                              | Read                                            |
| ----------- | -------------------------------------------------- | ----------------------------------------------- |
| Visitors    | 35                                                 | Very low — pre-launch traffic                   |
| Pageviews   | 42                                                 | 1.2 pages/visit                                 |
| Bounce rate | ~93% (most days 100%)                              | Visitors land and leave                         |
| Top pages   | `/` (13), `/careers/*` (16 combined), `/about` (1) | Careers driving as much traffic as the homepage |
| Sources     | Direct 30, google.com 3                            | Almost no organic search                        |
| Devices     | Desktop 32, mobile 1                               | Mobile invisible despite Africa-first plan      |
| Countries   | US 22, Unknown 9, UA 1, RW 1                       | No Nigerian traffic yet                         |


**Read:** site is technically live but un-marketed. The product is ahead of the go-to-market.

### B. Patient app (signed in as demo-patient-1)

Working: Dashboard, Vitals (overview/analytics/history with normal-range badges), Medications listing, Care Circle (4 active providers, Copy Link + WhatsApp share present), Health Vault, AI chat FAB, beta bug report FAB, cookie consent.

Issues found:

1. **Medications page shows duplicate cards** — Vitamin D, Lisinopril, Metformin each appear twice with identical content. Likely demo-seed inserted twice; verify whether the upsert in `seed-demo-data` dedupes by name/strength.
2. **Adherence Rate shows 0%** while Daily Doses = 8 and Today's Regimen = 0/8. Either logs aren't being written for the demo account or the calculation excludes today's incomplete schedule. Visually confusing on the hero card.
3. **Active Providers stat = 0** on Dashboard, but Care Circle clearly shows 4 active providers. Stat query mismatch.
4. **Health Vault is empty** for the demo patient — beta testers per `beta-tester-pack.md` are told to expect pre-seeded labs.
5. **Cookie consent banner** overlaps the bottom row of every page and never collapses after navigation.

### C. Clinician app (signed in as demo-clinician-1, Dr. Sarah Mitchell)

Working: Dashboard with patient-limit banner, Patients list (Connected 4 / Managed 0), patient row actions (Send Guidance, Set Alert, View Details), Settings → Professional Profile with avatar upload, Bulk import, Guidance, Alerts nav.

Issues found:

1. **Demo clinician is on Solo (4/5)** — banner says "Approaching Patient Limit." Per the test-clinician memory, this account was supposed to be Enterprise (1000-patient limit). Tier provisioning for demo accounts has drifted.
2. Practice Branding, Patient Engagement Analytics, Practice Team Management — all gated behind Enterprise; cannot be exercised by reviewers on the demo Solo account.
3. No critical console errors; only React Router v7 future-flag deprecation warnings (low priority cleanup).

### D. Security posture

Recent scan: 5 of 6 findings fixed in last session. Remaining: **Leaked Password Protection** must be enabled manually in Cloud → Auth settings. `ADMIN_EMAIL_ALLOWLIST` secret needs to be set for `import-idd-data` to function for admins.

### E. Documentation drift

`docs/future-roadmap.md` still lists Phase 3 (Alert Rules), Phase 4 (EHR), Phase 5 (Family Members), Phase 6 (Inbound Email), Phase 7 (Subscriptions) as PLANNED — all are at least partially shipped. `docs/comprehensive-platform-review.md` is dated Jan 2026 and predates the security and gating work done since.

---

### Recommended Next Steps (prioritized)

**P0 — Fix before any marketing push (this sprint)**

1. Fix duplicate medications in `seed-demo-data` and re-seed demo accounts (also restore Health Vault docs).
2. Fix Dashboard "Active Providers" stat to use the same source as Care Circle.
3. Investigate Adherence 0% with 8 daily doses — confirm whether it should be "—" until first log of the day, or compute on a 7-day rolling window.
4. Re-provision `demo-clinician-1` to Enterprise (1000 patients) so reviewers can see the full tier.
5. Enable Leaked Password Protection (manual) and set `ADMIN_EMAIL_ALLOWLIST` (one-time secret).
6. Auto-dismiss/persist the cookie consent so it doesn't cover footer content after a choice.

**P1 — Beta-readiness polish (next sprint)**
7. Mobile audit: test all patient pages at 375×812; analytics show 1 mobile visit ever — yet Africa-first plan assumes mobile-majority.
8. Refresh `docs/future-roadmap.md` and `docs/comprehensive-platform-review.md` to mark shipped phases done; archive the rest into `docs/launch-plan.md`.
9. Add basic SEO+social meta to top pages so direct/google traffic stops bouncing at 100%.
10. Drop the React Router v7 future-flag warnings (one-line config) to clean the console.

**P2 — Growth & traction (parallel, non-engineering)**
11. Execute Week 1–2 of `docs/launch-plan.md`: post Community Growth Lead listing, set up WhatsApp Business, line up first 3 clinician pilots in Lagos/Abuja network.
12. Add `/blog` or `/knowledge-base` SEO content targeting Nigerian chronic-disease queries — this is the cheapest way to convert google.com 3 → google.com 300.
13. Hook up an analytics dashboard inside the clinician portal (Patient Engagement Widgets already exists for Pro+) and a public "stats" badge to counter low traffic perception.

**P3 — Feature gaps queued from prior plan**
14. Family Member context-switching in Vitals/Medications/Schedule pages.
15. Patient subscription/payment flow (Stripe checkout exists; UI surfacing inconsistent).
16. EHR integration (Phase 4 — explicitly deferred earlier).

I will not start coding any of this yet — confirm which P0/P1 items to tackle first and I will queue them up.  
  
Start with sorting out the P0 and P1 items and fix them up. 