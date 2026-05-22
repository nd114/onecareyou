# Navigation re-architecture — patient + clinician

## 1. Why the current IA is wrong

Today the header treats every feature as a peer. That made sense when OneCare was a medication tracker. It does not match what the platform actually does now:

- **Patient mission:** close the post-discharge information gap and give patients control of their longitudinal record.
- **Clinician mission:** see the freshest possible signal on each patient, catch deterioration early, lower mortality, and support structured cohort/trial follow-up.

When you grade today's 7 patient tabs + 5 dropdown items against those missions, three problems pop out:

1. **Duplicate / overlapping destinations.** Medications vs. Schedule (the schedule is mostly med doses + vitals due). Care Circle vs. Family Dashboard (both manage "other people in my health life"). Health Vault vs. Vitals (labs land in both). Guidance vs. Messages (clinician → patient comms split across two inboxes). Medication Info (knowledge) is buried under the avatar even though it's a primary patient task.
2. **Mission-critical surfaces are hidden.** Simple Mode, Adherence Report, Health Profile, AI assistant — all behind the avatar dropdown. New users never find them.
3. **No surface for "I'm on a trial / off-label regimen / self-experiment."** This is now an explicit user segment and has nowhere to live.

The clinician header has the inverse problem: only 6 tabs, but Dictations and Guidance are *patient-context actions*, not destinations — they should live inside a patient workspace, not the top bar.

## 2. New mental model — four pillars per role

### Patient — four pillars, in priority order


| Pillar        | What it answers                      | Absorbs today's…                                                                          |
| ------------- | ------------------------------------ | ----------------------------------------------------------------------------------------- |
| **Today**     | "What do I need to do right now?"    | Dashboard + Schedule + Guidance inbox + Adherence nudges                                  |
| **My Health** | "What's my full picture and trend?"  | Vitals + Health Vault + Medications + Health Profile + Adherence Report                   |
| **Care Team** | "Who's involved and how do we talk?" | Messages + Care Circle + Family + Provider sharing                                        |
| **Learn**     | "Help me understand this."           | Knowledge Base + Medication Info + AI Assistant (Simple Mode is the entry, not a sibling) |


Member switcher, notification bell, and the AI FAB stay global (header-right + floating). Settings + sign-out stay in the avatar menu — those are account-level, not product pillars.

### Clinician — four pillars


| Pillar            | What it answers                      | Absorbs today's…                                                                                                                       |
| ----------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Today / Inbox** | "What needs me in the next hour?"    | Dashboard + Alerts + unread Messages (one triage queue)                                                                                |
| **Patients**      | "Show me a specific person, deeply." | Patients list → Patient Workspace (Detail + Guidance + Dictations + Notes + Shared Docs as **tabs inside the patient**, not top-level) |
| **Communicate**   | "Reach a patient or a cohort."       | Messages + Guidance composer (broadcast) + Bulk actions                                                                                |
| **Practice**      | "Run my org."                        | Practice & Team + EHR + BAA + Settings + Subscription                                                                                  |


This collapses 6 top-level tabs + a "More" dropdown into **4 tabs**, and *removes* Guidance/Dictations/Alerts as separate destinations — they become surfaces inside Today (queue) or the patient workspace (composer).

## 3. New surface: Care Mode / Study context

A small but explicit lever — a **"Care Mode" pill** in the patient header next to the member switcher with three values:

- **Standard care** (default)
- **Trial / study** — tags new meds/vitals with protocol metadata, exposes a structured "side-effect & dose-deviation log" tab inside My Health, and lets the patient export a clean dataset for the trial coordinator.
- **Recovery / post-procedure** — surfaces a time-boxed checklist driven by clinician guidance, auto-expires.

This is one mode switch, not a new top-level tab — it modulates what *Today* and *My Health* emphasize. On the clinician side the same patient surfaces a "Study" badge and the dose-deviation log inside their workspace.

**NB: For this present section - 3, let's leave it as something to be considered later. In such cases where it is a study, we can have the clinician side be the one to determine that. Let's not make things more complicated when not necessary.** 

## 4. Concrete patient layout

### Desktop header (single row, page-centered)

```text
[Logo]   Today   My Health   Care Team   Learn        [Mode▾] [Member▾] [🔔] [Avatar▾]
```

### Mobile (bottom tab bar, Capacitor-ready)

```text
[Today]  [Health]  [+ AI ]  [Team]  [Learn]
```

