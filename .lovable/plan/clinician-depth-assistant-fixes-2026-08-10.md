# Clinician depth + assistant fixes

## 1. Assistant: approvals that actually change things

Confirmed gap: the assistant only has four proposal tools — log vital, add medication, mark dose taken, update medication times. There is **no** tool for removing or stopping anything, so "remove the 4am dose" or "stop this medication" can only be mapped onto a full time-list rewrite (or nothing at all), which is why approvals appear to do nothing.

Work:

- Add proposal tools for the missing intents: remove one reminder time, discontinue a medication, and correct/delete a mistaken vital entry.
- Make the update path explicit about what the new full time list is, so removals can't be silently dropped.
- Every action returns a verified outcome (re-read the row after writing) and the card shows "Saved", "Nothing changed", or the exact failure reason instead of a blanket "Applied".
- The current failure is not yet root-caused for the *existing* update path. First step of the build is a live signed-in run of the exact flow from the screenshots (change Metformin to 4pm only) to capture the real error before changing that code path.

## 2. Clinician "Unknown Patient"

Confirmed cause: that share has `profile: false` in its permissions, so RLS correctly hides the patient's profile row and the UI falls back to the string "Unknown Patient". It is a real, intentionally restricted share, not bad data.

Fix: render restricted shares honestly — show the invited email as the identifier plus a "Name not shared" badge, and surface which data types the patient did share. No permission [changes.In](http://changes.In) that case, I think we should make the name and email/phone number sharable with the clinician mandatorily and preserved to be compliant with basic medical information sharing expectations - a doctor cannot be managing a patient whose name or contact they don't have on file (no hypothetical patient; so if a patient even retracts their sharing permissions, the doctor should have the record up to they disconnect and keep for however the policies are and we can put that disclaimer towards the patient to view).

## 3. Patient list → simple list

Replace the current card-per-patient layout with a compact list: name, status, last activity. Row click opens the patient detail page, which keeps all the existing depth (guidance, alerts, messages, encounters). Add pagination (25 per page) with search working across the full set, not just the visible page.

## 4. Today pillar merged into one page

Today becomes a single page: ranked inbox queue + alerts + the key stats strip. Remove the Overview and Alerts sub-tabs, remove the duplicated in-dashboard Patients/Alerts tab switcher, and redirect the old routes to the merged page so existing links and the standalone/PWA launch path keep working.

## 5. Attachments in clinician–patient chat

The messages table already has an `attachment_path` column but nothing reads or writes it. Add a private bucket for message attachments with access scoped to the two participants, an attach control in the thread composer on both the clinician and patient side, and inline rendering (image preview / file chip) that opens through a short-lived signed URL.

## 6. Ambient clinical scribe

Build on the existing encounters + dictations objects:

- Record or upload visit audio from inside an encounter.
- Transcribe, then generate a structured SOAP note plus suggested vitals/medication mentions.
- Clinician reviews side-by-side (transcript vs draft), edits, and signs — nothing enters the encounter until signed.
- Audit entry on generate and on sign.

The other roadmap items (problem list/ICD-10, care plans, orders & results) stay documented for later; the roadmap doc gets a note that scribe has moved into build.

## Technical notes

- New proposal tool types in `patient-ai-chat` + matching executors in `src/lib/ai-actions.ts`; outcome verification per action.
- `useClinicianPatients` stops substituting a fake name; restricted-share state is modelled explicitly.
- `nav-ia.ts` clinician Today pillar drops its sub-tabs; `ClinicianDashboard` content folds into `ClinicianToday`.
- New storage bucket + RLS policies on `storage.objects` for message attachments.
- Scribe uses the existing dictation edge function pattern with a new SOAP-generation step writing a draft onto the encounter.