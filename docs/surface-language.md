# Surface language: Panel, Card, and when to use which

The signed-out consent demo reads better than most of the signed-in app, and
the reason is structural rather than decorative. This note pins down what the
difference actually is, so the rest of the app can be moved across
deliberately instead of by taste.

## The problem it fixes

Most signed-in screens were built as *a card per fact*. Five doses became five
bordered boxes with `space-y-3` between them, inside a sixth bordered box. The
clinician queue did the same, and so did the patient list.

Giving every fact its own border makes every fact structurally equal to every
other, and equal to the container holding them. Nothing reads as belonging to
anything, so the page reads as a grid of boxes — which is the "rigid" feeling.

The consent demo groups instead: **one container, hairline-separated rows**.
The border is spent once, on the thing that is actually one thing.

## The two primitives

### `Panel` — a group of comparable facts

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

### `Card` — one standalone object

A single stat, a form, a dialog body, a piece of prose. If it is not a member
of a set, it is a Card.

## Operable rows

`onSelect` makes the row body a real `<button>` — full width, focusable, with a
visible inset ring. Use it for rows that open something. Do **not** hand-roll a
`<button>` wrapper: keyboard users then get a target that does not match the
hover target.

`interactive` gives only the hover wash, for rows whose control lives in
`trailing` (a "Mark taken" button, a menu). The row itself is not operable.

With `onSelect` the padding sits on the button rather than the `li`, so
`className` cannot reach it. Pass `bodyClassName`.

## `TogglePill`

The control from the consent demo. A switch says "a setting changed"; a pill
says "this person can see this", because the name lives inside the filled
state. Use it wherever the thing being toggled has an identity — a clinician on
a share, a department on a rota, a filter that is really a person. It is a real
button with `aria-pressed`, so it announces its state.

For a plain boolean setting with no identity, `Switch` is still correct.

## The base Card was softened too

`Card` now uses a wider radius, a hairline tinted in the brand rather than a
neutral grey, and a long low shadow instead of a tight dark one. This reaches
every page that already uses `Card` without touching it, so panels and cards
sit together on the same page without looking like two design systems.

Caller classes still win — `cn` puts them last — so a card that deliberately
sets `border-0`, its own radius, or a gradient background is unaffected.

## Converted so far

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

## Not yet converted, and why

- **Health Vault** delegates each document to `DocumentCard`, which carries its
  own actions and menu. It benefits from the softened `Card` already; moving it
  to rows is a real change to that component, not a swap.
- **Settings, compliance and policy pages** are prose in cards. Cards are right
  there.
- **Stat tiles** (`gradient-stats-*`) are standalone objects, not a set of
  comparable facts. They stay cards.

## Rule of thumb

> If you are about to write `space-y-3` around a list of bordered divs, you
> want a `Panel` with `PanelRows`.
