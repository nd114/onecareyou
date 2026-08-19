# How-To Videos: Live Screen Capture with Female Voiceover

Yes — this is doable, and it can be genuinely live rather than a slideshow of screenshots.

Approach: drive the real app in a headless browser against the seeded demo accounts, record actual screen video (typing, scrolling, clicks, page transitions), overlay a visible animated cursor, then narrate it with a female ElevenLabs voice and assemble the final MP4.

## What you get

Two videos, rendered to `/mnt/documents/`:

1. **Patient walkthrough** (~2.5-3 min, desktop 1920x1080 with a mobile section)
   Sign in, Today, log a vital, mark a dose, Medications, Health Vault (open a document), Care Circle sharing, Ask AI, Simple Mode.
2. **Clinician walkthrough** (~2.5-3 min, desktop 1920x1080)
   Sign in, Today triage inbox, patient list + search, patient detail, guidance, dictation/scribe SOAP draft, Practice (team, storage), audit.

Optionally a third short **60-second combined overview** cut from the same footage for socials.

## Script

No script exists yet for a how-to. I'll write two narration scripts derived from the platform functionality and documentations starting from the two handbooks (`patient-guide.md` and `clinician-guide.md`) and going on to others for current platform functionality so the wording matches product vocabulary (wellness routine, catch-up reminder, care record snapshot, "coming soon" where unbuilt). Scripts are saved as `docs/video/patient-howto-script.md` and `docs/video/clinician-howto-script.md` so you can edit lines before I render audio.

## How it runs

```text
1. Script  ->  2. Voiceover (ElevenLabs, female voice)  ->  3. Timed capture  ->  4. Assemble
```

- **Voiceover first.** Each narration beat becomes its own MP3 so I know its exact duration; that duration then sets how long the matching on-screen action lingers. This is what keeps audio and picture in sync instead of guessing.
- **Live capture.** Playwright records video of the real dev server while logged into the demo accounts (`demo-clinician-1@onecare.you` and the seeded patient James Thompson). Human-feeling pacing: eased cursor movement, per-character typing, smooth scrolling, brief pauses on each pane. Cookie banners and the floating bug/AI buttons are dismissed so frames are clean.
- **Visible cursor.** Headless browsers don't draw a pointer, so I inject a small overlay cursor element that tracks every synthetic mouse move and pulses on click — the standard way to make automated capture read as a real demo.
- **Assembly in Remotion.** Reuse the existing `remotion/` project and its theme (forest green / cream / gold, Fraunces-style display type): title card, section cards between chapters, lower-third captions for key steps, zoom/pan on small UI details, and the narration track laid over the screen recording. Final render via the existing `scripts/render-remotion.mjs` pattern, unmuted this time.
- Screenshots we already captured stay useful as fallbacks for any pane that won't cooperate live, and as poster frames.

## Anything needed from you

Only three choices, and I can pick sensible defaults if you'd rather not:

1. **Voice** — I'll use a warm, clear female ElevenLabs voice (Rachel-style) unless you name one.
2. **Audience/tone** — I'll aim at "new user onboarding" (calm, instructional). Say the word if you want a sales tone instead.
3. **Music** — off by default; narration only.

No credentials needed — demo sessions are minted from within the sandbox. Nothing real-patient appears; demo data only.

## Notes and limits

- Videos stay under ~5 minutes each so each render fits comfortably inside the sandbox's 10-minute render window; longer pieces get rendered per chapter and concatenated.
- Audio encoding uses AAC via the system ffmpeg on the final mux step, since Remotion's bundled encoder in this sandbox can't do it directly.
- Capture only — no product code changes. If a walkthrough exposes a real UI bug (clipped text, empty pane), I'll report it rather than quietly edit the app.
