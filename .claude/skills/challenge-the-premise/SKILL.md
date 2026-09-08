---
name: challenge-the-premise
description: Run before accepting any design, before reporting work as done, and whenever a change touches permissions, consent, deletion, an actor boundary, or "who is allowed to". Applies the adversarial questions a careful reviewer would ask — where does this promise stop being true, who else can reach this path, what does this quietly assume the user will remember to do — and checks the answers in the code rather than by reasoning. Trigger on finishing a feature, proposing a design, reviewing a diff, or any sentence containing "should be fine", "already handled", "the user will", or "cannot happen".
---

# Challenge the premise

Most real bugs in this project were not found by testing the code. They were
found by somebody asking whether the *premise* was true, and then checking.

Reasoning alone does not do this. Every question below ends in a command.

## The seven questions

### 1. Where does this stop being true?

Every rule has an edge. Name it, then find it.

> "A clinician cannot edit a claimed record." — Is that the live record or a
> staging table? What *can* they write? Check the policies, not the comment.

The comment describing a guarantee and the code providing it are different
artefacts and they drift. When they disagree, the code is what ships.

### 2. Who else can reach this path?

A guard on the button is not a guard. List every caller.

```
grep -rn "from('<table>')" src/ | grep -vE "\.select\("
```

If a hook guards a write and another module writes the same table directly,
the guard is decoration. This is exactly how the assistant came to be able to
stop a hospital-prescribed medication that the medications page refused to
touch.

### 3. Does the UI promise something the database cannot do?

Take the most confident sentence on the screen and find the line that makes it
true. See `empty-promise-audit`. A consent dialog is the highest-stakes place
for this: a person can agree to a capability that does not exist.

### 4. What does this assume a human will remember to do?

Anything relying on people reporting themselves promptly, keeping two things in
sync by hand, or noticing an absence, will be wrong in production.

Ask: what does the record say if they never do it? If the answer is
"something false", the model is wrong, not the user. Self-reported facts need
two timestamps — when it happened, and when we were told.

### 5. Am I solving the stated problem or the one I find easier?

When a request is uncomfortable, the temptation is to build the adjacent thing.
Read the ask again and name the gap out loud.

Also check the reverse: a request that seems to contain a contradiction usually
contains two goals that are both real. Say what they are and reconcile them
explicitly rather than silently picking one.

### 6. If I am reporting this as done — how would I know if it were not?

Never report a green check without knowing the check can fail. See
`verify-before-claiming`. Break the code, watch the right assertion fail,
restore.

### 7. Who is harmed if this is wrong, and can they tell?

Rank by whether the failure is *visible*. A crash gets fixed. A silently empty
list, a toast that says "Saved" over a zero-row update, a permission flag
nothing reads — those persist for months. Prefer loud failure everywhere the
choice exists.

## Two habits that found the most

**When something is questioned, check before defending.** The instinct to
explain why the existing design is fine is the instinct to skip the check. Run
the query first. Several genuine bugs here were found in the ten seconds after
somebody asked "are you sure?".

**Verify your own finding before reporting it.** A first query that seems to
show a serious problem is often matching too narrowly — an operand order, a
name, one of two spellings. Re-run it the other way before saying anything.
Reporting three broken tables when only one is broken costs more trust than
saying nothing.

## What to say

State the concern in one or two sentences with the evidence, give a
recommendation rather than a menu, then continue the work. If the decision goes
the other way, follow it without re-litigating.

Do not soften a real finding into a suggestion. "The dialog offers a capability
that does not exist" is a headline, not a nit.
