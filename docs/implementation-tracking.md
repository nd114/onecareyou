# OneCare Implementation Tracking

Authoritative log of *how* recent features work — components, hooks, edge functions, data flow, safety rules. Pair with `docs/requirements-implemented.md` (what) and `src/lib/changelog-data.ts` (when/announcement). Update on every meaningful change.

---

## 1. Patient AI Chat FAB (P8)

### Scope
Floating assistant button available on every patient-facing route. Answers general health and platform-navigation questions. Aware of the user's active medications (opt-in, gated by AI consent).

### Components
- `src/components/ai/AIChatFAB.tsx` — fixed-position button (bottom-right) that opens the drawer.
- `src/components/ai/AIChatDrawer.tsx` — Sheet-based chat UI, voice input via Web Speech API, navigation chips for `[NAVIGATE:/route]` intents.
- `src/components/ai/PatientAIChatMount.tsx` — **single global mount** in `App.tsx > AppLayout`. Route-aware: renders only when authenticated AND pathname is in `ALLOWED_PREFIXES`, AND not in `EXCLUDED_PREFIXES` (`/clinician/*`). Per-page mounts (e.g., old Dashboard import) were removed to avoid duplicates.

### State / hook
- `src/hooks/useAIChat.ts` — local message state, sends last 10 messages to `patient-ai-chat` edge function, surfaces `suggestedRoute`, handles errors as assistant turns.

### Consent gate
- `useAIConsent` checked on first send / first voice transcript. If not granted, `AIConsentDialog` opens; nothing is sent until `grantConsent()` resolves.
- Server re-checks `profiles.ai_processing_consent`; missing consent returns 403.

### Edge function (`supabase/functions/patient-ai-chat`)
- Verifies bearer token, loads profile, re-checks AI consent.
- Builds system prompt with: navigation route map + **active-medication snapshot** (name, dosage, frequency — pulled from `medications` where `user_id = auth.uid()` and `is_active = true`, capped at 20 rows). Snapshot is included only if consent is on.
- Model: `google/gemini-3-flash-preview` via Lovable AI Gateway.
- Extracts `[NAVIGATE:/path]` and returns `{ content, suggestedRoute }`.

### Safety rules (system prompt)
1. Never diagnose, prescribe, or recommend treatments.
2. For medication questions, may explain **what a drug class does in general** and reference the user's own listed meds by name, but must defer dose/interaction decisions to the prescriber.
3. For symptom or red-flag triage, instruct user to seek urgent care (911 / local emergency number).
4. Every response ends with the medical-disclaimer line.
5. Hard cap 300 words, 1024 max tokens.

### Future hooks (logged, not built)
- Pull from `medication_info` and `drug_interactions` to answer "can I take X with Y?" with citation links instead of free-text.
- Curated health-news feed (recalls, breakthroughs) as a retrieval-augmented source.

---

## 2. Secure in-app messaging

### Data
- `messages` table (id, sender_id, recipient_id, body, created_at, read_at).
- RLS: sender/recipient must have an **active `provider_shares` row** between them. Enforced by SECURITY DEFINER helper, not by joining `auth.users`.
- Realtime: table added to `supabase_realtime` publication.

### UI
- Patient: `src/pages/Messages.tsx` + header entry point.
- Clinician: `src/pages/ClinicianMessages.tsx` + nav entry on `ClinicianHeader`.
- Shared: `src/components/messaging/MessageThread.tsx` (optimistic send, scroll-to-latest, read-receipt on view).
- Hook: `src/hooks/useMessages.ts` — fetches thread, subscribes to realtime inserts/updates.

### Visibility check
Both patient and clinician headers expose the entry point. Confirmed against `ClinicianHeader.tsx` and patient `Header.tsx`.

---

## 3. Enterprise inquiry pipeline

### Flow
`EnterpriseInquiry.tsx` → `supabase.functions.invoke('notify-enterprise-inquiry', { body })` → Resend sends:
1. Branded confirmation to the inquirer (acknowledges receipt + SLA).
2. Structured notification to `sales@onecare.you` with all form fields.

### Edge function (`supabase/functions/notify-enterprise-inquiry`)
- `verify_jwt = false` is **not** set — function runs with caller's JWT but does not query PHI.
- Uses `RESEND_API_KEY` (already configured).
- Returns `{ ok: true }`; on failure, surfaces a toast but does not block form clearing on success.

---

## 4. Discontinued-medication auto-deactivation (P6)

### Trigger
PL/pgSQL `BEFORE INSERT OR UPDATE` on `medications`: if `end_date IS NOT NULL AND end_date < now()::date`, set `is_active = false`. Backfill statement included in the same migration.

### Why a trigger, not a CHECK
Rule depends on `now()` (non-immutable) — CHECK constraints would reject the migration on restore. Trigger is also non-blocking for legitimate "today is the end_date" edits.

---

## 5. Guidance starter templates

### Component
`CreateGuidanceDialog.tsx` exposes a "Use a template" selector with built-in starters (BP monitoring, new-med start, post-discharge, low-glucose protocol, etc.). Selecting a template prefills title + body; clinician edits freely before save.

### Roadmap
DB-backed `guidance_templates` (per-practice library, sharing, versioning) is still planned. Tracked in `docs/future-roadmap.md`.

---

## 6. Clinician session-timeout warning (C10)

### Hook
`useSessionTimeout` (clinician-only) raises a toast at 28 min with a "Stay signed in" action that resets the timer. At 30 min with no interaction, signs out and routes to `/clinician/sign-up`.

---

## 7. Patient subscription auto-refresh

### Hook
`useSubscription` now polls `check-subscription` on focus + after Stripe redirects, matching the clinician-side behavior. Premium UI updates without a manual reload.

---

## 8. Notes auto-save indicator (C7)

### Component
`PatientNotesDialog.tsx` shows "Saved Xm ago" / "Saving…" / "Unsaved changes" states tied to a debounced upsert. Dialog also warns on close if unsaved.

---

## 9. Internal changelog

### Route
`/admin/changelog` — wrapped in `ProtectedRoute`, `noindex,nofollow` meta. Data lives in `src/lib/changelog-data.ts`. Not linked from public nav; share the URL directly with team/investors.

---

## 10. QHIN integration (planned, not built)

See `docs/qhin-integration-plan.md`. Provenance tables (`qhin_imports`, `qhin_record_provenance`) are step 1 — every other piece (ingestion worker, dedupe, UI badges, TEFCA revoke flow) hangs off them.

---

## How to update this file

- Land a feature → add a section here in the same PR/turn.
- Keep sections short: scope, key files, data flow, safety/edge cases.
- When something is intentionally deferred, log it under the relevant section's "Future hooks" so the reasoning isn't lost.
