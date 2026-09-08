# Consolidating the docs

57 markdown files. Some describe work that shipped a month ago, several
describe the same thing three times, and three of them are trackers for "what
is next" — despite `roadmap.md` saying in its own opening lines *"do not start
new roadmap or tracking documents."*

Proposal: **57 → 31**, by merging clusters and moving finished work into a
dated archive rather than deleting it. Nothing is deleted; point-in-time
documents move to `docs/archive/` where their date is the point.

---

## 1. Three trackers become one

`roadmap.md` (410 lines) states the rule and is the canonical tracker.
`roadmap-logged.md` (154) holds decisions deferred in review.
`agreed-not-yet-built.md` (292) holds decisions taken in the last few days.

The last of those is mine and it broke the stated rule. The other two overlap
in purpose and differ only in when they were written.

**Do:** fold all three into `roadmap.md` under three headings — *In flight*,
*Agreed, not yet built*, *Deferred, with what would restart it*. Delete the two
satellites. Keep the "do not start new tracking documents" line and follow it.

Saves 2 files, and removes the question of which one to update.

## 2. Five language documents become one

`language-support-plan.md`, `low-literacy-support-plan.md`,
`internationalisation-defaults.md`, `panel-language-rollout.md`,
`surface-language.md` — 498 lines across five files, all about how the product
speaks to people.

**Do:** one `docs/language.md` with sections for interface language, reading
level, locale defaults, and the surface-copy vocabulary. Archive the rest.

Saves 4 files.

## 3. Three tenancy documents become one

`enterprise-hospital-tenancy-plan.md`, `hospital-profiles-plan.md`,
`independent-clinicians-and-hospitals.md` — the same subject at three moments,
and the tier distinction settled since (enterprise gets departments; the tier
below gets a lightweight system integrating with an existing EHR).

**Do:** one `docs/tenancy.md`. Archive the rest.

Saves 2 files.

## 4. Guides: one source, three tellings

`docs/guide/*.md` is now the public /guide page, imported at build time.
`handbook/patient-guide.md` and `handbook/clinician-guide.md` cover the same
ground for an internal reader. `video/patient-howto-script.md` and
`video/clinician-howto-script.md` are a third telling for narration.

The public guide is the one that ships and the one a test keeps honest.

**Do:** `docs/guide/` is the source of truth. Cut the handbook guides down to
what is genuinely internal — support escalation, known rough edges, what to
tell somebody who calls — and have them link out for the rest. Leave the video
scripts alone; they are a different medium with a different cadence, and
rewriting them as pointers would destroy them.

Saves 0 files, removes the drift.

## 5. Medplum: decision and implementation

`medplum-adoption-assessment.md` (182) is the decision. `medplum-fhir-adapter.md`
(627) is what was built.

**Do:** keep both, and move the assessment's conclusion into the adapter doc's
opening so a reader hits the "why not Medplum itself" answer without hunting.
Archive the assessment.

Saves 1 file.

## 6. Move finished work to a dated archive

These are records of a moment, not descriptions of the system. They should read
as history, and their filenames already say so.

To `docs/archive/`:

- `reviews/oc-lmc-review-aug-2026.md`
- `reviews/product-and-mobile-audit-aug-2026.md`
- `reviews/security-review-aug-2026.md`
- `reviews/language-literacy-telehealth-hospital-profile.md`
- `strategy/platform-review-jul-2026.md`
- `beta-tester-pack.md`, `beta-nda.md` — the beta ran
- `medplum-adoption-assessment.md`

Saves 0 files, but `docs/` stops mixing "how it works" with "what we found in
August".

## 7. Plans for work that is paused or dropped

Paused by decision, and the documents should say so at the top rather than
reading as active plans:

- `qhin-integration-plan.md` — suspended; OneCare is judged to supersede it
- `caregiver-access-system.md` — family-member targeting paused
- `whatsapp-integration-plan.md` — deferred
- `voice-first-actions-plan.md` — paused
- `telehealth-plan.md`, `wearables-plan.md` — not started

**Do:** a one-line status banner at the top of each — *"Paused, September 2026.
Restart when: …"* — and move them to `docs/plans/`. Do not archive: these are
live intentions, just not current work.

Saves 0 files, prevents the next reader mistaking a paused plan for a
commitment.

## 8. Check for staleness, then keep

Still current, but written before the last few weeks of change and now
describing behaviour that has moved:

- `sharing-access-consent-model.md` — predates the proposal mechanism, document
  withdrawal, and the share-vocabulary convergence. **Needs updating, not
  merging.** This is the one that matters most: it is what somebody reads to
  understand consent, and it is now behind the code.
- `agents-and-assistant-actions.md` — predates the provenance guard and the
  stop/edit distinction.
- `platform-documentation.md` — overlaps the in-app admin docs and /guide;
  check whether anything in it is unique before archiving.
- `handbook/data-model.md` — predates several tables.

**Do:** update these four against the code. Nothing to merge; they are simply
out of date, and an out-of-date consent document is worse than none.

---

## The count

| | Files |
|---|---|
| Now | 57 |
| Merged away | 9 |
| Moved to `archive/` | 8 (still present, out of the way) |
| Moved to `plans/` with a status banner | 6 |
| Updated in place | 4 |
| **Left in `docs/` as current** | **31** |

## Order

1. The three trackers (2 above all — it is actively confusing right now, and it
   is the rule the repo already set for itself)
2. `sharing-access-consent-model.md`, because being wrong about consent is the
   worst kind of stale
3. Language, tenancy
4. The archive and plans moves, which are mechanical
5. The remaining staleness updates
