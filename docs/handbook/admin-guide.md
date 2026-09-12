# Admin guide (OneCare staff)

The platform admin console at `/admin`. Access requires the `admin` role in `user_roles`, verified
server-side on every load. Admins are isolated: they cannot see patient or clinician surfaces, and
signing in as an admin lands on the console.

## 1. Shell

Every `/admin*` route uses the admin header: **Console · Careers · Docs · Changelog · Import**, plus
the account menu. The patient bottom nav and FABs are suppressed.

The console itself has six areas — **Today, Accounts, Revenue, Reliability, Trust, Workshop** —
addressable individually via `?tab=`.

## 2. The privacy stance (read this before adding a new query)

`sharing-access-consent-model.md` is the canonical description of who can see a patient's data, and
its first principle is that **the patient holds the power** over every sharing relationship. A
platform admin is not a party to that consent — not the treating clinician, not the institution the
patient chose to share with. That has a direct consequence for this console:

- **Organisations are browsable.** Tenants are OneCare's business customers, and the Tenants and
  Revenue tables list all of them, unsearched, the way any B2B admin console would.
- **People are not.** A clinician or patient's account, and the fact of who they are currently
  connected to, only surfaces once an admin searches for that specific person by name or email
  (`admin_accounts_directory`, `admin_access_reviews` — both require 2+ characters for anything but
  the `tenant` kind, enforced in the function itself, not only the client). There is no screen that
  lists every clinician-patient relationship on the platform, or every patient account, for casual
  browsing. A support conversation always starts with a name already in hand; nothing legitimate here
  needs a scroll through everyone.
- **A lookup still shows counts and states, never content.** The account drawer reports how many
  documents, medications and readings exist — never what is in them. An access-review row reports
  which permission categories are granted and since when — never the data those categories cover.

If a new admin query is about to list every instance of something that belongs to a named patient or
clinician, ask whether it needs a search gate before it ships, not after someone notices.

## 3. Console areas

### Today
The founder home: an attention queue of things with a deadline (storage over threshold, stale
invitations, unanswered contact/bug reports, long trials, empty tenants, sync failures), movement
over a chosen window with sparklines, the last 24 hours' signal, platform-wide totals, storage
against allowance, and recent sign-ups (browsable — see §2; this is a monitoring signal capped to the
newest accounts, not a support lookup tool, and shows no relationship or connection detail).

### Accounts
One directory across tenants, clinicians and patients, described in §2. Selecting **Tenants** lists
them all; selecting **Clinicians**, **Patients** or **Everyone** requires a search. Opening a row's
drawer shows roles, workspace membership, connection *counts*, storage, record *counts* and a log of
recent action names and timestamps — never a document, a medication name or a reading.

Below the directory: the pre-existing **Tenants** table (name, type, tier, hospital code, location,
team size, connected patients, pooled storage, revenue share — search by name, code or location,
paginated), its **Create tenant** dialog, row actions (edit, hospital code, invite owner,
deactivate), and **Platform admins** (grant by email, revoke, last-admin protected) plus **tenant
owner invitations** (see §4).

### Revenue
Monthly run rate by tier — computed client-side from `src/lib/pricing-constants.ts` and
`CLINICIAN_TIER_INFO`, so a price change is a one-line edit there rather than a migration. A tier the
constants have no price for is named on the page rather than silently counted as zero. Trials and
lapses, invoices and platform fee, storage allowance vs. use, and a per-tenant billing table with an
**Extend** action.

### Reliability
Failure signals this database actually holds: EHR sync failures and the export queue per connection,
assistant volume (counts, not spend — spend is billed by the model provider), dictation failures,
sign-in throttling, alert delivery. Says plainly that edge-function and auth-service logs live
outside Postgres and are not counted here. **Requeue** clears a stuck export's attempt count.

### Trust
Live-access and consent totals, agreement coverage, an **access review** (§2 — search-gated), an
**audit export** (a date range of the access log as a CSV, actor/subject resolved to email, never the
`details` column), the cross-tenant **access log search** (`admin_access_log_search` — an
accountability trail of past events, which is why it stays browsable where the access review is not:
a permission is current state; a log entry already happened and is being reviewed for who did what),
and the **platform-admin action log** (every admin mutation, read-only, cannot be edited).

**Close access** on a review row revokes a `provider_shares` or `practice_shares` row and demands a
reason. This needed `guard_provider_share_consent` widened: the trigger pins every other term of a
provider share back to its old value for anyone but the patient, so an admin revoke used to match a
row, report success, and change nothing. It now recognises a platform admin closing a share as the
one exception, and only that — widening permissions, reassigning to another patient or reopening a
closed share all still revert. `admin_command_centre.test.sql` asserts both halves of that.

### Workshop
Tool cards for **Careers**, **Changelog**, **Docs** (this handbook, in-app) and **Data import**, plus
**Demo data** — buttons to run `seed-demo-data` and `seed-demo-hospital`, previously only invocable by
hand. Both are idempotent and already gated by `requireServiceRoleOrAdmin`; the button adds the
console surface, not new access.

## 4. Tenant owner invitations end to end

1. Admin opens a tenant's row actions and invites an email address.
2. `admin_invite_tenant_owner` creates a row in `tenant_owner_invitations` (30-day expiry) and logs
   the action.
3. The `notify-tenant-owner-invite` edge function emails the invitee via Resend, explaining that they
   should create or sign into a clinician account with that email and accept on the Practice page. If
   the email fails, the invitation still exists and the console warns the admin.
4. The invitee accepts on `/clinician/practice`; `accept_tenant_owner_invitation` makes them owner in
   `practice_members` and marks the invitation accepted.

Invitations are matched on the email address of the accepting account, so an invitee cannot redirect
someone else's invitation.

## 5. Careers, changelog, docs and import

- **Careers** (`/admin/careers`) — **Jobs**: create, edit, publish/unpublish and delete postings;
  compensation labels come from the shared job constants, never hardcoded. **Applications**:
  searchable, status-filterable, paginated; open a candidate to read their answers, add internal
  notes, change status and open their résumé through a short-lived signed URL from the private
  `resumes` bucket.
- **Changelog** (`/admin/changelog`) — internal release log, `noindex`, useful for investor updates.
- **Docs** (`/admin/docs`) — this handbook and the platform/architecture reference, readable in-app.
- **Import** (`/admin/import`) — internal CSV utilities (e.g. international drug mappings).

## 6. Security rules that must not be relaxed

- Roles live only in `user_roles`; never on `profiles`. Never trust client storage for admin state.
- All admin mutations go through `SECURITY DEFINER` functions that re-check `has_role(auth.uid(),
  'admin')`; the client never writes to admin tables directly.
- Every mutation logs to `platform_admin_actions` via `log_platform_admin_action`.
- Admin-facing edge functions gate with `requireServiceRoleOrAdmin` from `_shared/auth.ts`.
- Service-role keys and database passwords are not retrievable and must never be echoed anywhere.
- Anything that lists people rather than organisations is search-gated per §2. This is enforced in
  the `SECURITY DEFINER` function itself, not only the client, so a direct API call cannot bypass it
  either.
