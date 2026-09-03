# Navigation, and where the assistant lives

Two changes that turned out to be the same change: the assistant was being
treated as a section of the app, and the tablet was being treated as a large
phone. Both were the information architecture disagreeing with how people
actually use the product.

## The assistant is not a pillar

It used to be. `PATIENT_PILLARS` had an "AI" entry whose tabs were
*Conversations* and *Knowledge Base*, and that arrangement caused three
problems:

**The library was filed under AI.** The Knowledge Base is reference reading —
conditions, medicines, questions worth asking your doctor. None of it is
generated and none of it involves the assistant. Putting it under "AI" taught
people that AI is where the reading material lives.

**The assistant looked like a place you go.** A pillar in the primary
navigation says "this is a section". But the assistant is meant to be beside
whatever you are doing, and it already was — `AIChatFAB` floats on patient
screens. The pillar competed with the thing it duplicated.

**`/ai` contradicted its own comment.** The source said the pillar was "where
you read back what you asked it", while the page rendered a full chat panel.

Now:

- `learn` replaces `ai` as the fourth pillar, landing on `/knowledge-base`.
- The assistant has no pillar. It is the drawer, on every signed-in patient
  screen.
- `/ai` still resolves — deep links keep working — and reads as what it is: the
  record of what you asked. Settings already carried the same archive.

## The assistant knows where it was opened from

It used to open on the same three starters everywhere: *What is HbA1c?*, *How
do I add a vital?*, *What is blood pressure?* — including on the bills page.
That is the whole of the "feels rigid" complaint: the screen knows what you are
doing and the assistant does not, so you have to brief it before it is useful.

`src/lib/assistant-context.ts` maps the route to a short description of where
you are and three questions worth asking there. On Care Circle it offers "Who
can see my record right now?"; on Bills, "What is this charge for?".

It is a lookup, not a generator. The starters are the product's voice, and a
generated set would drift.

## The assistant is available by default

`PatientAIChatMount` used an **allowlist** of routes. Every new patient screen
silently lost the assistant until somebody remembered to add it, and `/billing`
had already fallen off — the assistant was simply absent from the bills page.

It is a denylist now: available on every signed-in patient screen except
clinician and admin surfaces, single-purpose flows (onboarding, install) and
auth screens. A new screen gets it without anyone remembering.

## The tablet had no primary navigation

The two navigation surfaces did not meet:

| Surface | Class | Visible |
| --- | --- | --- |
| `MobileBottomNav` | `md:hidden` | 0–767 |
| `Header` primary nav | `hidden lg:flex` | 1024+ |

Everything from **768 to 1023** — which is every tablet in portrait, including
iPad at 834 — fell back to a hamburger, despite having more horizontal room
than a phone and often more than a small laptop window. Confirmed by
screenshot before the fix: at 834 the header showed a logo and a hamburger and
nothing else.

The header nav now starts at `md`, so the two meet exactly:

| Width | Primary navigation | Account actions |
| --- | --- | --- |
| 0–767 | Bottom tab bar | Hamburger |
| 768–1023 | Header nav | Hamburger |
| 1024+ | Header nav | Full cluster |

Verified at 390, 768, 834, 1024 and 1440, with no horizontal overflow at any
of them. 768 is the tight case and all five marketing links fit with room to
spare.

## Still open

- **Voice mode** has reported issues that have not been diagnosed here.
- The hamburger menu still lists the pillars at `md`–`lg`, where the header is
  already showing them. Harmless duplication inside a menu you opened
  deliberately, but it could be trimmed to account actions only.
- The drawer is a modal `Sheet`. A non-modal side panel — the ElevenLabs and
  GitHub Copilot pattern, where you keep working with the assistant open — is a
  larger layout change and is not attempted here.
