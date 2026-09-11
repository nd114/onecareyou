# IT Service Continuity & Disaster Recovery — OneCare

Status: **structure complete; the parts that were writeable without production
access are now written.** The sections are the ones an auditor or an
enterprise customer's risk team will ask for. What is left marked **TBD** is
left that way because the answer is a business decision nobody has made yet,
or a step that needs credentials this document's author does not hold — not
because it was skipped.

Owner: TBD · Last reviewed: 2026-09-11 · Review cadence: **quarterly, and after
any change to a Tier 1 dependency**

---

## 1. Scope

This covers the OneCare platform: the web application, its database, its
server-side functions, and the third-party services it cannot run without. It
does **not** cover corporate IT, staff devices, or the customer's own systems.

## 2. Service criticality tiers

Tiering is by *what breaks for a patient or clinician*, not by how much
engineering the component took.

| Tier | Meaning | Components |
| --- | --- | --- |
| **1 — Critical** | Care could be affected. Someone cannot see a record, take a dose, or reach their clinician. | Database, authentication, the web app itself, messaging |
| **2 — Important** | The product works but a promise is broken. | AI assistant, document storage, notifications, billing |
| **3 — Deferrable** | Nobody notices for a day. | Marketing site, analytics, bug-report sync, careers pages |

## 3. Recovery objectives

| Tier | RTO (time to restore) | RPO (acceptable data loss) | Status |
| --- | --- | --- | --- |
| 1 | **TBD** — proposed 4 hours | **TBD** — proposed 15 minutes | Not agreed |
| 2 | **TBD** — proposed 24 hours | **TBD** — proposed 1 hour | Not agreed |
| 3 | Best effort | 24 hours | — |

> **These are proposals, not commitments.** An RPO is a promise about how much
> data you are willing to lose, and for a health record that is a decision with
> clinical consequences. It needs a named owner before it goes in a contract.

**What we know today:** Supabase provides automated backups whose retention
depends on the plan tier. The actual retention window, whether
point-in-time recovery is enabled, and who can trigger a restore are all
**unverified** and should be confirmed before this document is shown to anyone.

## 4. Dependency map

The columns are the ones that matter when something is down at 3am: can we
work around it, does it have its own resilience, and who do we call.

### Tier 1 — care could be affected

| Dependency | What it does | If unavailable | Own DR/BCP | Failover | Owner |
| --- | --- | --- | --- | --- | --- |
| **Supabase Postgres** | Every record, and every access rule. RLS is the security boundary, so this is not just storage. | Total outage. Nothing works. | Vendor-managed; specifics **TBD** | None today — **single region, single provider** | TBD |
| **Supabase Auth** | Identity for patients, clinicians, staff. | Nobody can sign in, including existing sessions once tokens expire. | Vendor-managed | None | TBD |
| **Supabase Edge Functions** | Server-side logic: AI chat, notifications, EHR sync, scribe. | Assistant, emails and sync stop. Reads and writes still work. | Vendor-managed | None | TBD |
| **Hosting / CDN** (Lovable) | Serves the application. | Nobody can load the app. | Vendor-managed | None | TBD |
| **DNS** | `onecare.you` and tenant subdomains (`lmc.onecare.you`). | Total outage, and slow to fix because of TTL. | Registrar-dependent | **TBD — is there a secondary nameserver?** | TBD |
| **TLS certificates** | Every connection. | Hard failure, and browsers will not let users click through. | Auto-renewal assumed | Renewal monitoring **not verified** | TBD |

### Tier 2 — a promise breaks

| Dependency | What it does | If unavailable | Own DR/BCP | Failover | Owner |
| --- | --- | --- | --- | --- | --- |
| **Supabase Storage** | Vault documents, scans, audio. | Uploads and downloads fail. Metadata still visible. | Vendor-managed | None | TBD |
| **AI model provider** | Assistant, scribe, lab parsing, summaries. | Assistant unavailable. **Clinical care is unaffected** — this is deliberate. | Vendor-managed | Could fail over to a second provider; **not built** | TBD |
| **Resend** | Transactional email: invitations, confirmations, notifications. | Invitations and confirmations silently do not arrive. | Vendor-managed | None; a second provider is a small change | TBD |
| **Stripe** | Subscriptions and, later, patient payments. | No new subscriptions; existing access unaffected. | Strong vendor BCP | None needed | TBD |
| **KingsChat** | An identity provider option. | Those users cannot sign in; email sign-in unaffected. | Third-party | Email/password is the fallback | TBD |

