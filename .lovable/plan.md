# Role walkthrough, one workspace, live scribe, design refresh

Four pieces of work, in order.

## 1. Role-by-role walkthrough (owner, admin, provider, nurse, front desk)

Sign in as each seeded hospital account and walk its real screens, checking:

- Only the sections that role should see appear in navigation, and typing a forbidden address directly is refused politely rather than with a raw error.
- Patients list shows only what the role is entitled to (assigned patients for provider/nurse, hospital roster for front desk, everything for owner/admin).
- Actions each role must not take are absent, not just disabled: changing team roles, ending access, editing plan and billing, exporting compliance logs.
- Money screens (Plan, Invoices, Revenue) are invisible to nurse, provider and front desk.
- Nothing gets stuck on a loading spinner, and switching tabs stays instant.

Every gap found is fixed in the same pass, then the role is re-walked to confirm. Result is a short pass/fail note per role.

## 2. Remove personal/hospital workspace switching

The workspace chooser in the account menu comes out, and the app always works inside the hospital the person belongs to. Someone who also practises independently uses a separate account for that, as agreed. Added to the roadmap file as a deferred item so it isn't lost.

## 3. Scribe and dictation, Heidi-style

Both halves this round.

**Live transcription while the visit happens**
- Press record and words appear on screen as they are spoken, with a running timer, pause and resume, and a visible recording indicator.
- Long visits keep working: audio is sent in complete short segments so an hour-long consult transcribes reliably.
- If the connection drops, what was already captured is kept and the clinician is told, rather than losing the visit.

**Better note drafting**
- Choose the note style before or after recording: SOAP, plain narrative, referral letter, or discharge summary.
- The draft appears beside the transcript; each section can be accepted, edited or discarded on its own instead of all-or-nothing.
- Mentioned vitals and medicine changes stay as suggestions the clinician ticks — nothing is written into a patient's record without an explicit approval, and signed notes still stay locked.
- Drafts survive leaving the page and coming back.

## 4. Design directions, then the refresh

Before building anything visual, I capture the clinician workspace as it is now and produce three rendered design directions for you to look at side by side. You pick one; I then apply it consistently — typography, spacing, colour, cards, tables, empty states, buttons and motion — starting with the clinician workspace (Today, Patients, visit notes, Practice) and carrying the same language to the patient app afterwards.

The aim is a modern, calm, confident product feel that a first-time user understands without instruction: fewer boxes, clearer hierarchy, real empty and loading states, comfortable touch targets, and smooth transitions instead of full-page reloads.

## Technical notes

- Walkthrough uses authenticated browser sessions against the seeded hospital accounts; findings fixed in `RequireCapability`, `nav-ia.ts`, `useClinicianCapabilities`, and the practice section pages.
- Workspace removal: delete the switcher block in `ClinicianHeader.tsx`, retire `useActiveWorkspace` and its reads in `usePractice`/`useClinicianCapabilities`, keep the stored key unused so nothing breaks mid-session.
- Live transcription: client captures PCM via Web Audio and uploads complete WAV segments (never MediaRecorder timeslices) to a streaming transcription route using `google/gemini-3.5-transcribe` through the AI gateway; segments append into `clinician_dictations`/`encounters.scribe_transcript`.
- Note styles extend `encounter-scribe` with a template parameter and per-section apply in `EncounterScribePanel.tsx`; approval-before-write and signed-note protection stay untouched.
- Design tokens land in `index.css` and Tailwind config as semantic values copied from the chosen direction; no hardcoded colours in components.

## Deferred

- Personal vs hospital workspace switching in one account.
- Server-side paging for sharing history.
- Department-scoped compliance exports.
