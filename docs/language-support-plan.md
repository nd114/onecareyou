# Language Support Plan — eleven languages, staged

Status: **plan only. Deliberately not implemented.** A working foundation was
built in August 2026 and then reverted at request, so that this stays a decision
document rather than half-live code sitting in the app. What remains in the
repository is the pre-existing scaffold described below, unchanged.

Target languages: **French, German, Italian, Spanish, Mandarin, Portuguese,
Yoruba, Hausa, Igbo, Russian, Arabic** — plus English.

---

## 1. What "we already have i18n" actually amounts to

`src/lib/i18n.ts` has i18next, react-i18next and the browser language detector
wired, initialised from `main.tsx`, with a **27-key English bundle** and Spanish
and French listed as "coming soon".

**Zero components call `t()`.** (Verified: 0 call sites across 264 `.tsx` files;
two files reference i18n at all, one being the scaffold itself and the other a
changelog entry.) The library is installed and initialised; nothing in the app is
actually translatable.

That distinction matters for estimating. The wiring is roughly **5% of the job**.

## 2. The real size of it

Measured across `src/` in August 2026:

| Category | Approximate count |
| --- | --- |
| Visible text in JSX | ~1,142 |
| `placeholder` / `title` / `label` / `aria-label` props | ~375 |
| Toast and error strings | ~259 |
| **Total, across ~250 files** | **~1,780** |

Extraction is about a week of mechanical work for one person. **Translation and
review is the longer pole**, not the code.

## 3. Staged rollout, highest value first

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

## 4. What the foundation needs when it is built

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

## 5. Two non-negotiables

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

## 6. Open question

**Portuguese: which market?** Brazilian and European Portuguese differ enough to
be noticeable in exactly the words an app uses most — "Salvar" vs "Guardar",
"Configurações" vs "Definições". The draft that was built used Brazilian forms.
If the target is Angola or Mozambique, that is the wrong dialect and should be
decided before translation is commissioned, not after.

## 7. Why this is a plan and not code

Live translation infrastructure with no translations behind it is a liability: it
invites a switcher into the UI that mostly does nothing, it makes every new
component a question ("should this be a key?"), and it adds churn to a codebase
being edited in parallel. The right moment to build it is when the *translation*
work is commissioned and staged — the code is a week, and it should be spent
immediately before the content arrives rather than a year ahead of it.
