# Screenshot Pack for the UGC / AI-Influencer Video Shoot

Goal: a labeled library of real product screenshots, captured from the seeded demo accounts, that can be dropped into Seedance as screen inserts for the 7 concepts in the uploaded prompt doc — plus a broader sweep of every major pane so future cuts don't need a re-shoot.

## What gets captured

**Mobile vertical (390x844)** — patient side, matches the phone-in-hand shots:
- Today / dashboard (calm state, and one with a due dose)
- Vitals list + a 30-day trend chart (BP, glucose, weight)
- Log a vital / log a dose flow, including the "taken late" state
- Medications list, medication detail, interaction warning panel
- Schedule / today's doses
- Health Vault list + an open document in the viewer
- Care Circle: connected clinicians, invite / share flow, time-limited share permissions
- AI assistant: drawer, a conversation with a plain-language answer, Simple Mode (`/assist`)
- Guidance from clinician, catch-up reminder banner, gold notification banner
- Family switcher + a family member's record
- Settings: sharing consent, audit trail

**Desktop wide (1440x900)** — clinician side, for Concept 7:
- Today / triage inbox with a patient flagged "Pending Review" (gold, not red)
- Patient list with search + pagination
- Patient detail: vitals, meds, timeline, action rail
- Encounter / SOAP editor and Ambient Scribe
- Templates, guidance composer, alert rules
- Messages thread, internal notes, activity log
- Practice: team, storage, subscription, access overview
- Admin/enterprise: tenant console (if the demo account has access)

Plus a handful of desktop patient shots (dashboard, vault, AI hub) for over-the-shoulder framings.

## How it runs

Playwright against the local dev server, one script per persona:
1. Restore the injected demo session; where a second role is needed, mint a session for the matching demo account (`demo-clinician-*@onecare.you`, and the seeded patient James Thompson).
2. Walk each route, wait for data to settle, dismiss cookie/consent banners and FABs so frames are clean, then screenshot the viewport (never full-page).
3. Any screen that renders empty gets noted rather than shipped as a blank frame — if a pane has no demo data, it goes on a short "needs seeding" list at the end.

## Naming and delivery

Files land in `/mnt/documents/onecare-screens/` named by surface and state:

```text
mobile/p-01-today-calm.png
mobile/p-04-vitals-bp-trend-30d.png
mobile/p-11-share-with-provider-timed.png
desktop/c-01-today-triage-pending-review.png
desktop/c-05-encounter-soap-scribe.png
```

An index at `/mnt/documents/onecare-screens/INDEX.md` lists every file with: what it shows, which concept and timecode it serves (e.g. Concept 1, 10.0s–14.0s "vaccination due"), and the viewport it was shot at. Concepts with no matching real screen are flagged so the script can be adjusted rather than faked.

## Notes

- Capture only — no product code changes. If a shot exposes a visual bug worth fixing (clipped text, empty pane), it gets reported, not silently edited.
- All demo data only; no real patient content, and no credentials or tokens appear in any frame.
