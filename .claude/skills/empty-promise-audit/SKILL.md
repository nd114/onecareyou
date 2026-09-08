---
name: empty-promise-audit
description: Use when auditing a feature, reviewing consent or permission flows, investigating whether something "actually works", or before shipping a screen that offers a choice. Finds UI that promises a capability the backend cannot deliver — dead permission flags nothing reads, settings toggles wired to nothing, options that produce identical outcomes, and copy describing behaviour that has no code path. Trigger on "does this actually do anything", "is X wired up", "audit this flow", consent dialogs, permission objects, or plan/tier feature lists.
---

# Empty promise audit

The most expensive bugs in a product are not crashes. They are screens that
tell a person something is true when nothing in the system makes it true.
Nobody files a bug, because from the outside it looks like it worked.

In a consent flow this is not a UX problem. A person agreeing to a capability
that does not exist has been asked for consent to a fiction, and the record of
that consent is evidence of something that never happened.

## The three shapes

**1. A flag nobody reads.** The UI writes `meds_write: true` into a
permissions object. Grep the whole repo for the key. If the only hits are the
write site and a column default, nothing enforces it.

**2. Two options, one outcome.** Two choices produce byte-identical state. The
difference exists only in the label. Diff the actual writes each branch makes,
field by field — not the code that looks different, the rows that result.

**3. Copy with no code path.** "Both you and your provider can update records
going forward" — then check whether any write policy exists for that actor on
that table. If not, the sentence is the whole feature.

## How to run it

For each claim the UI makes, find the line that makes it true.

```
# 1. Every key in the permissions/settings object
grep -rn "<key_name>" src/ supabase/ --include=* | grep -v types

# 2. Can that actor write that table at all?
grep -rn "ON public.<table>" supabase/migrations/*.sql | grep -iE "FOR (INSERT|UPDATE|ALL|DELETE)"

# 3. Does the toggle reach a producer?
#    A notification category with no sender is a switch wired to nothing.
```

Three outcomes, and pick deliberately:

- **Build it** — if the promise is right and the gap is the bug.
- **Withdraw it** — remove the option. A choice that does nothing is worse
  than one fewer choice.
- **Rewrite the copy** — if the real behaviour is fine and only the
  description overreaches.

Never leave it. And when two options collapse into one, say so out loud rather
than quietly keeping both.

## What to check on a permissions object specifically

- Is it **enforcement** or a **record**? Both are legitimate. A consent record
  that describes access accurately is valuable. One that describes access it
  does not grant, in language implying it does, is a liability. Comment which
  it is, at the definition.
- Does every enumerated capability have a matching policy, function or
  producer? List them side by side.
- Does revoking it take effect at the **moment of the act**, or was it
  remembered from page load?

## Report it as what it is

Do not bury this in a list of nits. "The dialog offers a capability that does
not exist" is a headline finding. Say which screen, which words, and what
actually happens instead.
