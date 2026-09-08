# Skills

Reusable working rules, earned from real bugs in this codebase rather than
written from first principles. Each one names the failure that produced it, so
a reader can judge whether it still applies.

| Skill | Use it when | Came from |
|---|---|---|
| `onecare-map` | First, in any session touching this repo | Sessions spending their budget rediscovering the layout |
| `challenge-the-premise` | Before accepting a design, and before reporting work done | Nearly every real bug here was found by questioning a premise and then checking it |
| `verify-before-claiming` | Before reporting any check passed, and when writing any test | A typecheck command that checked nothing, and three tests that passed for the wrong reason |
| `empty-promise-audit` | Auditing a feature, reviewing a consent or permission flow | A consent dialog offering write access the database had no policy for |
| `supabase-guardrails` | Writing or reviewing migrations, RLS, or PostgREST writes | Policies that are OR'd, zero-row updates that report success, default grants applied at CREATE TABLE |
| `onecare-conventions` | Anywhere in this repo | The eight rules the product's decisions actually follow |

They are cheap to read and cheaper than the bugs. Add to them the same way:
when something breaks in a way that produced no error, write down the shape of
it.
