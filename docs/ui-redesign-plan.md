# OneCare UI/UX Redesign Plan

**Status:** IA reshuffle delivered May 2026. Visual redesign still deferred.
**Last updated:** May 2026

---

## What's delivered (May 2026 — Nav IA v2)

The information architecture pieces of the old Phase B + Phase C have shipped
ahead of the visual redesign. Concretely:

- **Patient app**: 4 pillars (Today · My Health · Care Team · Learn) replace the
  old 7-tab top nav + 5-item avatar menu. Each pillar has a sub-tab bar so
  sibling pages are one click apart. Avatar menu is now account-only.
- **Clinician app**: 4 pillars (Today · Patients · Communicate · Practice)
  replace the old 6 tabs + More dropdown. Alerts fold into Today; Guidance +
  Dictations live under Communicate.
- **Mobile menu**: grouped by pillar with sub-tabs visible. Hamburger retained
  (no bottom tab bar yet — see Deferred below).
- **Source of truth**: `src/lib/nav-ia.ts` defines all pillars and tabs. Active-
  pillar detection in `getPatientPillarForRoute` / `getClinicianPillarForRoute`.
  Sub-tab bar component: `src/components/layout/SectionTabs.tsx`.

All old URLs preserved — no migration needed for bookmarks or clinician →
patient deep links.

---

## Deferred — Visual redesign (Phase A) + still-pending IA pieces

### Phase A — Design system reset (1 sprint)

1. Define new tokens in `src/index.css` + `tailwind.config.ts` — color, type
   scale, radius, spacing rhythm, motion durations.
2. Apply to shadcn primitives (Button, Card, Input, Tabs, Dialog) once —
   propagates everywhere via existing semantic tokens.
3. Refresh logo treatment + hero illustration system. Replace hardcoded mock
   dashboard numbers on landing with real product screenshots once out of beta.

### Patient Workspace tab cluster (clinician side)

Replace today's Patient Detail page with a tabbed Patient Workspace:
**Overview · Vitals · Medications · Vault · Guidance · Dictations · Notes ·
Sharing**. Respects granted permissions. Not yet implemented.

### Care Mode pill (deferred per user direction)

A header pill switching between Standard / Trial / Recovery contexts. Decision:
trial/study flagging will be **clinician-driven**, not a patient-side toggle,
when shipped. Documented in `.lovable/plan.md` §3.

### Mobile bottom tab bar (deferred per user direction)

A 5-tab bottom bar for the patient app (Today · Health · + AI · Team · Learn)
would replace the hamburger on mobile and align with Capacitor app-store builds.
Hamburger stays for now.

### Triage Inbox + Templates (clinician)

Single triage queue mixing unread messages, vital alerts, missed adherence,
pending invitations, pending BAA actions. Filter chips by type. Replaces the
current split between Dashboard, Alerts, and Messages reads. Not yet
implemented — current Today pillar still lists Overview + Alerts as two
sub-tabs.

### Phase D — Marketing site

1. Real testimonials replacing placeholders.
2. `/blog` for SEO content (zero organic traffic confirmed in May 2026
   analytics review).
3. Trust + security page expansion.

---

## Cross-cutting items still folded into the future redesign

- Mobile audit for clinician dashboard, patient detail, and settings
  (currently desktop-first; large LOC pages).
- Loading-state standardization (skeleton system).
- Error-state standardization (retry CTAs).
- i18n infrastructure — currently English-only, language toggles non-functional.
  Wire `react-i18next` during Phase A, ship Spanish + French during Phase D.

---

## When to start Phase A

Trigger conditions:

- [x] Family member context-switching landed on patient app
- [x] In-app secure messaging shipped
- [x] Navigation IA reshuffle landed (May 2026)
- [ ] Clinician Patient Workspace + Triage Inbox shipped
- [ ] Out of public beta (or close to)

Once those are true, generate 3 design directions per shell (clinician,
patient, marketing) via the design-directions skill; user picks one per
shell; we implement.
