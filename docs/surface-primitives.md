# Surface primitives: Panel and Card

The component vocabulary the interface is built from, and the plan for moving
the rest of the app onto it.

Two documents merged, September 2026. Note for anyone who filed these under
"language": this is about named UI primitives, not about what tongue the
product speaks. That lives in `docs/language-and-locale.md`.

---

## What Panel and Card are

The signed-out consent demo reads better than most of the signed-in app, and
the reason is structural rather than decorative. This note pins down what the
difference actually is, so the rest of the app can be moved across
deliberately instead of by taste.

### The problem it fixes

Most signed-in screens were built as *a card per fact*. Five doses became five
bordered boxes with `space-y-3` between them, inside a sixth bordered box. The
clinician queue did the same, and so did the patient list.

Giving every fact its own border makes every fact structurally equal to every
other, and equal to the container holding them. Nothing reads as belonging to
anything, so the page reads as a grid of boxes — which is the "rigid" feeling.

The consent demo groups instead: **one container, hairline-separated rows**.
The border is spent once, on the thing that is actually one thing.

### The two primitives

#### `Panel` — a group of comparable facts

```tsx
<Panel>
  <PanelHeader eyebrow="Today's regimen" description="2 of 4 doses taken">
    <Button variant="outline" size="sm">View all</Button>
  </PanelHeader>
  <PanelRows>
    <PanelRow glyph={…} label="Metformin" detail="500 mg" trailing={…} />
  </PanelRows>
</Panel>
```

- `PanelHeader` takes an `eyebrow` (small, tracked, uppercase — a label, not a
  title), an optional `description`, `children` for actions on the right, and
  `below` for full-width content under the eyebrow row (filters, share pills).
- `PanelRows` is the hairline divider. It is the whole point.
- `PanelRow` slots: `glyph`, `overline` (metadata above the label), `label`,
  `detail`, `trailing`, plus `children` for anything below the detail.
- `PanelEmpty` for the empty case — a panel with nothing in it should still say
  what would be there, in the panel's voice.
- `PanelBody` for content that is not a list.

#### `Card` — one standalone object

A single stat, a form, a dialog body, a piece of prose. If it is not a member
of a set, it is a Card.

### Operable rows

`onSelect` makes the row body a real `<button>` — full width, focusable, with a
visible inset ring. Use it for rows that open something. Do **not** hand-roll a
`<button>` wrapper: keyboard users then get a target that does not match the
hover target.

`interactive` gives only the hover wash, for rows whose control lives in
`trailing` (a "Mark taken" button, a menu). The row itself is not operable.

With `onSelect` the padding sits on the button rather than the `li`, so
`className` cannot reach it. Pass `bodyClassName`.

### `TogglePill`

The control from the consent demo. A switch says "a setting changed"; a pill
says "this person can see this", because the name lives inside the filled
state. Use it wherever the thing being toggled has an identity — a clinician on
a share, a department on a rota, a filter that is really a person. It is a real
button with `aria-pressed`, so it announces its state.

For a plain boolean setting with no identity, `Switch` is still correct.

### The base Card was softened too

`Card` now uses a wider radius, a hairline tinted in the brand rather than a
neutral grey, and a long low shadow instead of a tight dark one. This reaches
every page that already uses `Card` without touching it, so panels and cards
sit together on the same page without looking like two design systems.

Caller classes still win — `cn` puts them last — so a card that deliberately
sets `border-0`, its own radius, or a gradient background is unaffected.

### Converted so far

| Surface | Side | What changed |
| --- | --- | --- |
| `ConsentDemo` | signed out | Now *uses* the primitives rather than defining a private copy |
| `Dashboard` — today's regimen | patient | Five bordered boxes → one panel, five rows |
| `Dashboard` — quick tools | patient | Padded link list → panel rows |
| `ClinicianToday` — queue | clinician | Card + `divide-y` → panel, with priority carried by the glyph |
| `ClinicianToday` — my tasks | clinician | Same |
| `ClinicianPatients` — list | clinician | Bordered `divide-y` → panel rows |
| `CareCircle` — shares, past connections | patient | The consent demo, in-app. Five inline actions per row collapsed to one plus a menu |
| everything using `Card` | both | Softened border, radius and shadow |

### Not yet converted, and why

- **Health Vault** delegates each document to `DocumentCard`, which carries its
  own actions and menu. It benefits from the softened `Card` already; moving it
  to rows is a real change to that component, not a swap.
- **Settings, compliance and policy pages** are prose in cards. Cards are right
  there.
- **Stat tiles** (`gradient-stats-*`) are standalone objects, not a set of
  comparable facts. They stay cards.

### Rule of thumb

> If you are about to write `space-y-3` around a list of bordered divs, you
> want a `Panel` with `PanelRows`.

---

## Rolling it through the rest of the app

Status: **a plan, not a commitment.** Nothing here is scheduled. It exists so
the decision can be made on real numbers instead of on how the screens feel on
any given day.

For what the language *is* and when a surface should be a `Panel` rather than a
`Card`, see [surface-language.md](./surface-language.md). This document is only
about how much is left and in what order it would be worth doing.

### What the survey found

Two searches over `src/pages` and `src/components`:

| Signal | Files | What it means |
| --- | --- | --- |
| `space-y-*` wrapping `rounded-* border` children | **68** | The rigidity signature: a bordered box per fact |
| `divide-y` already present | 15 | Already grouping; mostly a restyle, not a restructure |

