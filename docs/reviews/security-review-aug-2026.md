# Security review and red-team pass — August 2026

Adversarial review of the whole platform: "what could someone actually do to
this, from an ordinary account or from outside".

**Method.** The migration history was replayed into a local Postgres and each
finding was exploited as a real caller — `SET ROLE authenticated` with a JWT
claim, the same path PostgREST takes — rather than being inferred from reading
policies. Everything marked *Confirmed* below was executed successfully against
a live database before it was fixed, and re-run after to prove the fix. The
front end, the 37 edge functions, storage policies and the secret surface were
reviewed by inspection.

**A correction to the harness, which changed a conclusion.** The first version of
the local shim did not reproduce Supabase's bootstrap line

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
```

so every table appeared to have no grants at all, and this review originally
recorded "`anon` has almost no table access" as a thing that held up. That was an
artifact of the harness, not a property of the platform. With the default
privileges modelled, `anon` held **482 grants across 69 tables**. The shim now
includes them, and the corrected finding is F7 below. Two independent checks
agree: the repo contains migrations that *revoke* privileges from `anon` which no
migration ever granted (`practices_safe`, `international_drug_mappings`), which
only makes sense if the defaults were in play.

**Result: seven issues found and fixed, three of them serious.** Fourteen
regression assertions are committed as
`supabase/tests/privilege_escalation.test.sql`.

---

## 1. What held up

Worth stating, because it is the reason the damage was bounded:

- **Every public table has RLS enabled.** No table was found unprotected. This
  matters more than it first appears — see F7; RLS was carrying the whole load.
- **Every `SECURITY DEFINER` function pins `search_path`.** This is the classic
  Postgres privilege-escalation vector and the codebase gets it right
  everywhere — 60+ functions, no exceptions.
- **RLS genuinely holds against anonymous callers.** Verified directly: an `anon`
  session reads zero rows from `profiles` and `vitals`, because the policies key
  on `auth.uid()` and it is null. The policies do the job they were written for.
- **Both public views set `security_invoker = on`.** `clinician_profiles_public`
  and `patient_basic_info` therefore run under the caller's RLS rather than the
  view owner's. A view missing that option is a silent RLS bypass; neither is.
- **`user_roles` cannot be self-granted.** Platform admin is manageable only by
  an existing admin, so there is no path from a normal account to platform admin.
- **Storage is folder-scoped by user id** on every bucket, and
  `health-documents` is private with short-lived signed URLs.
- **No secrets in the repo.** `.env` holds only the publishable client values.
  The service-role key appears nowhere in `src/`.
- **No XSS surface.** One `dangerouslySetInnerHTML`, in shadcn's chart component
  rendering its own theme CSS. No `eval`, no `new Function`.
- **No SSRF.** External calls use hardcoded hosts with encoded parameters.

---

## 2. Findings

### F1 — Any patient could give themselves the paid plan · **High** · Confirmed · Fixed

`profiles` has `USING (auth.uid() = user_id)` for UPDATE, and RLS is row-level,
so the account holder could write **any** column of their own row — including
`subscription_tier`.

```js
await supabase.from('profiles').update({ subscription_tier: 'premium' })
  .eq('user_id', myId)   // free premium, no Stripe involved
```

Not just revenue: feature gates and storage allowances read that column, and the
hospital revenue-share summary counts patients whose tier is not `free` — so a
handful of self-upgrades would also inflate what a hospital appears to be owed.

### F2 — Any hospital admin could rewrite their own contract · **High** · Confirmed · Fixed

Same shape on `practices`, where a tenant owner/admin legitimately updates their
hospital. That row also holds `revenue_share_pct`, `storage_limit_gb`,
`patient_limit`, `member_limit` and the subscription fields.

```js
await supabase.from('practices')
  .update({ revenue_share_pct: 100, storage_limit_gb: 999999 })
  .eq('id', myHospitalId)
```

A hospital admin manages their hospital. They should not be able to set what the
hospital is owed or how much of the platform it may consume.

### F3 — Any clinician could rewrite the consent a patient gave them · **High** · Confirmed · Fixed

The most serious of the three, because it contradicts the product's first
principle rather than costing money.

"Clinicians can update their patient shares" exists so a clinician can write
`clinician_notes` and `last_accessed_at` onto the share row. Row-level again, so
it also handed them `is_active` and `permissions`:

```js
await supabase.from('provider_shares')
  .update({ is_active: true,                    // undo the patient's revocation
            permissions: { vitals: true, meds: true,
                           adherence: true, profile: true } })  // widen their own access
  .eq('id', shareId)
