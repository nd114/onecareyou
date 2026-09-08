# Language, reading level and locale

How the product speaks to people: which tongue, at what reading level, and with
which local conventions for dates, money and units.

Three documents merged, September 2026. They were separate because they were
written separately, not because a reader ever wants one without the others —
translating an interface written at the wrong reading level just produces the
same problem in more languages.

**Status at a glance.** Locale defaults are *in force* and apply to every new
feature. Translation is a *plan only*: a working foundation was built in August
2026 and deliberately reverted, so this stays a decision rather than half-live
code. Simple Mode shipped as a preference and was then withdrawn from the
interface pending a decision on what it should actually be — the five changes
that carry its value are a rebuild of the patient surfaces, which is not work to
start casually.

## Contents

- [Locale defaults — in force](#locale-defaults--in-force)
  - [1. The rule](#1-the-rule)
  - [2. What that means in practice](#2-what-that-means-in-practice)
  - [3. Money, specifically](#3-money-specifically)
  - [4. What is deliberately not done](#4-what-is-deliberately-not-done)
- [Translation — plan only](#translation--plan-only)
  - [1. What "we already have i18n" actually amounts to](#1-what-we-already-have-i18n-actually-amounts-to)
  - [2. The real size of it](#2-the-real-size-of-it)
  - [3. Staged rollout, highest value first](#3-staged-rollout-highest-value-first)
  - [4. What the foundation needs when it is built](#4-what-the-foundation-needs-when-it-is-built)
  - [5. Two non-negotiables](#5-two-non-negotiables)
  - [6. Open question](#6-open-question)
  - [7. Why this is a plan and not code](#7-why-this-is-a-plan-and-not-code)
- [Reading level — partly shipped, depth deferred](#reading-level--partly-shipped-depth-deferred)
  - [1. Why this is a separate problem from translation](#1-why-this-is-a-separate-problem-from-translation)
  - [2. What shipped](#2-what-shipped)
  - [3. Deferred: the five changes that carry the value](#3-deferred-the-five-changes-that-carry-the-value)
  - [4. Structural rules worth adopting regardless](#4-structural-rules-worth-adopting-regardless)
  - [5. Who else this helps](#5-who-else-this-helps)

---

## Locale defaults — in force

**Status:** In force. Applies to every new feature.
**Owner:** Engineering

---

### 1. The rule

OneCare is an international product that started in Nigeria. It is not a
Nigerian product with international ambitions. Those two produce different code,
and the difference shows up in defaults.

**No default may assume a market.** Where a value differs by country, the
platform picks a neutral default and the tenant sets their own.

### 2. What that means in practice

| Concern | Neutral default | Set by |
| --- | --- | --- |
| Currency | `USD` | Practice settings → Billing currency |
| Placeholder names | A mix across origins — Alex Moreau, Dr. Jane Evans, Dr. Priya Nair | — |
| Placeholder city | `City`, not a named one | — |
| Dates | ISO in storage, locale-formatted on screen | The viewer's locale |
| Units | Canonical in storage, converted for display | Existing unit preferences |
| Phone / address | No assumed format | The tenant's country |

Nigeria-specific *content* is different from a Nigeria-specific *default*. A job
listing for a role in Lagos is content and stays. A currency column defaulting to
NGN is a default and does not.

### 3. Money, specifically

Amounts are minor units as integers. **The exponent is not always 2.** JPY and
KRW have no minor unit, so ¥1,000 is stored as `1000`. KWD and TND have three, so
1.500 KWD is `1500`. Code that divides by 100 is correct for most of the world
and wrong for a tenant in Tokyo or Kuwait City.

Ask, do not assume:

- TypeScript: `minorUnitDigits(currency)`, `toMajor()`, `toMinorUnits()` in
  `src/lib/fhir/invoice.ts`. The digits come from `Intl`, so there is no second
  list to drift.
- SQL: `public.currency_minor_units(text)`.

An invoice stores its own currency and keeps it. A practice that changes currency
must not restate the value of bills it already issued.

### 4. What is deliberately not done

**No translation layer yet.** Copy is in English. Adding i18n plumbing before
there is a second language produces a large diff, a build step, and no benefit —
see the translation section below. The rule above is about defaults, which cost
nothing to get right now and are expensive to change once tenants exist.

**No currency conversion.** The platform never converts between currencies. A
practice bills in one currency; a patient with bills from two practices in two
currencies sees two totals, not a combined one. Converting would require a rate
source, a rate date, and a decision about who bears the spread — none of which
exists, and a wrong total is worse than two right ones.

---

## Translation — plan only

Status: **plan only. Deliberately not implemented.** A working foundation was
built in August 2026 and then reverted at request, so that this stays a decision
document rather than half-live code sitting in the app. What remains in the
repository is the pre-existing scaffold described below, unchanged.

Target languages: **French, German, Italian, Spanish, Mandarin, Portuguese,
Yoruba, Hausa, Igbo, Russian, Arabic** — plus English.

---

### 1. What "we already have i18n" actually amounts to

`src/lib/i18n.ts` has i18next, react-i18next and the browser language detector
wired, initialised from `main.tsx`, with a **27-key English bundle** and Spanish
and French listed as "coming soon".

**Zero components call `t()`.** (Verified: 0 call sites across 264 `.tsx` files;
two files reference i18n at all, one being the scaffold itself and the other a
changelog entry.) The library is installed and initialised; nothing in the app is
actually translatable.

That distinction matters for estimating. The wiring is roughly **5% of the job**.

### 2. The real size of it

Measured across `src/` in August 2026:

| Category | Approximate count |
| --- | --- |
| Visible text in JSX | ~1,142 |
| `placeholder` / `title` / `label` / `aria-label` props | ~375 |
| Toast and error strings | ~259 |
| **Total, across ~250 files** | **~1,780** |

Extraction is about a week of mechanical work for one person. **Translation and
review is the longer pole**, not the code.

### 3. Staged rollout, highest value first

Each stage is independently shippable. Do not attempt the whole app at once.

1. **Navigation and common controls** — ~50 keys. Every screen benefits; cheapest
   possible proof the machinery works end to end.
2. **The patient journey** — onboarding, dashboard, medications, vitals, Care
   Circle, the sharing disclosure. ~400 keys. This is the slice that decides
   whether a non-English speaker can actually *use* the product; everything
   before it is decoration.
3. **Clinician surfaces** — ~600 keys, lower urgency. Clinical staff in the
   launch markets generally work in English, and the hospital's own language
   policy usually settles it.
4. **Long tail** — marketing pages, legal, help centre.

### 4. What the foundation needs when it is built

Recorded here because it was built once and the shape held up:

- **A locale registry** carrying, per language: code, native label, text
  direction, and a `draft | released` status. The status field is what keeps
  unfinished work out of a patient's hands.
- **RTL support** for Arabic — `dir` on the document element, and a pass over any
  layout that assumes left-to-right. This is the one language on the list with a
  structural cost rather than a translation cost.
- **Locale-aware formatting** for dates, times and numbers. Medication schedules
  and vitals are full of both; translating the labels and leaving `08:00` and
  `120/80` formatted for English is a half-finished job.
- **A switcher** that persists the choice to the profile, not just to the browser,
  so a patient changing device does not land back in English.

### 5. Two non-negotiables

**Clinical and consent copy needs a human medical translator.** Navigation and
buttons can be machine-translated and reviewed. Medication instructions, the
sharing disclosure, clinical guidance text and legal copy cannot: a mistranslated
instruction is a safety incident, and a mistranslated consent notice is a legal
one. Budget for professional review of that slice specifically, and treat it as a
release gate rather than a follow-up.

**The Nigerian languages need native review before release.** Yoruba, Hausa and
Igbo are lower-resource languages, and machine output in them is materially worse
than in French or Spanish. Ship them as `draft`, hide drafts from the switcher in
production builds, and flip a locale to `released` only once a native speaker has
been through it.

### 6. Open question

**Portuguese: which market?** Brazilian and European Portuguese differ enough to
be noticeable in exactly the words an app uses most — "Salvar" vs "Guardar",
"Configurações" vs "Definições". The draft that was built used Brazilian forms.
If the target is Angola or Mozambique, that is the wrong dialect and should be
decided before translation is commissioned, not after.

### 7. Why this is a plan and not code

Live translation infrastructure with no translations behind it is a liability: it
invites a switcher into the UI that mostly does nothing, it makes every new
component a question ("should this be a key?"), and it adds churn to a codebase
being edited in parallel. The right moment to build it is when the *translation*
work is commissioned and staged — the code is a week, and it should be spent
immediately before the content arrives rather than a year ahead of it.

---

## Reading level — partly shipped, depth deferred

Status: **partly shipped.** The preference itself is built and live (August
2026). The five changes in §3 are **deliberately deferred for review later** —
they are a rebuild of the patient surfaces, and that is not work to start
casually.

---

### 1. Why this is a separate problem from translation

Solving language does not solve literacy. A patient may read no language
fluently, or may read their own language perfectly well but not the register a
medical app defaults to — dosage tables, clinical nouns, dense forms.

The design goal is that **the app works without reading**. That is a different
target from "the app is available in Yoruba", and the two are worth funding
separately.

### 2. What shipped

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

### 3. Deferred: the five changes that carry the value

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

### 4. Structural rules worth adopting regardless

These apply whether or not simple mode is switched on, and cost nothing if
adopted as a writing habit now:

- Reading level around grade 6 for patient-facing copy.
- No medical jargon without a plain-language gloss on first use.
- Every number paired with a comparison — "120/80 — this is normal for you" —
  rather than left as a bare figure the patient has to interpret.

### 5. Who else this helps

Not a niche mode. Elderly patients; anyone on a small phone; anyone
post-discharge on sedating medication; anyone managing care for someone else;
and anyone in a hurry. The audience for "less on screen" is much wider than the
audience for "I cannot read well", which is precisely why the offer is worded the
way it is.
