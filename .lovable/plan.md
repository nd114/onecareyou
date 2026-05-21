# Plan: Signed-in UI fixes + Simple Mode enhancements

I split this into **Part A — Bugs to fix now** and **Part B — Simple Mode roadmap** (which needs a couple of decisions before I build it). I'll need answers on Part B before starting it, but Part A can ship immediately on approval.

---

## Part A — Bug fixes (ship now)

### A1. Nav bar overflows on signed-in pages

**Cause:** `Header.tsx` uses three `flex-1` lanes (logo / nav / right-side) with 7 nav links plus Family switcher + Bell + Avatar+name. Between ~1024–1366 px the center nav pushes the logo and avatar off-screen (visible in images 1 & 2 — "OneCare" and "James Thompson" get clipped).

**Fix:**

- Remove `flex-1` on the side lanes; let logo and right-side size to content and center nav take remaining space.
- Drop nav `gap` to `gap-2 lg:gap-5`, use `text-[13px] lg:text-sm`.
- Hide username label below `xl` (already does at `lg` — push to `xl`).
- Promote the `md:` breakpoint for the full nav to `lg:` and show a compact "More" menu on `md` so 7 links don't compress.
- Constrain container to `max-w-screen-2xl` and keep `overflow-x-hidden` on header.

### A2. Schedule / Settings / Guidance reroute to home

**Cause:** `Schedule.tsx` calls `useServiceWorker()`, which registers `/sw.js`. `public/sw.js` is the kill-switch SW — on `activate` it calls `clients.matchAll(...).navigate(url + '?sw-cleanup=...')` on every open tab and then unregisters. When SW state is mid-cycle, that navigate plus the SPA's auth bootstrap can land the user back on `/`. Memory rule already says: **no SW caching of HTML, legacy SW killed.**

**Fix:**

- Remove the `useServiceWorker()` call from `Schedule.tsx` (and any other page that imports it).
- Replace `public/sw.js` with a truly inert stub: install, immediately `self.registration.unregister()`, **no `clients.claim()` and no `clients.navigate()**` so existing devices still clean up but never reload anyone.
- Leave the `useServiceWorker` hook file in place for now but make it a no-op that returns nulls, so nothing re-registers.

### A3. Assistant replies render raw markdown

**Cause:** Both `Assist.tsx` and `AIChatDrawer.tsx` render `message.content` inside a `<p whitespace-pre-wrap>`, so `**bold**`, lists, and headings stay literal (image 3).

**Fix:**

- Add `react-markdown` + `remark-gfm`.
- Create `src/components/ai/MarkdownMessage.tsx` that wraps `ReactMarkdown` with our prose tokens, sized for chat bubbles (tight spacing, smaller headings, list bullets, code styling, link styling that uses `text-primary underline`).
- Replace the `<p>` in `MessageRow` (Assist) and `MessageBubble` (Drawer) with `<MarkdownMessage>` for assistant messages only — keep user messages plain text.

### A4. AI chat drawer: close X overlaps trash icon

**Cause:** Radix `SheetContent` renders a built-in close button at `top-4 right-4`. Our header puts `<Trash2>` button in the same corner.

**Fix:** Add `pr-10` to `SheetHeader` and move the trash button into the title row so it sits inline-left of the close X with `gap-2`, not absolute-stacked.

### A5. Bug + AI FABs visually crowd input on Simple Mode

**Cause:** `FabStack` is `fixed bottom-4 right-4`, but on `/assist` the chat input bar also has a send button anchored bottom-right; they overlap on small viewports. Bug button stays visible on `/assist` (AI button is excluded there).

**Fix:**

- On routes where a sticky bottom input exists (`/assist`, `/messages`, `/clinician/messages`), raise the FabStack with `bottom-24` (above the input bar) — drive it from a `useLocation()` check inside `FabStack`.
- Also ensure FabStack children all use `position: relative` and `pointer-events-auto`; verify AIChatFAB wraps its motion.div with `pointer-events-auto` (already does) — no other change needed.

### A6. Medications page briefly flashes "at limit"

**Cause:** `useSubscription()` starts with `subscription = null` → `isPremium = false` → if patient has ≥ `FREE_MEDICATION_LIMIT` active meds, the upgrade banner renders for one paint before `checkSubscription()` resolves.