```

A doctor a patient had cut off could restore their own access, silently, and
grant themselves categories the patient never shared. This is the private-pathway
twin of the hospital-admin defect fixed in the first review — the same mistake in
the other half of the sharing model.

**Fix for F1–F3.** Postgres has no column-level RLS, and column `GRANT`s fail
every time a column is added, so each is a `BEFORE UPDATE` trigger pinning the
protected columns to their previous values unless the writer is entitled to them:
the patient for their own consent, a platform admin or a server-side caller
(`auth.uid()` null — Stripe webhooks, cron, admin tooling) for commercial fields.
Each legitimate write the policies exist for is asserted still working.

### F4 — `drug-lookup` was completely unauthenticated · **Medium** · Fixed

It validated its input carefully with zod and then made outbound calls to RxNorm,
openFDA and EMA — with no caller check at all, and CORS `*`. Anyone on the
internet could use the project as a free proxy to those APIs: our invocations,
our egress bill, our IP getting rate-limited by the upstreams.

`docs/handbook/data-model.md` already listed drug lookup under `requireUser`. The
documentation was right and the code did not match it.

### F5 — Secrets compared with `===` · **Medium** · Fixed

Four places compared a secret or signature with `===`, which returns early on the
first differing byte and so leaks both length and matching prefix through
response timing:

| Where | What was compared |
| --- | --- |
| `_shared/auth.ts` | the service-role key |
| `_shared/auth.ts` | the cron secret |
| `scheduled-ehr-sync` | the bearer token |
| `ehr-webhook` | **the HMAC signature** |

The webhook is the one that matters. It is a public endpoint that accepts
unlimited attempts — exactly the condition a timing attack needs — and forging
that signature means writing arbitrary clinical data into patient records. All
four now use a constant-time comparison that reveals nothing through length.

### F6 — KingsChat sign-in has no CSRF protection · **Medium (latent)** · Flagged

The new `kingschat-callback` does the right things with the token — never logs
it, never returns it, does not store the code. But:

- there is **no `state` parameter and no PKCE**, so nothing binds the callback to
  the browser session that started the flow;
- the endpoint is unauthenticated with CORS `*`, so anyone can post codes to it;
- the function currently stops after the exchange — account linking is a
  "follow-up step".

**Today the impact is limited** precisely because it does not link accounts yet.
**That is also why this must be settled before the next step is built:** the
moment the exchanged identity is attached to a OneCare account, an attacker who
can feed a code to the callback can attach their KingsChat identity to a victim's
account, or a victim's to theirs. Classic OAuth account-takeover.

Not fixed here because the fix belongs with the linking design, not bolted onto
a stub. **Requirements when it is built:** generate `state` server-side, store it
against the session, reject any callback whose `state` does not match and has not
been consumed; add PKCE if KingsChat supports it; restrict CORS to our own
origins; and never trust the `origin` field in the request body.

### F7 — `anon` held every privilege on every table · **Medium** · Confirmed · Fixed

Supabase's bootstrap grants the anonymous role `SELECT, INSERT, UPDATE, DELETE`
on everything created in `public`. Measured on a replay of this history:
**482 grants across 69 tables**, including `profiles`, `vitals`, `medications`
and `provider_shares`. The row policies were the *only* boundary between the open
internet and the data.

They held — anon reads nothing, as verified above. But it means **one malformed
policy exposes an entire table with nothing behind it**, and that is not
hypothetical here. `job_applications` shipped with:

```sql
CREATE POLICY "Applicants can view their own applications"
  ON public.job_applications FOR SELECT USING (true);
