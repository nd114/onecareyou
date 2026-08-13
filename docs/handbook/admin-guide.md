# Admin guide (OneCare staff)

The platform admin console at `/admin`. Access requires the `admin` role in `user_roles`, verified
server-side on every load. Admins are isolated: they cannot see patient or clinician surfaces, and
signing in as an admin lands on the console.

## 1. Shell

Every `/admin*` route uses the admin header: **Console · Careers · Changelog · Import**, plus the
account menu. The patient bottom nav and FABs are suppressed.

## 2. Console tabs

### Tenants
- Cross-tenant table: name, type, tier, hospital code, location, team size, connected patients,
  pooled storage against allowance, revenue share.
- Search by name, code or location; the list is paginated (10 per page).
- **Create tenant** — name, type (practice/hospital), city, country, tier, storage allowance,
  revenue share, hospital code, patient and member limits.
- **Row actions** — edit those fields, set or change the hospital code (with availability check),
  invite the owner, deactivate.

### Access
- **Platform admins** — grant by email (the person must already have a OneCare account) or revoke.
  The signed-in admin cannot remove themselves, and the last admin is protected. Paginated.
- **Tenant owner invitations** — pending and accepted owner invitations, cancellable while pending.
  Paginated.

### Activity
Read-only log of every platform-admin action (create/update tenant, invite/cancel, grant/revoke
admin) with actor, target and timestamp. Cannot be edited. Paginated 15 per page.

### Tools
Links to Careers, Import and Changelog.

## 3. Tenant owner invitations end to end

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

## 4. Careers

`/admin/careers` has two tabs:
- **Jobs** — create, edit, publish/unpublish and delete postings; compensation labels come from the
  shared job constants, never hardcoded. Paginated.
- **Applications** — searchable, status-filterable list with pagination; open a candidate to read
  their answers, add internal notes, change status and open their résumé through a short-lived signed
  URL from the private `resumes` bucket.

## 5. Changelog and import

- **Changelog** (`/admin/changelog`) — internal release log, `noindex`, useful for investor updates.
- **Import** (`/admin/import`) — internal CSV utilities (e.g. international drug mappings).

## 6. Security rules that must not be relaxed

- Roles live only in `user_roles`; never on `profiles`. Never trust client storage for admin state.
- All admin mutations go through `SECURITY DEFINER` functions that re-check `has_role(auth.uid(),
  'admin')`; the client never writes to admin tables directly.
- Every mutation logs to `platform_admin_actions` via `log_platform_admin_action`.
- Admin-facing edge functions gate with `requireServiceRoleOrAdmin` from `_shared/auth.ts`.
- Service-role keys and database passwords are not retrievable and must never be echoed anywhere.
