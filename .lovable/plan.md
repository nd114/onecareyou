# Pre-Beta Audit + Simplified Mode Recommendation

This is an **audit-only** pass. No code changes proposed yet — once you approve priorities, I'll create a separate fix plan.

---

## Part 1 — Audit Findings

### Patient side

**P0 (blocks beta)**

1. **AI consent gate is opaque.** `patient-ai-chat` returns 403 if `ai_processing_consent` is false, but `AIChatDrawer` opens `AIConsentDialog` *only on first send attempt*. A user who has consent revoked elsewhere just sees the error toast. → Need a graceful re-prompt path.
2. **Bug + AI buttons stacked on small screens.** Bug button is `bottom-24 right-6`, AI FAB is `bottom-6 right-6`. They no longer overlap, but on a 360px viewport the OfflineBanner + bottom-mobile-nav (if any) + these two FABs crowd the thumb zone. Needs a single FAB stack container.
3. **Offline write-queue toasts are silent on success-after-replay.** When connectivity returns and `flushQueue` posts a vital, the UI doesn't tell the user "your offline reading from 2hrs ago synced." Risk: users add the same reading twice.
4. **Family switcher scope leak risk.** `FamilyContext.activeMemberId` is read by `useVitals`/`useMedications`/`useScheduleEntries`, but `useAdherenceReport`, `usePatientGuidance`, `useHealthDocuments`, and `useMessages` were not verified — they may still show the primary patient's data when a family member is active.
5. **Onboarding "Skip for now"** persists `last_completed_step` but there's no resume CTA on the dashboard — a skipped user lands on a half-empty dashboard with no nudge.

**P1**
6. AI chat history is in-memory only (`useAIChat` `useState`). Refresh wipes the conversation — fine for v1 but worth telling testers.
7. `PatientAIChatMount` excludes `/clinician` but not `/onboarding`, `/install`, `/subscription-success` — the FAB shows on Install page.
8. `BugReportButton` is mounted globally including on public marketing pages (`/`, `/pricing`, `/for-clinicians`) — exposes beta-tester UX to anonymous prospects.
9. Cookie banner + offline banner + bug FAB + AI FAB = 4 simultaneous overlays possible on `/dashboard` first visit.
10. `Sparkles` / `Bot` icon used as agent identity — violates our own chat-agent-ui-contract (agent should have a domain-specific mark).
11. Health Vault upload has no progress indicator on slow mobile uploads.
12. Schedule "mark as taken" optimistic update doesn't revert if the queued write later fails after max retries.

**P2 / polish**
13. `useAIChat` doesn't truncate context client-side — sends all messages each call (server caps to last 10, so wasted bandwidth on mobile).
14. No empty-state for `/messages` when patient has no clinician connection.
15. No "your data is saved locally and will sync" indicator near the offline banner.

### Clinician side

**P0**

1. **Session timeout collision.** 30-min HIPAA timeout is enforced, but the clinician messages page uses Supabase realtime which keeps the tab "active" — timer may never trigger if WebSocket pings count as activity. Needs verification.
2. `**patient_basic_info` view vs sensitive data**: `ClinicianPatientDetail` reads from both paths but I didn't confirm every tab (Vitals, Vault, Adherence, Messages) gates on the matching `provider_shares.permissions` JSONB field. A clinician with `vitals: true` but `profile: false` may still see avatar/DOB.
3. **Bulk import error rows are silent.** `ClinicianPatientImport` shows row counts but no downloadable error CSV — testers can't debug failed rows.

**P1**
4. Practice RBAC: invite flow exists but no UI to *revoke* a team member's access after they're added.
5. `ClinicianAlerts` lists triggered alerts but no "acknowledge" / "snooze" action — alerts just accumulate.
6. Clinician sign-out doesn't clear `useClinicianTour` localStorage flag → next clinician on same browser skips onboarding.
7. EHR sync history dialog opens with all-time logs — no date filter, will be unusable after a few weeks of real use.
8. No mobile layout for clinician routes (`ClinicianDashboard`, `ClinicianPatients`) — clinicians using a phone in rounds will struggle.

