# Quick voice memos, and making the scribe reachable

Status: plan, nothing built. Written from a read of the code on 2026-10-03.

## Part 1. What exists today (verified)

| Piece | Where | Notes |
| --- | --- | --- |
| Capture engine | `src/hooks/useLiveScribe.ts` | AudioContext + ScriptProcessor. The whole visit is held as Float32 chunks in RAM, with 7 s windows for live text. `useEffect(() => teardown, [])` kills the mic on unmount. Nothing is persisted until Stop. |
| Live words | `supabase/functions/transcribe-segment` | JWT only. No metering, no consent check, stores nothing. |
| Draft | `supabase/functions/encounter-scribe` | Needs an `encounters` row the caller authored plus `has_current_clinical_access`; audio path must start `<uid>/`. Writes `scribe_transcript`, `scribe_audio_path`, `scribe_draft` only, never the clinical fields; logs `scribe_draft_generated` to `patient_action_log`. Reuses the live transcript if sent. |
| Review/approve | `EncounterScribePanel` | `onApply` copies accepted sections into the note editor; the clinician edits and signs. Never auto-filed. |
| Consent to record | per encounter | `encounters.metadata.recording_consent_confirmed_at/by`, asked before the mic starts. |
| Audio bucket | `clinician-dictations` | Private, owner-folder RLS (`<uid>/...`). Audio is kept: `scribe_audio_path` is never removed (no retention job found). Counted by the storage ledger. |
| Metering | none | Pricing copy says "Metered" / "Included" (`ClinicianPricing.tsx`) and `CLINICIAN_FEATURE_TIERS.ambient_scribe` exists, but nothing in code or SQL counts scribe minutes or reads that flag. Metering is a promise with no mechanism. Build it before memos or memos inherit the gap. |
| AI consent | | Patient-side functions check `profiles.ai_processing_consent`. The clinician scribe functions do not. |

## Part 1b. Voice memo design

Principle: a memo is the clinician's own dictation, not the patient's record, until the clinician turns it into a draft note and signs it. Reuse everything; add one table and one thin function.

**Capture UI.** One tap on a persistent record control (Part 2) opens a compact bottom-sheet recorder, not a dialog: big stop button, timer, level bars, "Attach to patient (optional)". No patient picker before recording. Reuse `useLiveScribe`, lifted into a global `ScribeRecorderProvider` (needed for Part 2 anyway). Persist audio incrementally, not at Stop: every window is also appended to IndexedDB (`memo-<uuid>` store). On Stop, concatenate to WAV, upload, clear. On next app load, orphaned chunks are offered as "Recover unsaved memo". This gives offline tolerance (upload queue retried on reconnect) and survives a tab kill. Live transcript is OFF for memos (saves a gateway call per 7 s); transcribe once after upload. Mobile caveat: browsers suspend mic capture when the tab backgrounds or the screen locks. Wake-lock (separate work) helps only in the foreground, so say so in the UI and keep the IndexedDB chunks so a suspended capture still yields what was heard. Do not build a native wrapper for this.

**Consent.** Memos are the clinician speaking, so no patient consent is needed to record. The rule is not to capture patients' voices. Sheet text: "Dictate your own notes. Do not record the patient. For a conversation with a patient use Record visit." Do not try to detect third-party speech.

**Data model (migration `..._voice_memos.sql`).**
`voice_memos(id, clinician_user_id, practice_id null, patient_user_id null, audio_path, duration_ms, status ['uploaded','transcribing','transcribed','failed','assigned','filed','discarded'], transcript, draft jsonb, encounter_id null, error_code, created_at, assigned_at, audio_deleted_at)`.
RLS: owner only. No share, practice or patient policy, mirroring `patient_recordings`; assert it in `supabase/tests/voice_memos.test.sql`. Storage: reuse bucket `clinician-dictations`, path `<uid>/memos/<id>.wav` (existing owner RLS already fits). CHECK: `status='transcribed'` requires a non-empty transcript.

