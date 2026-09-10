# Health Vault polish, patient tidy-ups, and clinician workflow fixes

Grouped into four phases. Each phase is shippable on its own.

## Phase 1 — Health Vault: proper file management

**The archive switch bug (confirmed).** The document list recalculates on documents, category, folder and search — but not on the archive switch itself, which is why nothing changes until you click a folder and back. Adding the switch to that list fixes it.

**Folders become real, not just labels.** Today a folder only exists while a document carries its name, so a new folder disappears on refresh and cannot be renamed. Add a small folders record per person so that:

- Creating a folder keeps it, empty, across visits.
- Renaming a folder renames it everywhere its documents point.
- Removing a folder is allowed only when empty (or moves its documents to Unfiled), never touching the files themselves.
- Folders show in the upload dialog and in each document's "move to" menu.

**Editing what a document says about itself.** One "Edit details" panel on every document: name, type, the date on the document, tags (add and remove, the person's own words kept separate from the assistant's suggestions), notes and folder.

**Searching by date.** Add a date filter beside search — a from/to range on the document's own date, plus quick choices (last 30 days, this year). Typing a year or a month name in the search box also matches.

**Archive correctness review.** Walk the archive end to end and confirm it behaves as intended: archived items leave the main Vault and leave whole-Vault sharing, a document handed to a clinician individually is *not* silently withdrawn, the person can still see and restore their own archived items, and restore brings it back. There are existing database tests for this; they will be run and extended where they don't cover the screen behaviour.

**Personal notes.** A note the patient writes themselves, in the Vault, labelled "Personal note" wherever it appears. Title, rich text (headings, bold, italic, lists), dated, editable, archivable, filed in folders and searchable like any other record. Kept clearly distinct from anything a clinician wrote.

## Phase 2 — Patient side tidy-ups

- Hide Help & Support from the patient menu, footer and public links until it is built out (the page stays reachable by direct link, and stays out of search results).
- Remove the duplicate "Contact" in the footer (it appears under both Product and Support; the Product one goes).

## Phase 3 — Clinician side

**Today**

- "Mark all as read" / "Mark all acknowledged" on the inbox, with per-item actions unchanged.
- Booking from Schedule: a "Book appointment" action that lets the clinician pick one of their patients, set date, time, type and note — and the patient is notified by their chosen channel. Today booking only exists inside a patient's own Appointments tab.
- Alert management: checkboxes with select-all, and bulk actions (acknowledge, dismiss, change threshold) the way an email list works.

**A patient's page**

- Make the connection between clinician and patient visible at the top of the patient page — how they're linked, since when, what access it grants — instead of it only being inferable from Encounters.
- Signed visit notes: review and tighten so opening a signed note reads as final. The follow-up interval is currently the one editable field by design; make that explicit on screen, or lock it too — your call, noted as a decision below.
- Paginate Adherence, as the patients list already is.
- Documents tab: check it lists, opens and shares correctly.
- My notes: a proper note editor (headings, bold, italic, underline, lists), saved with a date, editable later.
- Hide the Network tab for now.
- Activity: unchanged.

**Communicate & Practice**

- Patient Access section: it currently shows only EHR integration — rename and describe it for what it actually does, and surface the access/consent information a clinician expects there.
- Privacy & Data activity log: pagination plus search and date filtering.
- Hide clinician Help & Support from both menus (the top-right profile menu and the section nav disagree today).

**Clinical assistant**

- Voice: dictate to the assistant, so a clinician can speak a message or an instruction and have it drafted for approval.
- Fix the overlapping bin and close buttons at the top of the assistant panel.
- Go through each advertised assistant capability and confirm it works end to end: drafting messages, guidance, alert thresholds, bulk actions — with nothing saved before approval.

## Phase 4 — Staff and nurse access

The database already carries roles beyond owner/admin/provider (nurse, front desk, billing, read-only, sub-admin). This phase signs each of those in and walks their screens, confirming each sees exactly what its role allows and nothing more, and fixes what doesn't hold.

## Decisions I need from you

1. Signed visit notes — should the follow-up interval stay editable after signing, or should a signed note be entirely read-only with changes going through an addendum? ---> Yes, should have an addendum
2. Folder removal — when a folder still has documents in it, move them to Unfiled, or refuse until it's empty? ---> move them to unfiled

I'll start with Phase 1 unless you'd rather I take the clinician items first.

## Technical notes

- `HealthVault.tsx`: add `showArchived` to the `filteredDocuments` memo dependencies.
- New table `document_folders` (id, user_id, family_member_id, name, timestamps, unique per owner+name) with GRANTs to `authenticated`/`service_role`, RLS scoped to `auth.uid() = user_id`. Rename updates `health_documents.folder` for the owner's rows in the same transaction (a database function keeps them consistent).
- Personal notes: reuse `health_documents` with a `personal_note` category and note body stored in `notes` as sanitized HTML, so sharing/archive/search policies apply unchanged — no second permissions surface. Rich text via a lightweight editor; output sanitized before write and on render.
- Date search: add `document_date` range state to the Vault filters and extend `vaultSearchFields` with a formatted-date string so text search matches years and month names.
- Clinician bulk actions build on existing `BulkPatientActions`/`BulkAlertRuleDialog` patterns; alert bulk operations go through the existing hooks with an added multi-id path.
- Appointment booking reuses `fhir_appointments` + `useAppointments`, honouring `notification_preferences`.
- Notes editors (patient personal notes, clinician internal notes) share one sanitized rich-text component.
- Nav changes are centralised in `src/lib/nav-ia.ts` plus `Footer.tsx`, so both menus stop disagreeing.
- Archive verification extends `supabase/tests/vault_archive.test.sql` and adds a browser pass over the archive toggle.