**P2**
9. Subscription tier limits (`patient-limit-banner`) only check on dashboard load; importing past the limit isn't blocked at the action.
10. No audit log surface UI — the `useHipaaAuditLog` writes happen, but clinicians have nowhere to view their own access history (required for some BAAs).

### Cross-cutting

- **Memory drift**: `mem://index.md` says "Patient AI Assistant uses Gemini 1.5 Flash" — actual code uses `google/gemini-3-flash-preview`. Should refresh.
- **SEO**: `/install` and `/for-clinicians` not in `sitemap.xml` (verify).
- **Service worker**: kill-switch SW is in place but no telemetry to confirm legacy SW was actually unregistered for returning testers.
- **Beta tester pack** mentions features (Family switcher, offline) but doesn't include a known-issues section.

---

## Part 2 — Simplified / "AI Mode": My Recommendation

You asked for my thoughts on each option. Here they are honestly.

### Option A — Patient-only conversational shell (read + write)

**My take:** Highest user delight, highest risk. The moment AI can write data ("log my BP 140/90"), you inherit responsibility for misparsed numbers, wrong family member, accidental dose-marking. Needs confirm-step on every write, full audit trail, and clear "AI did this" badges on records. Doable, but doubles QA surface. **Not for first beta.**

### Option B — Patient + Clinician AI mode

**My take:** Tempting but premature. Clinician "command bar" sounds great in demos ("show high-risk diabetics this week") but clinicians under time pressure want deterministic UI, not a text box that might misinterpret them. Most successful clinical AI (Abridge, DAX) does *ambient* not *command*. **Defer.**

### Option C — Patient conversational shell + read-only summaries ⭐ RECOMMENDED for beta

**My take:** This is the sweet spot for v1.

- AI can answer ("what's my average BP this week?", "did I take my metformin yesterday?", "what's an A1C?", "where do I add a vital?")
- AI can navigate (already does via `[NAVIGATE:/path]`)
- AI **cannot** create/edit/delete data — users still tap UI for writes
- No new audit/consent complexity beyond what exists
- Ships in ~2 days
- Fully reversible — if users want write actions in v2, the same chat surface absorbs them

This is also the most honest answer to "make it feel like Claude/Gemini": those don't write to your bank account either.

### Option D — Just upgrade the existing Assistant

**My take:** Underwhelming as a positioning story. Your differentiator post-beta will partly be "talk to your health data" — that deserves a real mode, not a bigger drawer. But the *implementation* of Option C should reuse the existing `useAIChat` + `patient-ai-chat` edge function — so technically it's D underneath, presented as a mode.

### My recommendation

**Ship Option C as "Simple Mode" toggle in patient settings + a `/assist` route**, text-only (per your answer), reusing existing AI infra. Concretely:

- New `/assist` route: full-page chat (not a drawer), large input, suggestion chips ("Show this week's vitals", "What did I take yesterday?", "Add a vital" → navigates).
- Settings toggle: "Default to Simple Mode on sign-in" → routes to `/assist` instead of `/dashboard`.
- Server-side: extend `patient-ai-chat` with **read-only tools** (`getRecentVitals`, `getTodaySchedule`, `getActiveMedications`, `getAdherenceSummary`) using AI SDK `tool()` pattern. No write tools.
- Honest disclosure: "Simple Mode is AI-assisted. It can read your data but won't change it — tap the buttons for that."
- Voice deferred per your answer (mic icon greyed with "coming soon").

**Effort:** ~2 days *after* the audit fixes above.
**Risk:** Low — no new write paths, no new consent surface, no new RLS.

---

## Part 3 — Suggested next sequence

1. **You pick which audit items to fix** (I'd recommend all P0s, both patient and clinician, plus P1 #4 & #6 clinician, P1 #7 & #8 patient).
2. I produce a focused **Fix Plan** (separate `plan--create` call) with file-level changes.
3. After fixes land + a fresh smoke test, build **Simple Mode (Option C)** as its own milestone.
4. Refresh memory + changelog (`0.9.8`).

Tell me which P0/P1 items you want in scope and I'll write the fix plan.

Go ahead with your recommendations. No need to produce a fix plan, i think you've identified them here, so just go ahead and fix and implement. I like your option C, so go ahead with that as it's own milestone as you have indicated. 