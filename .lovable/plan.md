# Plan: Signed-in UI fixes + Simple Mode v1.1 — SHIPPED (v0.9.8)

## Part A — Bug fixes (shipped earlier passes + this turn)

- A1 Nav overflows on signed-in pages — **shipped**
- A2 Schedule/Settings/Guidance reroute to home — **shipped** (SW neutered)
- A3 Assistant renders raw markdown — **shipped** (MarkdownMessage)
- A4 AI drawer X overlaps trash — **shipped**
- A5 FAB + Simple Mode input overlap — **shipped** (FabStack route-aware)
- A6 Medications "at limit" flash — **shipped** (subscriptionReady gate)
- **NEW** Auth profile fetched twice on every page load — **shipped** (AuthContext getSession block removed; onAuthStateChange handles INITIAL_SESSION)
- **NEW** Nav bar invisible at 768–1024px — **shipped** (hamburger now `lg:hidden`, right cluster `ml-auto`, mobile menu opens below `lg`)

## Part B — Simple Mode v1.1 + Clinician Dictation (shipped this turn)

- Transition animation on `/assist` (gradient wash + wordmark, session-scoped) — **shipped**
- Conversation logging (`ai_conversations` + `ai_messages` with RLS, modality tracking) — **shipped**
- Voice input in Simple Mode (60s cap, MediaRecorder → upload → `media-extract` → transcript → send) — **shipped**
- Photo OCR in Simple Mode (paperclip → upload → `media-extract` → medication/vital extraction → confirm prompt to assistant) — **shipped**
- Settings → AI Conversation History (list, per-row delete, bulk delete, retention-policy notice) — **shipped**
- Clinician Dictation page at `/clinician/dictations` — record / upload / transcribe / summarize via `clinician-dictation-process` — **shipped**
  - Per-dictation Approve transcript + Approve summary required before filing
  - Bulk approve with liability-acknowledgement AlertDialog
  - Signed audio playback (1h URL)
- Private storage buckets: `voice-notes`, `simple-mode-images`, `clinician-dictations` (owner-only RLS) — **shipped**

## Deferred / next pass

- Otter-style streaming long-form dictation (multi-minute, chunked upload + incremental transcription). Current 60s cap covers most cases; clinician dictation flow will reuse the same primitive when the streaming backend lands.
- Linking dictations to a specific `patient_user_id` from a searchable picker (currently free-text `patient_label`).
- Surfacing photo-OCR confirm cards as inline editable cards (vs current "confirm via assistant turn" UX).
- Auto-deleting voice/image storage objects when their parent conversation is deleted (currently only DB rows are removed).
