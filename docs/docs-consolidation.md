# Docs consolidation — what was done, and what the proposal got wrong

September 2026. 57 files to 47 in `docs/`, with 8 more moved to `archive/` and
7 to `plans/`, so what is left at the top level is current description rather
than a mix of description, history and intention.

## What the first proposal got wrong

It grouped files by their names instead of reading them, and two of its three
merges were wrong as a result.

**"Five language documents become one."** Two of the five —
`surface-language.md` and `panel-language-rollout.md` — are about UI primitives
named `Panel` and `Card`. They have nothing to do with what tongue the product
speaks. They were grouped on the word "language".

**"Three tenancy documents become one."** They are three different things: a
shipped architecture with a phase outstanding, an in-force access rule, and a
public directory that has not been started. Merging them would have buried a
rule that says "read before changing anything about access" inside a plan
nobody has begun.

Both are the same mistake, and it is the one `challenge-the-premise` names:
a premise that sounds right, asserted without checking. The filenames were the
premise.

## What was actually done

**Trackers, three to one.** `roadmap.md` opens with *"do not start new roadmap
or tracking documents"*. `roadmap-logged.md` and `agreed-not-yet-built.md` both
were. Folded into `roadmap.md` as *Agreed, not yet built* and *Deferred, with
what would restart it*, and deleted.

**Language, three to one.** `internationalisation-defaults.md`,
`language-support-plan.md` and `low-literacy-support-plan.md` →
`language-and-locale.md`. These genuinely belong together: translating an
interface written at the wrong reading level produces the same problem in more
languages.

**Surface primitives, two to one.** `surface-language.md` and
`panel-language-rollout.md` → `surface-primitives.md`, with a note at the top
for the next person who files them under "language".

**Eight to `docs/archive/`.** Point-in-time records whose filenames already
carry their date: four reviews, the July platform review, the beta pack and
NDA, and the Medplum adoption assessment. Nothing deleted; they read as history
now rather than as description.

**Seven to `docs/plans/`, each with a status banner.** QHIN (suspended),
caregiver access (paused), WhatsApp (deferred), voice-first (paused),
telehealth and wearables (not started), hospital profiles (not started). Every
banner says what would restart it, so a paused intention cannot be mistaken for
a commitment.

**Links repaired** across eleven files, including four in `src/` that referenced
moved documents from code comments.

## Untouched, deliberately

Sixteen files are imported into the app at build time — ten by `AdminDocs.tsx`,
six by `Guide.tsx`. Moving any of them breaks the build, which is a good reason
to check before proposing a move and the reason this list was checked first.

The handbook guides and the public `docs/guide/` still overlap. The public guide
is the source of truth and has a test; the handbook versions should be cut down
to what is genuinely internal. Not done here — it is editing, not filing.

## Still stale, and worth doing next

- **`sharing-access-consent-model.md`** — predates the proposal mechanism,
  document withdrawal and the share-vocabulary convergence. An out-of-date
  consent document is worse than none. Do this first.
- `agents-and-assistant-actions.md` — predates the provenance guard and the
  stop-versus-edit distinction.
- `handbook/data-model.md` — predates several tables.
- `platform-documentation.md` — overlaps the in-app admin docs and `/guide`;
  check what is unique before deciding.