**Assignment.** `patient_user_id` is nullable (the unassigned inbox). Assignment goes through RPC `assign_voice_memo(memo_id, patient_user_id, practice_id)` that calls `has_current_clinical_access(patient, practice)` and refuses otherwise. A trigger on `voice_memos` re-checks on any patient change so a direct update cannot bypass it. The picker is `useClinicianPatients()` (already share-scoped, `share_active`). If access ends before filing, the memo stays with the clinician but is unassignable and unfileable (same rule as `encounter-scribe`'s 403). Offboarding: unassigned memos belong to the clinician and go with the account; filed ones are already clinical record. Cover in `clinician-offboarding.md`.

**Transcribe to draft.** New edge function `voice-memo-process` (not a branch of `encounter-scribe`, which requires an encounter): JWT, owner check, download, the gateway `audio/transcriptions` endpoint (as `transcribe-segment`, rather than base64 in a chat call), then, only if a patient is assigned, the SOAP prompt (reuse `SOAP_SYSTEM`, add a short "memo" style). Unassigned memos get a transcript only, since a draft about nobody is noise. It never writes clinical fields on `encounters`. "Make draft note" lets the clinician pick or create an open draft encounter and the draft goes through the existing `EncounterScribePanel` apply path; signing is unchanged. Prompt keeps "use only what the transcript supports"; the AI gives no advice. Banner: "AI draft from your voice memo. Not reviewed."

**Retention.** Default: delete audio 24 h after the transcript is confirmed (clinician presses Keep transcript, or the memo is filed or discarded), with a hard cap of 30 days for anything unconfirmed. Why: audio is the highest-PHI, highest-storage, lowest-value artefact once text exists, and a memo has no legal-record status. Per-clinician setting "Keep audio" (off by default). Implement with a daily pg_cron job that removes storage objects and stamps `audio_deleted_at`; the UI handles a missing file. Today's encounter scribe keeps audio indefinitely, which is inconsistent; decide separately and do not change it silently. Do not state memo retention in `DURABILITY_POINTS` until the job exists (add a third constant, as was done for patient audio).

**Metering.** Add `scribe_usage(clinician_user_id, source ['visit','memo'], seconds, occurred_at, ref_id)`, written server-side from the real audio duration (never client-reported). Monthly allowance per tier in one constant (trial small, individual metered with overage, practice included with fair-use cap, enterprise negotiated) and a `scribe_remaining(clinician)` RPC. Functions refuse with a named error at the limit; the sheet shows remaining minutes. Retrofit `encounter-scribe` and `transcribe-segment`. This is also the first real enforcement of `ambient_scribe`.

**Privacy and logs.** Private bucket, owner RLS, short-lived signed URLs. New functions log ids and status codes only, never transcript text or patient ids (existing functions log full gateway error bodies; do not copy that). `patient_action_log` gets a row at assignment and at filing (`voice_memo_drafted`), not at capture, so unassigned memos leave no patient-linked trace.

**Patient-facing.** The patient is not told a memo exists until the clinician files a note from it, at which point it is an ordinary signed encounter note the patient already sees (foundations: a clinician's note is the clinical record, visible to the patient). Memo audio and unfiled transcript are the clinician's working material, like jottings; never shown to or shared with the patient, never in `patient_recordings` or the Vault. Add a short paragraph to the consent docs saying exactly this.

**Failure and retry.** Upload failure: chunks stay in IndexedDB, retried with backoff, badge on the record control. Transcription failure: status `failed` plus Retry, with the stalled rule copied from `isTranscriptInFlight` (pending > 15 min is stalled). Empty transcript: `failed` with a reason, never a blank "transcribed". If the row insert fails after upload, delete the object. Make the function idempotent per memo id so retries do not double-bill.

**Do NOT build:** auto-filing or auto-signing; auto-assignment by name detected in the transcript (a wrong guess puts PHI in the wrong chart); recording patients through memos; patient-visible memos; native background capture; diarisation; sharing memos between clinicians; keeping audio forever by default; a second recorder implementation.

**Effort.** Migration + RLS + tests 1 d; assign RPC + trigger 0.5 d; `voice-memo-process` 1 d; usage + limits + retrofit 1.5 d; global recorder provider + IndexedDB chunks + recovery 2 d; memo sheet + inbox + assign + make-draft 2 d; retention job 0.5 d; docs 0.5 d. About 9 days; the provider (shared with Part 2) is the long pole.

## Part 2. Scribe reachability (walked in code)

Entry points that start a recording today:
1. Clinician rail "Visit note" button (`ClinicianRail.tsx`, desktop only, gated `edit_clinical`) -> `/clinician/scribe`.
2. Today pillar tab "Visit notes" (`nav-ia.ts`) -> same page. On phones this is the only route in: the bottom bar has 4 pillars (Today, Patients, Communicate, Practice) and no scribe item; "Visit notes" is a secondary tab under Today.
3. `/clinician/scribe`: pick patient -> `/clinician/patients/:code?tab=encounters&scribe=1` -> `EncountersTab` auto-creates or reuses a draft encounter and opens a Dialog -> consent dialog (first time per encounter) -> Record visit.
4. Patient chart -> Encounters tab -> "Scribe" button on an existing encounter. No scribe action in the chart header or rail.
5. Not entry points: global search (`GlobalSearch.tsx`) lists patients and page tabs from `navTargets`, so "Visit notes" is findable as a page but there is no "Start scribe" action and no "Record visit for <patient>". The clinician assistant drawer has no recording action. `ClinicianDictations` (`FileDictationDialog`, 60 s cap) is off the nav.

Taps to first audio:
- Desktop from anywhere: rail button, pick patient, (consent), Record = 3 to 4.
- Mobile from dashboard: Visit notes tab (may need to scroll the tab row), pick patient, (consent), Record = 4 to 5, with page loads between.
- Patient chart: Encounters tab, Scribe or New encounter, (consent), Record = 3 to 4.
- Messages: leave first, then as dashboard = 5 to 6.

Why it is hard to find: nothing on the mobile bottom bar; named "Visit notes" rather than scribe/record; a sub-tab of a pillar named for the inbox; no chart-level action; not a palette action; no persistent control anywhere; the one prominent button is hidden below md. Tier gating is not the cause: `ambient_scribe` allows trial/solo/pro/enterprise and the flag is not read in the UI. The only gate is the `edit_clinical` capability, which silently HIDES the rail button, tab and route (no locked state or explanation). Community tier is also never shown a locked scribe; it simply is not offered.

### Data-loss risks (precise)
1. Recorder state lives in `EncounterScribePanel` (`useLiveScribe` is a component hook), mounted inside a Radix Dialog inside `EncountersTab` inside the patient page. Any route change (bottom nav tap, back button, notification link, search navigation) unmounts it; the hook's unmount effect stops the mic and drops the buffer. The whole visit is lost with no warning. Audio exists only in memory until Stop.
2. The Dialog `onOpenChange={(o) => !o && setScribeFor(null)}` has no guard: Escape, outside click or the X while recording unmounts and discards. `RecordVisitDialog` removes its close button once audio exists; the scribe does not.
3. Page reload, mobile tab discard or crash loses everything; no chunk persistence.
4. Stop -> upload -> `encounter-scribe` is one chain in `process()`. If the upload or the function fails it toasts and the WAV blob (local to the call) and the live transcript are dropped: no retry, no download fallback.
5. `encounter-scribe` has no idempotency, so a retry double-spends gateway cost (relevant to metering).

### Recommendations
1. Global `ScribeRecorderProvider` beside `AuthProvider` in `App.tsx`: owns `useLiveScribe`, the target encounter or memo, and the upload/process pipeline. `EncounterScribePanel` becomes a view over it. Add a `beforeunload` guard while recording.
2. Persist chunks to IndexedDB during capture; on Stop save the WAV locally before upload and keep it until the draft is confirmed; "Recover recording" at next load; "Download audio" on failure.
3. Persistent recording pill (fixed above the mobile bottom bar, top-right on desktop): red dot, timer, Stop, tap to return. Visible on every route while recording or processing.
4. Mobile: a centre record action in the bottom bar for clinicians with `edit_clinical`. Tap = memo sheet (instant record); long-press or secondary = "Record visit for a patient".
5. Patient chart header: "Record visit" primary button (creates or reuses the draft encounter, patient pre-attached).
6. Command palette: actions "Start scribe", "New voice memo", and per patient "Record visit for <name>" (patients already loaded in `ClinicianSearchBody`).
7. Assistant drawer: a "Record a visit" / "Voice memo" action chip that only triggers the provider.
8. Locked state: show the control disabled with a reason ("Your role cannot write notes" / "Scribe is not on your plan"), do not hide it. Read `hasFeatureAccess(tier, 'ambient_scribe')`.
9. Rename the "Visit notes" tab to "Scribe" and make it first in Today's tabs.
10. While recording, no Escape or outside-click close; closing minimises to the pill instead of discarding.

## Recommended build order
1. Data-loss fix first, no new features: dialog guard, `beforeunload`, save WAV locally before upload with retry and download fallback. About 1 d.
2. Global recorder provider, persistent pill, route-change survival, IndexedDB chunks. About 3 d.
3. Entry points: mobile centre action, chart header button, palette actions, rename, locked states. About 1.5 d.
4. Metering (`scribe_usage`, limits, retrofit). About 1.5 d, before memos so they are metered from day one.
5. Voice memos: table/RLS/assign RPC, process function, sheet and inbox, retention job, docs. About 5 d.