**Fix:** Expose `subscription === null || checkingStatus` as a `subscriptionReady` boolean (true once first response lands). In `Medications.tsx`, render the limit badge and upgrade banner only when `subscriptionReady` is true. Same gating for the Add button's disabled state.

---

## Part B — Simple Mode v1.1 (needs your input)

You asked for: (1) a "Quick Mode" transition animation, (2) logging of text conversations, (3) photo-OCR auto-fill with user confirmation, (4) voice input with audio archived for compliance, (5) the same audio→summary loop on the clinician side with approval.

Here's my recommendation, but I'd like to confirm scope first via questions.

### Proposed direction

1. **Transition** — Tap "Simple Mode" → full-screen gradient-green wash slides in from right with "Simple Mode" wordmark fading in, then resolves into the chat. Reverse on exit. Implemented as a single `framer-motion` layout wrapper on `/assist` plus a triggered overlay component on enter/exit. Cheap, no library beyond what we have. Approved! 
2. **Conversation logging** — Persist every Simple Mode message to a new `ai_conversations` + `ai_messages` pair (patient-owned, RLS-scoped), with `source = 'simple_mode' | 'drawer'`, `input_modality = 'text' | 'voice' | 'image_ocr'`, and a JSONB `metadata` (e.g. detected route, tool calls). Compliance retention default 7 years (HIPAA), purgeable on account deletion. Approved!
3. **Photo → OCR → confirm** — Existing `src/lib/ocr.ts` is already in the project. New flow: paperclip button in Simple Mode → user uploads/takes photo → edge function `simple-mode-extract` runs OCR + Gemini extraction → returns structured candidate (med name, dose, frequency / or vital + value + unit) → renders a **confirm card** in the chat with editable fields → on submit, writes to the right table. **Nothing is saved without explicit user tap. Yes, absolutely.**
4. **Voice → transcript → confirm** — Mic button records up to 60s, uploads to a private `voice-notes` bucket, edge function calls Gemini transcription, returns transcript and proposed action; user confirms before write. Audio file retained alongside transcript. - Okay for now, but also looking to longer sessions; perhaps we can connect Otter or something similar in? Then the clinician can confirm.
5. **Clinician parallel** — Same primitive on clinician side for visit/dictation notes: record → transcribe → summarize → clinician sees side-by-side audio player + transcript + AI summary → must click **Approve transcript** and **Approve summary** before either is saved to the patient record. Stored in a `clinician_dictations` table with audit log entry on each approval. - Yes correct but also as I said in '4'. 

### Questions I need to ask before building Part B

I'll send these as a 3-question prompt right after you approve Part A so we can ship the fixes immediately and iterate on Simple Mode in the next pass:

1. Build all of Part B (transition + logging + OCR + voice + clinician dictation) in one go, or only the transition + logging now and defer OCR/voice/clinician? Build all in one go if you can. Else, second pass is okay. 
2. For logged conversations, should the user be able to see and delete their own Simple Mode history from Settings (recommended yes)? Yes they can, but we should retain it and state reason why in our policies - they should note that using it is in agreement to said policies on information collection and retention and any other legal concerns.
3. For the clinician dictation flow, is approval **per-patient** (clinician must approve each dictation against the patient record before it is filed) or **bulk** (queue review)? - Yes per patient review would be optimal, but in the event that they have many patients and deal with them in sequence, we should enable them to be able to bulk approve but note that we don't bear any responsibility for errors due to them not reviewing; we can also just queue it for their approval when they are ready, after all if any errors or any thing is to be affixed to a patients profile, they must explicitly approve. 

---

## Files I expect to touch in Part A

- `src/components/layout/Header.tsx` — nav sizing
- `public/sw.js` — inert kill-switch (no claim/navigate)
- `src/hooks/useServiceWorker.ts` — neuter to no-op
- `src/pages/Schedule.tsx` — drop `useServiceWorker()` call
- `src/components/ai/MarkdownMessage.tsx` *(new)*
- `src/components/ai/AIChatDrawer.tsx` — markdown + header layout
- `src/pages/Assist.tsx` — markdown
- `src/components/beta/FabStack.tsx` — route-aware bottom offset
- `src/pages/Medications.tsx` — gate limit UI on `subscriptionReady`
- `src/hooks/useSubscription.ts` — expose `subscriptionReady`
- `package.json` — add `react-markdown`, `remark-gfm`

No database changes in Part A. Part B will need a migration (conversations, messages, dictations, storage buckets, RLS) — I'll write that with the implementation.