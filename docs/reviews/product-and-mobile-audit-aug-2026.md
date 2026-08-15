# Product gaps, mobile readiness and patient UX — August 2026

Companion to `oc-lmc-review-aug-2026.md`. That one asked "does the hospital
feature match its spec"; this one asks "what is missing, and does it work on the
phone people actually use".

Everything below was checked against the code. Where a fix was small and
unambiguous it is already applied and marked **Fixed**; where it is a judgement
call it is a recommendation with the reasoning.

---

## 1. Mobile and tablet

### Fixed in this pass

| Issue | Evidence | Why it mattered |
| --- | --- | --- |
| The fixed tab bar covered the last element of every patient page | `MobileBottomNav` is `fixed bottom-0`; no page carried compensating padding, and none was applied globally | The final card or button on Dashboard, Medications, Vitals, Vault, Care Circle, Messages and Settings sat under the bar. Now reserved once at the shell, so a new page cannot forget it |
| `100vh` on iOS | 125 uses of `min-h-screen` / `h-screen`, zero uses of `dvh` | Safari counts the address bar, so full-height shells overflow the visible area and the page rocks as the bar hides. `.min-h-screen` / `.h-screen` now resolve to `dvh` where supported |
| Textareas zoomed the page on focus | `textarea.tsx` used `text-sm` (14px) while `input.tsx` correctly used `text-base md:text-sm` | iOS zooms any focused field under 16px. Affected every note, message and guidance composer |
| Nothing cleared the notch | `viewport-fit=cover` set in `index.html`; only `MobileBottomNav` used `env(safe-area-inset-*)` | The sticky header could sit under the status bar on notched devices. Added a `.safe-top` utility and applied it |
| The installed app was the wrong colour | `manifest.json` and the `theme-color` metas were `#3B82F6` / `#0F172A` | Pre-rebrand blue: the Android status bar and splash did not match the emerald/cream app |
| Native builds pointed at the preview | `capacitor.config.ts` set `server.url` to the lovableproject.com preview with `cleartext: true` | A store build would load the preview over the network instead of `dist` — breaking offline support and tying releases to a preview environment |

### Still to do

- **Run the sweep on real devices.** The roadmap's own mobile sweep never covered
  authenticated screens ("not reachable by the audit browser"). The fixes above
  are the structural ones findable by reading; tap-target sizes, keyboard
  overlap on the medication and vitals forms, and landscape on tablets need a
  device pass. iPhone SE (smallest), a notched iPhone, and an Android tablet in
  landscape are the three that would catch most of it.
- **Tables scroll the page sideways.** `ClinicianAudit`, `ClinicianPricing`,
  `DataProcessing` and `ClinicianWhyOneCare` render real `<table>`s. Each needs
  its own `overflow-x-auto` wrapper or a card layout below `sm`.
- **Orientation is locked to portrait** in the manifest. Reasonable for phones,
  wrong for a clinician on a tablet — consider `"any"` now that clinicians are a
  first-class audience.
- **Offline covers writes but not the whole journey.** `src/lib/offline` queues
  vitals, medications and schedule writes. A patient in a Nigerian hospital with
  poor signal will also try to *read* their medication list and message a
  clinician; reads are cached, messaging is not.

---

## 2. Patient experience

The four-pillar IA (Today · My Health · Care Team · Learn) is coherent, and the
empty states on Medications, Vitals, Vault and Care Circle are genuinely good —
they explain the next action rather than just saying "nothing here". These are
the things I would change, in order of who they affect.

### a. Simple Mode is a destination, not a mode

`/assist` is a sub-tab of the Learn pillar. The people who most need a simplified
surface — someone recently discharged, elderly, or managing a relative's care —
are the least likely to find it four taps in, and it does not persist.

**Recommendation:** make it a stored preference offered during onboarding ("Would
you like the simple version?"), which changes the default home and enlarges
type. This is a routing and preference change, not a redesign.

### b. Language

`src/lib/i18n.ts` is wired and initialised in `main.tsx`, but only English is
enabled; Spanish and French are stubs marked "coming soon". For the live market
that ordering is backwards. Nigerian Pidgin, Hausa, Yoruba and Igbo would widen
reach far more than Spanish, and the scaffolding already exists — this is
translation work, not engineering.

### c. Accessibility

47 `aria-label`s and 21 `alt` attributes across ~70 pages is thin, and the gold
accent (`#C9A84C`) on cream is below WCAG AA for body text at small sizes.

**Recommendation:** an explicit pass — labels on icon-only buttons, `alt` on
every informational image, a contrast check on gold-on-cream, and a test at 200%
system font size. Health apps are used disproportionately by people with low
vision; this is not a nice-to-have for this product.

### d. Onboarding asks for clinical detail before showing value

Onboarding collects date of birth, blood type, height and weight up front. A
first-time user has not yet seen anything worth the effort.

**Recommendation:** ask for the minimum needed to be useful, let them into the
app, and collect the rest contextually — height/weight when they first record a
vital that needs them.

---

## 3. Feature gaps

### Patient

| Gap | Note |
| --- | --- |
| Wearable/device import | Planned in `wearables-plan.md`. The provenance work (clinical vs consumer readings) should land before any integration |
| Refill reminders | Listed as "coming soon" on the pricing page — visible promise, unbuilt |
| Appointments | No scheduling of, or reminders for, hospital visits. A patient connected to a hospital would reasonably expect this next |
| Care-plan view | Guidance exists per item; there is no "what am I meant to be doing" summary |
| Data export | The consent model promises a full structured export on account closure; there is no self-serve export |

### Clinician

| Gap | Note |
| --- | --- |
| Problem list / ICD coding | Documented as deferred; the natural next step after the safety strip |
| Orders and results workflow | Deferred, and largely dependent on EHR integration |
| Caseload and coverage views | Roadmap "enterprise management depth". The new `practice_staff_overview()` gives the chief admin caseload counts; clinicians have no equivalent for themselves |
| Handover | Reassignment moves a patient, but there is no structured handover note. Given authorship is permanent, this is a natural fit |

### Enterprise / hospital

| Gap | Note |
| --- | --- |
| Enterprise SSO (SAML/OIDC) | Phase E, deferred. The first thing a hospital IT department will ask for after audit logs |
| Per-tenant persistent demo | Phase E. Needed for a multi-day enterprise evaluation |
| Revenue-share statements | The view estimates; statements and payouts are still manual |
| Server-side audit logging | Carried forward from the last review, and now the compensating control for leaving visibility broad |
| Department-scoped clinical access | The switch is prepared on the assignment-first branch; ships once sub-admins are trained |

### EHR preparedness

Planned in `ehr-integration-plan.md`. The three things that block it at hospital
scale, in order:

1. **Connections belong to a clinician, not a tenant.** `ehr_connections.clinician_user_id`
   means a departing doctor takes the hospital's integration with them. This is
   the one to fix first, and it is small.
2. **Identity matching is a free-text column.** `patient_id_mapping` does the
   riskiest job in the integration. It needs to become a reviewed link table
   reusing `patient-dedup.ts`, and must never auto-link on name alone.
3. **No conflict rules for write-back.** `ehr_export_queue` exists as a skeleton
   with nothing deciding what happens when both systems change the same fact.

Nothing here blocks the current deployment — OC-LMC works without an EHR
connection — but all three should be settled before the first integration, not
during it.

---

## 4. If I had to pick five

1. Device pass on real hardware, then the table-overflow fixes.
2. Simple Mode as a preference, offered at onboarding.
3. Accessibility pass, contrast included.
4. Local languages, starting with Pidgin.
5. `ehr_connections` moved to the tenant, before anyone builds against it.