### Tier 3

Notion (bug sync), analytics, and the marketing pages. No recovery plan
needed beyond "fix it next working day".

### Not yet in the map

WhatsApp BSP (endpoint is a stub), any EHR/QHIN counterparty, and the drug
database. Add these as they become real.

## 5. Service impact analysis

| Scenario | Immediate effect | Clinical risk | Mitigation today |
| --- | --- | --- | --- |
| Database unavailable | Total outage | **High** — a clinician cannot see a record before treating | None. Highest-priority gap |
| Auth unavailable | No new sign-ins | Medium — existing sessions survive until expiry | None |
| Storage unavailable | No documents | Medium | Metadata and clinical data still readable |
| AI provider unavailable | No assistant | **None by design** | The assistant never gates care |
| Email unavailable | Invitations do not arrive | Low | Share links can be copied and sent by hand |

## 6. The honest gaps

Stated plainly, because a continuity document that reads well and hides the
risks is worse than none:

1. **Single region, single provider, no failover.** Everything Tier 1 sits in
   one Supabase project. If that project is unavailable, OneCare is
   unavailable. There is no secondary region and no tested restore.
2. **No verified backup restore, still.** `docs/continuity/backup-restore-runbook.md`
   turns this from an open question into a runnable procedure — but running it
   needs dashboard or CLI access to the production project, which nobody
   authoring documentation in a repository checkout has. The runbook exists;
   the restore it describes has not been performed. An untested backup
   remains a hypothesis until that changes.
3. **RTO and RPO are unowned.** Proposed above; not agreed, and cannot be
   agreed from here — that needs a named owner with the authority to accept a
   number with contractual weight, not a more confident-sounding default.
4. **No manual fallback procedure — fixed.** §7 now says plainly what a
   clinic, a clinician, and front desk each do during an outage and on
   recovery. Not yet exercised as a drill; §8's tabletop item is why.
5. **No monitoring or alerting story — partly fixed.** `system-health`
   exists and can be polled by an external uptime monitor. Nobody has
   pointed one at it yet: the endpoint is necessary, not sufficient, and
   "wire up UptimeRobot (or equivalent) against system-health" is a five-minute
   task for whoever has the account to do it in.

## 7. Manual / fallback operating procedure

**During an outage, a practice continues on its own existing process** — paper,
or whatever system OneCare replaced — **and reconciles into OneCare once
service returns.** That was true the moment any hospital started depending on
this platform; writing it down does not create the obligation, it just stops
the first real outage from being the moment a practice discovers it had no
plan.

**Detecting it.** `system-health` (a Tier-1-only check: database
reachability, nothing else) is a public, unauthenticated endpoint intended
for an external uptime monitor — UptimeRobot, Better Uptime, or equivalent —
polling every one to two minutes and alerting whoever is on call. Wiring that
monitor up is the one step here that needs a person with dashboard access to
actually do; the endpoint existing is necessary and not sufficient.

**What a clinician does, immediately.**
1. Confirm it is not local — another device, another network, if one is at
   hand. A practice's own connectivity failing looks identical to OneCare
   being down and has a different remedy.
2. Fall back to whatever the practice used before OneCare for anything that
   cannot wait: current medications and allergies from memory or a printed
   list if one exists, vitals on paper, prescribing on the practice's
   existing pad or system.
3. **Write down what a paper record cannot capture on its own**: the time of
   each entry, and who made it. Reconciliation depends on both.
4. Do not attempt to reconstruct history from memory once service returns —
   enter what was captured on paper as of when it was captured, dated
   correctly. A record backfilled from memory days later is the wrong kind of
   correction to make silently.