The center `+ AI` button opens the assistant (replaces today's floating FAB on mobile, keeps it on desktop). Hamburger is **deleted** on mobile — every destination is reachable via the 4 tabs or "More" inside a tab.

**NB: Do not implement this yet for mobile. Document the proposition so it is considered later on.**

### What each pillar contains

- **Today** = current Dashboard (next doses, vitals due, unread guidance, alerts) + a "Catch-up" panel for missed items. Schedule view is a tab here (`Today / Upcoming / History`).
- **My Health** = sub-nav for **Vitals · Medications · Vault · Profile · Adherence**. One page, internal tabs; this is where Medications + Schedule + Vitals + Health Vault + Adherence Report all collapse.
- **Care Team** = sub-nav for **Messages · Care Circle · Family · Sharing**. Family Dashboard becomes "Family" tab here (gated by plan). Provider sharing controls move here from Settings.
- **Learn** = sub-nav for **Ask AI (Simple Mode) · My Meds Explained · Knowledge Base**. Simple Mode is the default landing — that's the "new user" front door.

## 5. Concrete clinician layout

### Desktop header

```text
[Logo OneCare for Clinicians]   Today   Patients   Communicate   Practice    [🔔] [Avatar▾]
```

### Patient Workspace (replaces today's Patient Detail page)

Internal tabs: **Overview · Vitals · Medications · Vault · Guidance · Dictations · Notes · Sharing**. This is what the deferred redesign already calls "Patient Workspace" — we ship the IA now even before the visual redesign.

### Today / Inbox

Single triage queue mixing: unread patient messages, vital alerts, missed adherence, pending invitations, pending BAA actions. One list, filter chips by type. Replaces three pages.

## 6. What gets removed / merged / renamed


| Today                                                                                    | Tomorrow                                               |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `/dashboard`                                                                             | `/today` (kept as alias)                               |
| `/schedule`                                                                              | tab inside `/today`                                    |
| `/medications`, `/vitals`, `/health-vault`, `/adherence-report`, `/onboarding` (profile) | sub-tabs of `/health`                                  |
| `/care-circle`, `/family`, `/messages`                                                   | sub-tabs of `/team`                                    |
| `/knowledge-base`, `/medication-info`, `/assist`                                         | sub-tabs of `/learn` (Simple Mode is the landing)      |
| `/guidance` (patient inbox)                                                              | merged into Today's catch-up panel + notification bell |
| Clinician `/clinician/alerts`, `/clinician/guidance`, `/clinician/dictations`            | folded into Today (queue) and Patient Workspace tabs   |
| Avatar dropdown: 7 items                                                                 | 3 items (Profile · Settings · Sign out)                |


All old URLs **301 → new home** so bookmarks and emails don't break.

## 7. New-user experience

First sign-in lands on **Today** with an empty-state that points to three actions: *Add your first medication · Connect a vital · Invite your care team*. Each is a one-click route into the correct sub-tab of My Health or Care Team — they discover the IA by using it, not by reading a menu.

## 8. Rollout — 3 small PRs, not one big bang

1. **PR-1: Header + routing only.** Add the 4-pillar headers (patient + clinician), keep every existing page mounted at its old URL, add redirects from old → new shell routes. No page-level changes. Ship behind no flag — purely structural. Verifies the menu collapse without touching feature code.
2. **PR-2: Sub-tab shells.** Wrap Medications/Vitals/Vault/Adherence/Profile in a `/health` shell with an internal tab nav; same for `/team` and `/learn`. Old pages stay; we just nest them. Mobile bottom tab bar lands here.
3. **PR-3: Care Mode + Today queue.** Add the Mode switcher, the study log tab, the clinician unified Inbox, and the Patient Workspace tab cluster. This is the only PR that touches data — adds a `care_mode` enum on `profiles` and a `protocol_log` table.

After PR-1 the user can already see and judge the new top-level shape. PR-2 and PR-3 only land if the shape feels right.

## 9. Memory + docs to update after approval

- `mem://index.md` Core — replace the navigation line with the 4-pillar model.
- New memory `mem://design/navigation-ia-v2` with the table from §2.
- `docs/ui-redesign-plan.md` — mark Phase B/C navigation pieces as **delivered (IA)**, leaving only the visual redesign deferred.
- `docs/comprehensive-platform-review.md` + `docs/future-roadmap.md` — tick "patient header overcrowding" and "clinician alerts/dictations buried" as resolved; add Care Mode as a new tracked feature.
- `src/lib/changelog-data.ts` — entry for the IA reshuffle.

## 10. Open questions for you before I build

1. **Care Mode** — keep all three values (Standard / Trial / Recovery) for v1, or ship only Standard + Trial and add Recovery later? As per my earlier comments, I think it would be only standard really. For cases where its a trial drug, that is more so clinician side so lets doument for later. What do you mean by recovery? anyway, sure you get my message, else confirm with me -no assumptions.
2. **Mobile bottom tab bar** — okay to remove the hamburger entirely on mobile, or do you want it kept as a "More" sheet for power users? **Don't remove the hamburger yet. Don't put a bottom nav.** 
3. **Today queue for clinicians** — should unread *messages* live inside Today, or stay as a top-level Communicate tab badge? (Affects whether Communicate is a tab or just a CTA inside Today.) It can be in 'Today' but clinician should get a notification bell up top on the page that will help direct their attention either when they click on it and the page takes them there, or they eventually know how to get there.