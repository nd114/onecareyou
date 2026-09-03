# IT Service Continuity & Disaster Recovery — OneCare

Status: **first draft, structure over content.** The sections are the ones an
auditor or an enterprise customer's risk team will ask for. Several are marked
**TBD** because the answer is a business decision that has not been made yet,
and inventing a number here would be worse than admitting it is open.

Owner: TBD · Last reviewed: 2026-09-04 · Review cadence: **quarterly, and after
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
2. **No verified backup restore.** Backups are assumed to exist. Nobody has
   restored one. An untested backup is a hypothesis.
3. **RTO and RPO are unowned.** Proposed above; not agreed.
4. **No manual fallback procedure.** There is no documented way for a clinic to
   keep working during an outage.
5. **No monitoring or alerting story in this document.** You cannot recover
   from what you do not know is down.

## 7. Manual / fallback operating procedure

**TBD.** At minimum this should say what a clinic does during an outage — most
likely: continue on their existing process, and reconcile into OneCare
afterwards. This needs writing before any hospital depends on the platform.

The patient-side fallback is stronger and worth stating: the FHIR record export
under Settings → Privacy & data means a patient can hold a complete copy of
their own record independently of us. That is a genuine continuity property,
and it is the argument for encouraging periodic exports.

## 8. Test plan

**None performed to date.** Proposed, in order of value:

| Test | What it proves | Frequency |
| --- | --- | --- |
| Restore a backup into a scratch project | The backup is real and the RPO is achievable | Quarterly |
| Revoke an API key and observe | Failures are visible, not silent | Quarterly |
| Simulate AI provider outage | Care paths genuinely do not depend on it | Half-yearly |
| Simulate email outage | Invitations fail loudly | Half-yearly |
| Full region-loss tabletop | The plan survives contact with people | Annually |

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

1. Name an owner for this document.
2. Confirm the actual Supabase backup retention and whether PITR is on.
3. Restore one backup into a scratch project. Write down how long it took —
   that is the real RTO.
4. Agree RTO/RPO for Tier 1 with that number in hand.
5. Write the manual fallback procedure.
6. Then, and only then, put any of this in front of a customer.
