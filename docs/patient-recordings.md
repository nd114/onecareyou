# Patient recordings

A patient recording their own appointment, so they can listen back to what was
actually said. People forget most of what they are told in a consultation, and
a recording is the cheapest possible fix for that.

It is also the patient-side feature with the most legal exposure, and most of
the design below is about not quietly transferring that exposure onto the
person using it.

## The shape of it

| Piece | Where |
| --- | --- |
| The notice, naming, filenames, the downloaded file's text | `src/lib/recording-consent.ts` |
| Whether a transcript is still being written | `src/lib/recording-status.ts` |
| Capture (MediaRecorder, cap, elapsed time) | `src/hooks/useVoiceRecorder.ts` |
| Reading and writing recordings | `src/hooks/usePatientRecordings.ts` |
| Notice → record → name | `src/components/recordings/RecordVisitDialog.tsx` |
| The list | `src/pages/Recordings.tsx`, at `/recordings` |
| Transcription | `supabase/functions/transcribe-recording/index.ts` |
| The table | `supabase/migrations/20260907100000_patient_recordings.sql` |
| Its tests | `supabase/tests/patient_recordings.test.sql` |

The audio and the transcript are ordinary Health Vault documents, filed under a
`recording` category. That was deliberate: they inherit sharing, archiving,
search, storage accounting and download from the Vault rather than needing a
second version of each. The `patient_recordings` row holds only what the Vault
cannot — the name, when the conversation happened, and what was acknowledged.

## Three decisions worth knowing about

### 1. The acknowledgement is per recording, not per account

`consent_acknowledged_at` and `consent_notice_version` are both `NOT NULL`, so
a recording without an acknowledgement is not storable — the constraint
enforces the rule rather than the interface remembering to. The version is
stored beside the timestamp so it stays possible to say what somebody actually
agreed to once the wording changes.

Permission to record is given for a conversation. Storing it once per account
would mean treating a "yes" from one clinician in March as a "yes" from a
different clinician in November.

### 2. The notice tells people to ask, rather than telling them the law

Recording law is one-party consent in some jurisdictions and all-party in
others. We do not know where any given patient is, and stating the wrong rule
turns a helpful feature into a criminal offence for the person using it. So the
notice says: tell whoever you are with, and get their agreement, every time.
There is one checkbox and it is that — not four checkboxes, which would only
teach people to click through checkboxes.

### 3. Transcription is opt-in per recording, because it is the one step that
sends audio away

The recording itself never leaves the patient's own storage. A transcript
cannot be produced without shipping the audio to something that can hear it,
which makes "this stays private" untrue the moment a transcript is requested —
so the notice says so, and the request is a separate action rather than
something that happens on save.

The edge function additionally refuses unless `ai_processing_consent` is set on
the profile, so the claim holds even if a future caller forgets to ask.

## What the table does not have

There is no clinician policy and no practice policy on `patient_recordings` —
not a narrowed one, none at all, and `supabase/tests/patient_recordings.test.sql`
asserts that no share or practice policy reaches the table. A recording of a
consultation is the patient's own note of a conversation, not part of the
clinical record. If they want a clinician to have it, they share the Vault
document; a clinician discovering they had been recorded by way of a patient
list would be a bad way to find out.

## Failure modes that are handled

- **A stalled transcript.** The edge function can time out, or the tab can be
  closed mid-request, and neither writes `failed`. `isTranscriptInFlight()`
  treats a `pending` row older than 15 minutes as stalled so the retry is
  reachable — otherwise a spinner locks the patient out of their own transcript.
- **An empty "ready" transcript.** Refused by a CHECK constraint. A failure
  wearing the wrong label is worse than a visible failure, because the patient
  would trust it.
- **A closed tab mid-recording.** The dialog cancels the recorder and releases
  the microphone when it unmounts.
- **An orphaned upload.** If the `health_documents` insert fails after the file
  is in the bucket, the file is removed — it would otherwise count against the
  patient's storage forever with nothing pointing at it.
- **Losing a capture by accident.** Once there is audio, the dialog's corner
  close button is gone and Escape does not dismiss it. Discard and Save are
  both named buttons, because both outcomes deserve naming.

## The warning travels with the file

`transcriptFileBody()` puts the accuracy caveat inside the downloaded `.txt`,
not only on the screen where it was requested. The copy that gets forwarded to a
relative or printed and filed is the copy most likely to be read by somebody who
never saw the dialog.

## Storage claims

`DURABILITY_POINTS` used to say "audio is transcribed then discarded —
transcripts are kept, not recordings". That is true of clinician dictation and
false of patient recordings, so it is now two constants — `PATIENT_AUDIO_POINT`
and `CLINICIAN_AUDIO_POINT` — shown on the respective storage cards. One
sentence hedged to cover both would have been a durability promise nobody could
rely on.

## Still to do

- Recordings count against the patient's storage allowance through the Vault's
  existing accounting, but there is no warning *before* a long recording that
  it may not fit. Worth adding once real recordings exist to size against.
- Transcription is a single synchronous call. A very long consultation would be
  better chunked, with the transcript assembled from parts.
