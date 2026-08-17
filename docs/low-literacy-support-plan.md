# Low-Literacy Support (Simple Mode) — shipped preference, deferred depth

Status: **partly shipped.** The preference itself is built and live (August
2026). The five changes in §3 are **deliberately deferred for review later** —
they are a rebuild of the patient surfaces, and that is not work to start
casually.

---

## 1. Why this is a separate problem from translation

Solving language does not solve literacy. A patient may read no language
fluently, or may read their own language perfectly well but not the register a
medical app defaults to — dosage tables, clinical nouns, dense forms.

The design goal is that **the app works without reading**. That is a different
target from "the app is available in Yoruba", and the two are worth funding
separately.

## 2. What shipped

Before this, `/assist` existed as a "simple mode" but was a sub-tab inside the
Learn pillar: four taps in, unfindable by the people who need it, and not
persistent — you had to re-find it every session.

What is now built:

- **`profiles.simple_mode`** — a stored boolean preference, so the choice
  survives sign-out and follows the patient across devices.
- **`SimpleModeChoice`** (`src/components/patient/SimpleModeChoice.tsx`) — the
  offer, with an information control explaining **who it is for, what changes,
  and why**. Three things governed how it is worded:
  - It is framed as an offer, never a diagnosis. Nobody should have to identify
    as struggling in order to pick it.
  - The explanation says explicitly that nothing is hidden or removed — the
    commonest reason a patient refuses a simplified view is fear of losing
    access to something.
  - The information control is a real focusable `<button>`, not a hover target.
    Hover does not exist on touch, which is where most of this audience is.
- **Offered at onboarding**, alongside the rest of the initial setup, and
  **repeated at the top of Settings → Preferences** so it can be turned on later
  by someone who did not understand the question the first time — or by a
  caregiver setting up on someone's behalf.

## 3. Deferred: the five changes that carry the value

**Not to be started yet.** Recorded so the thinking is not lost.

1. **Icon + colour + text, always together.** A pill that is round, blue and
   labelled "morning" is identifiable three ways. Never rely on text alone for a
   primary action — and never on colour alone either, which fails a different
   group of patients.
2. **Photographs of the actual medication.** The pill identifier and photo
   gallery already exist; reuse them. "Take the white round one" beats "Take
   Metformin 500mg" for a patient who cannot read either.
3. **Time as pictures.** Sun, midday sun, moon for morning/afternoon/night
   instead of "08:00 · 14:00 · 22:00". Clock times impose a literacy and numeracy
   requirement that most schedules do not actually need.
4. **Voice, in both directions.** Read-aloud on every instruction — the browser's
   speech synthesis is free and works offline — and voice input for logging.
   Dictation already exists on the clinician side and in the patient assistant,
   so the components exist.
5. **One question per screen.** Current forms ask for several fields at once.
   Simple mode should ask one thing, large, with a big yes/no or a photo choice.

**Suggested sequencing when it is picked up**, cheapest and highest-impact first:
read-aloud (small, large payoff), then the photo-and-icon medication schedule
(medium), then one-question-per-screen forms (medium), then voice logging
(largest, and dependent on how the assistant is structured).

## 4. Structural rules worth adopting regardless

These apply whether or not simple mode is switched on, and cost nothing if
adopted as a writing habit now:

- Reading level around grade 6 for patient-facing copy.
- No medical jargon without a plain-language gloss on first use.
- Every number paired with a comparison — "120/80 — this is normal for you" —
  rather than left as a bare figure the patient has to interpret.

## 5. Who else this helps

Not a niche mode. Elderly patients; anyone on a small phone; anyone
post-discharge on sedating medication; anyone managing care for someone else;
and anyone in a hurry. The audience for "less on screen" is much wider than the
audience for "I cannot read well", which is precisely why the offer is worded the
way it is.