68 is the outer bound, not the target. A good number of those are prose pages
where a card is the right answer and always was.

### The criterion

Convert a surface when its content is **a set of comparable facts**. Leave it
alone when the content is **one standalone object**.

That is the whole rule. It is not "panels are newer" — a policy page rendered
as hairline rows would read worse, not better.

### Ordering

Ranked by how often a real person looks at the screen, not by how easy it is.

#### Tier 1 — daily surfaces, both sides

These are the screens someone opens every day. The inconsistency is most
visible here because these sit next to the four already converted.

| Surface | Side | Shape |
| --- | --- | --- |
| `Schedule.tsx` | patient | Dose list — the same shape as the regimen panel already built |
| `Medications.tsx` | patient | Medication list with per-item actions |
| `Vitals.tsx` | patient | Readings per type; the charts stay cards, the reading lists become rows |
| `ClinicianPatientDetail.tsx` | clinician | 11 cards, the densest surface in the app. Tabs of comparable facts throughout |
| `ClinicianGuidance.tsx` | clinician | Guidance list |
| `ClinicianAlerts.tsx` | clinician | Alert list — priority belongs in the glyph, as in the queue |

`CareCircle` is **done** — it was the one worth doing first, being the feature
the homepage argues for. Converting it turned up something the borders were
hiding: each row carried five inline action buttons, which does not fit a
phone and put the destructive one in the same visual weight as "copy link".
They are now one visible action and a menu. Expect similar findings elsewhere;
the conversion is a reason to look at a surface, not only to restyle it.

#### Tier 2 — regular but not daily

`Messages.tsx`, `ClinicianMessages.tsx`, `HealthVault.tsx`,
`ClinicianTemplates.tsx`, `ClinicianDictations.tsx`, `AdherenceReport.tsx`,
`FamilyDashboard.tsx`, `FamilyMemberDetail.tsx`.

`HealthVault` is the awkward one: each document goes through `DocumentCard`,
which carries its own menu and actions. Moving it to rows means changing that
component, not swapping a wrapper. Worth doing, but it is a real change with
its own review.

#### Tier 3 — admin and practice management

`PracticeAdmin.tsx`, `AdminConsole.tsx`, `AdminTenantDetail.tsx`,
`ClinicianPractice.tsx`, `ClinicianAudit.tsx`, `ClinicianCompliance.tsx`.

Lower traffic, but these are the screens shown in a procurement demo, so they
are worth more than their usage suggests.

#### Do not convert

- **Policy and prose** — `PrivacyPolicy`, `TermsOfService`, `DataProcessing`,
  `MedicalDisclaimer`, `KnowledgeBaseTopic`. Cards are correct for prose.
- **Pricing tables** — `Pricing`, `ClinicianPricing`. A plan is a standalone
  object being compared with other standalone objects.
- **Stat tiles** — anything on `gradient-stats-*`. Same reason.
- **Forms and dialogs** — a form is one object. `Contact` uses a panel only
  because the panel *is* the form's frame, not because the fields are rows.

### What each conversion actually involves

From the four already done, the shape of the work is predictable:

1. Replace the `Card`/`CardHeader`/`CardContent` wrapper with
   `Panel`/`PanelHeader`, moving the title into `eyebrow` and the subtitle into
   `description`.
2. Replace the `space-y-*` list with `PanelRows` and one `PanelRow` per item.
3. Move the item's structure into the slots: `glyph`, `overline`, `label`,
   `detail`, `trailing`. Anything that does not fit goes in `children`.
4. Rows that open something take `onSelect` — do **not** hand-roll a button
   wrapper, or the keyboard target stops matching the hover target.
5. Give the empty state a `PanelEmpty` rather than letting the panel collapse.

Roughly 30–60 minutes per surface, less for the ones that already have
`divide-y`.

### Verification, which is the actual constraint

These surfaces are behind auth, so they cannot be screenshotted by visiting a
URL. What worked for the four already done:

1. Add a temporary route rendering the converted markup with representative
   sample data.
2. `npm run build`, then `vite preview --host 127.0.0.1` — it fails on IPv6
   without the explicit host.
3. Screenshot at 1440 and 390 with the Chromium at
   `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, asserting
   `document.documentElement.scrollWidth <= window.innerWidth`.
4. Delete the temporary route before committing.

The overflow assertion is not optional — it is what caught the 9px overflow on
`/features` that had been shipping for some time.

### Known gaps in the primitives

Found while converting the first four. None are blocking, all would save time
if fixed before a larger pass:

- `PanelRow` with `onSelect` puts its padding on the button, so `className`
  cannot reach it. `bodyClassName` exists for this but is easy to miss.
- `HairlineGrid` children must be keyed fragments; a bare `<>` triggers a React
  key warning that only shows at runtime.
- There is no `PanelFooter`. Surfaces needing one currently use `PanelBody`
  with a manual `border-t`, which is repeated in three places already.
- No skeleton/loading row. Every converted surface has hand-rolled a spinner
  inside `PanelEmpty`.

### The honest argument against doing all of it

The base `Card` was already softened, so every unconverted surface got the
wider radius, the brand-tinted hairline and the long shadow without being
touched. The remaining gain is structural grouping, which is real but smaller
than the first change was. Tier 1 is clearly worth it. Tiers 2 and 3 are worth
doing when those files are being edited for another reason, rather than as a
campaign of their own.
