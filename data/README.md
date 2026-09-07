# Reference data (not shipped)

Files here are **inputs to an import**, not assets. Vite copies `public/` into
the build and nothing else, so nothing in this directory reaches a browser.

That distinction is the whole reason this directory exists. These files used to
sit in `public/data/` — four of them, 67 MB — which meant every visitor to the
marketing site could download the lot and every deploy carried them. They were
removed in September 2026 for that reason, correctly, but removing them also
removed the only copy anyone could import from, and the admin importer takes an
upload rather than a URL. So the file is back, out of the served path.

## `international-drug-names.csv`

207,544 rows from the Mendeley International Drug Database, derived from RxNorm.

| Column | Meaning |
|---|---|
| `DRUGNAME` | The brand or synonym as written somewhere in the world |
| `RXCUI` | RxNorm concept id for the ingredient |
| `STR` | The generic/ingredient name |
| `SAB` / `TTY` / `CODE` | RxNorm source, term type and code |

**It is a brand → generic mapping, not an interaction dataset.** Worth being
plain about, because the name invites the other reading: nothing in it says two
drugs interact. What it does is let "Vymada", "Istin" or "Tritace" resolve to
the ingredient the interaction sources are written in — which is the step that
decides whether an interaction is found at all.

### What reads it

`import-idd-data` (admin-only, takes an upload) writes it into
`public.international_drug_mappings`. `drug-lookup` reads that table in
`getGenericFromDatabase`, on the path that fetches a drug label.

### What does not read it, and should

The interaction check. `referenceInteractionsFor` in
`_shared/medication-knowledge.ts` resolves brands through a 117-entry table
hard-coded in that file — a fraction of what this dataset holds — because it is
an import-free pure function with no database access. So a patient whose list
says "Istin" is matched (it is in the small table) and one whose list says a
brand only this dataset knows is not.

Closing that means either giving the interaction path a database lookup before
it calls the pure matcher, or generating a larger static table from this file at
build time. Logged on the roadmap; not done.