```

No `TO` clause, so it covered `anon`, and `true` for every row: every applicant's
name, email and phone was readable by anyone on the internet until it was
narrowed in `20260127152048`. With the grant absent, the same slip would have
been contained.

**Fix.** `20260817110000` revokes `anon` from every relation in `public` — views
included — sets the default privileges so tables added later inherit nothing, and
then re-grants exactly the four anonymous surfaces the product actually has,
checked against every unguarded route in `App.tsx`:

| Surface | Grant | Why |
| --- | --- | --- |
| `job_postings` | SELECT | the public careers board |
| `job_applications` | INSERT | applying without an account |
| `beta_events` | INSERT | anonymous beta telemetry |
| `enterprise_inquiries` | INSERT | the deliberate "anonymous visitors" policy |

Anonymous reads for the branded hospital pages go through
`public_institution_by_slug()`, a `SECURITY DEFINER` function, so tenant sign-up
does not depend on table grants and is unaffected.

`authenticated` deliberately keeps its defaults: the whole application runs as
that role, and RLS is what scopes it.

**Related, and already right:** `20260522202547` uses a column-level
`REVOKE SELECT (tax_id, npi, stripe_*, subscription_*) ON practices FROM
authenticated`. That is the read-side counterpart to the write-side guards in
F1–F3 — worth knowing it exists, and worth knowing its limits: it covers
`authenticated` only, and a column added later is exposed again by default.

---

## 3. Accepted, or needing a decision

- **No application rate limiting anywhere.** The only 429 handling is for
  responses *from* the AI gateway. There are **three** unauthenticated write
  surfaces — `job_applications` (plus a resume upload into storage),
  `beta_events`, and `enterprise_inquiries` — and the auth endpoints rely on
  Supabase's own limits. This is now the most exposed thing left on the platform:
  the writes are individually harmless and collectively a free spam and storage
  bill. Recommend edge rate limits on all three and on sign-in.
- **Audit rows are client-written.** `hipaa_audit_logs` INSERT is
  `auth.uid() = user_id`, so the log records what the client chose to report. A
  determined user can omit their own entries. This is now the third review to
  raise it, and it matters more since visibility was deliberately left broad —
  the audit log is the compensating control for that decision.
- **Tenant enumeration.** `public_institution_by_slug` is anonymous by design
  (it powers the branded sign-up page), and hospital codes are now 3–7
  characters, so the whole client list can be enumerated. Not PHI, but
  commercially sensitive. Largely moot if the hospital directory ships, since
  that publishes the same information deliberately — worth deciding rather than
  leaving as an accident.
- **The anon INSERT policy on `enterprise_inquiries` is live, not dead.** An
  earlier draft of this review called it harmless on the grounds that `anon` had
  no INSERT grant; that was the same harness error as F7, and the insert was
  confirmed to succeed. No unguarded page writes it — the form sits behind
  `ClinicianRoute` — so it is reachable through the API and nothing else. The
  grant was kept in the F7 fix because the policy was written deliberately
  ("Anonymous visitors can submit inquiries") and a public form is presumably
  intended. **Decide:** build the public form, or drop the policy and the grant.
  Leaving an anonymous write nobody uses is the worst of the three.
- **Prompt injection.** Document text and patient-entered content are fed to the
  model. Read scope is already limited to records the caller can access, so the
  blast radius is the caller's own data, but a malicious document could still
  steer a summary. Worth a guard when documents can come from a hospital's EHR.
- **Password policy** is 8 characters with no complexity or breach check
  (Supabase-side setting). Reasonable to raise before enterprise review.

---

## 4. Two patterns worth internalising

**A row policy written for one column silently grants every column.** The three
serious findings are all this. "Users can update their own profile" was written
for names and phone numbers and also gave away billing. "Clinicians can update
their patient shares" was written for notes and also gave away consent. Nobody
wrote a bad policy; each policy did exactly what its author intended, plus
everything else on the row.

> Before adding an UPDATE policy, ask which columns on that table would be
> dangerous in the hands of the person the policy is for — and pin them. Anything
> representing money, entitlement, consent or role belongs in that category.

**RLS was the only layer, and a single policy typo therefore reached the open
internet.** That is what F7 was about, and it is the more general lesson: the
platform's defences were one deep everywhere. The `job_applications` policy shows
the failure mode exactly — one missing `TO` clause, one `USING (true)`, and
applicant records were world-readable. Depth is what turns that from a breach
into a bug.

> A control that is doing all the work on its own is worth noticing *before* it
> fails, not after. Ask what the second layer is, and if the honest answer is
> "there isn't one", that is the finding.

**And one about method.** The most misleading moment in this review was not a
missed vulnerability — it was a *reassuring* result produced by a harness that
did not model production. It went into the first draft as something that "held
up". Where a test environment is hand-built, the parts of production it does not
reproduce are exactly where false comfort comes from, so a clean result deserves
the same suspicion as a dirty one until the harness itself is checked.