**What front desk / admin does.** Hold new appointment bookings and
non-urgent messaging rather than working around the outage with a parallel
channel (a shared spreadsheet, a group chat) that itself becomes something to
reconcile. Urgent matters go to phone, as they would regardless of what
system is running.

**Once service returns.**
1. Check `system-health` reads healthy before resuming normal use — a flapping
   recovery is worse than a slow, confirmed one.
2. Enter paper-captured records promptly, dated to when they actually
   happened, not to when they were typed in.
3. Anything prescribed or administered during the outage that has a safety
   interaction with what is already in a patient's OneCare record needs a
   deliberate look, not just data entry — the assistant and alert rules did
   not see it happen and cannot flag it retroactively unless someone enters
   it and lets the checks run.
4. A note in the patient's record naming the outage window, for anyone later
   asking why a gap or a same-day double-entry exists in the trail.

**The patient-side fallback is stronger and worth stating separately:** the
FHIR record export under Settings → Privacy & data means a patient can hold a
complete copy of their own record independently of OneCare. That is a genuine
continuity property in its own right, and the argument for encouraging
periodic exports regardless of how reliable the platform is.

**Still open:** this procedure has not been exercised as a drill, only
written down. §8 below proposes a tabletop exercise for exactly that reason
— a plan that has only ever been read is not the same as one that has been
tried.

## 8. Test plan

**None performed to date.** Proposed, in order of value:

| Test | What it proves | Frequency |
| --- | --- | --- |
| Restore a backup into a scratch project | The backup is real and the RPO is achievable | Quarterly |
| Revoke an API key and observe | Failures are visible, not silent | Quarterly |
| Simulate AI provider outage | Care paths genuinely do not depend on it | Half-yearly |
| Simulate email outage | Invitations fail loudly | Half-yearly |
| Full region-loss tabletop | The plan survives contact with people, including §7's procedure | Annually |

The first row now has a runbook: `docs/continuity/backup-restore-runbook.md`
is the actual sequence to run, including how to record the result back into
§3 and §6. It needs a person with production dashboard or CLI access — it
has not been run.

"Revoke an API key and observe" is partly answerable without a drill now
that `system-health` exists: a revoked service-role key would show up as
the endpoint's `database` check failing (503) within one poll interval of
whatever monitor is watching it — once one is watching it. The test still
has value beyond that: it proves the *monitor* is actually configured and
someone actually gets paged, which the endpoint existing does not by
itself guarantee.

## 9. Vendoring, and why it is in this document

The FHIR layer runs Medplum's Apache-2.0 packages in our own process. Nothing
is called out to Medplum, and no data leaves. If Medplum vanished — company
gone, npm packages unpublished — the mitigation is to copy the three packages
we use into `vendor/` and keep building. That is what "vendor the packages"
means: they become our source, under a licence that already permits it.

This is worth recording because it is unusual. Most third-party dependencies in
this map are **services** — if Supabase is down, we are down. Medplum is a
**library**, so its vendor risk is close to zero, and the distinction matters
when someone reviews the dependency list and sees a third-party name next to
clinical data.

| Dependency type | Vendor disappears | Vendor has an outage |
| --- | --- | --- |
| Library (Medplum) | Copy the source, carry on | No effect — it runs in our process |
| Service (Supabase, Resend) | Migrate, painfully | We are down |

**Practical step, cheap, not yet done:** pin exact Medplum versions and keep a
verified copy of the three packages, so "vendor it" is an afternoon rather than
an archaeology project.

## 10. What to do next

Done: the manual fallback procedure (§7), a health-check endpoint a monitor
can poll (§7, §8), and a runnable backup-restore procedure
(`backup-restore-runbook.md`, §8). None of the three needed production
credentials to produce. What is left all does:

1. Name an owner for this document.
2. Confirm the actual Supabase backup retention and whether PITR is on.
3. Point an uptime monitor at `system-health` and confirm someone is
   actually paged when it goes red.
4. Run `backup-restore-runbook.md` once. Write down how long it took —
   that is the real RTO, replacing the proposed one in §3.
5. Agree RTO/RPO for Tier 1 with that number in hand.
6. Then, and only then, put any of this in front of a customer.
