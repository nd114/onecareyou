# OneCare UI/UX Redesign Plan (Deferred — Post-Functionality)

**Status:** Approved direction, **deferred** until functional gaps are closed.
**Decision date:** May 2026
**Scope:** Full redesign of patient app, clinician app, and marketing site.

---

## Why deferred

Audit (May 2026) showed multiple functional gaps that must be closed before redesign
work begins, otherwise we'd be polishing broken flows. Functionality first, design
second. See `docs/comprehensive-platform-review.md` for the full audit and quick-fix
log.

---

## Phase A — Design system reset (1 sprint, foundational)

1. Define new tokens in `src/index.css` + `tailwind.config.ts` — color, type scale,
   radius, spacing rhythm, motion durations.
2. Apply to shadcn primitives (Button, Card, Input, Tabs, Dialog) once —
   propagates everywhere via existing semantic tokens.
3. Refresh logo treatment + hero illustration system. Replace hardcoded mock
   dashboard numbers on landing with real product screenshots once we're out of beta.

**Deliverable:** Updated `index.css`, `tailwind.config.ts`, primitive variant
sweep, and a `/style-guide` internal page rendering every token + primitive.

---

## Phase B — Clinician shell rebuild (1 sprint, biggest UX win)

1. **Left-nav layout** replacing the cramped 4-tab top nav. Items:
   Dashboard, Patients, Inbox (Alerts), Schedule, Templates, Practice, Settings.
   This exposes Practice/Team, Templates, EHR, Analytics, BAA — all currently
   buried inside Settings.
2. **Patient Workspace page** combining Detail + Adherence + Documents + Notes
   in one focused view with tabs that respect granted permissions.
3. **Triage Inbox** replacing today's Alerts page (unread → action → done flow,
   with assignment to team member when on Pro/Enterprise).

---

## Phase C — Patient shell rebuild (1 sprint)

1. **Member switcher in header** — applies family context globally to
   Vitals/Meds/Schedule/Vault. (Functional gap; tracked in P3 as priority 1.)
2. **New Dashboard:** today's actions on top, trends below, AI chat persistent
   across all pages (not just dashboard).
3. **Mobile-first pass** with bottom nav (Capacitor app-store ready).

---

## Phase D — Marketing site (parallel, 1 sprint)

1. **Split landing:** `/` for patients, `/for-clinicians` for clinicians
   (`/clinician/why-onecare` is buried today).
2. **Unified `/pricing`** with patient + clinician tabs.
3. **Trust strip** (already added to Footer in housekeeping pass), security
   page, real testimonials.
4. **`/blog`** for SEO content (zero organic traffic confirmed in May 2026
   analytics review).

---

## When to start

Trigger conditions (all must be true):

- [ ] Family member context-switching landed on patient app
- [ ] In-app secure messaging shipped
- [ ] Clinician Triage Inbox + Templates library shipped
- [ ] Out of public beta (or close to)

Once those are true, generate 3 design directions per shell (clinician,
patient, marketing) via the design-directions skill; user picks one per
shell; we implement.

---

## Cross-cutting items folded into the redesign

- Mobile audit for clinician dashboard, patient detail, and settings (currently
  desktop-first; 683 / 668 / 934 LOC).
- Loading-state standardization (skeleton system).
- Error-state standardization (retry CTAs).
- i18n infrastructure — currently English-only, language toggles non-functional.
  Wire `react-i18next` during Phase A, ship Spanish + French during Phase D.
