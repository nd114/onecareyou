# Scribe access, patient page rework, a real assistant, and EHR readiness

Four things, in the order they pay off.

---

## 1. Make the scribe easy to find

Today the scribe only exists inside a patient's Encounters tab, several clicks deep, so nobody
will find it.

- Add a **Start visit note** button in two obvious places: the top of a patient's page (next to
  their name), and on Today next to each person in the queue.
- Add a **Scribe** entry under Today's sub-tabs that opens a recording screen where the
  clinician picks the patient after they finish talking — so they can press record first and
  sort out the paperwork second.
- The recording panel becomes a slide-over that stays open while the clinician moves around the
  patient's record, so it never gets cancelled by navigating away.
- Keep every existing rule: the draft is unsigned, the clinician edits it, ticks the sections
  they want, and nothing is written until they apply it.

## 2. Rebuild the patient page

Fourteen tabs each opening a mini-page underneath is the core problem.

Group them into **five** sections, matching how a clinician actually reads a patient:

| Section | Holds |
|---|---|
| Overview | Live summary: latest readings, active medicines, open alerts, next appointment, recent activity — with links into the detail below |
| Clinical | Encounters, vitals, medications, care plan, guidance |
| Records | Documents, analytics, adherence |
| Communication | Messages, appointments, my notes, team notes |
| Admin | Billing, activity, access |

- The five sections become the sub-tab row; within a section the old tabs become a compact
  segmented control, so the deepest anything sits is two clicks instead of one row of fourteen.
- A **sticky patient header** carries name, age, key flags, connection status and the actions
  (message, book, start note) so those never scroll away.
- Overview is the landing section, so opening a patient answers "how are they" immediately
  instead of showing an empty tab.
- Role rules are unchanged: non-clinical staff still only see what they see today; sections with
  nothing visible to that role are hidden entirely.

## 3. Adherence that survives a long history

- Adherence opens as a **summary**: a percentage for the period, a per-medicine breakdown, and a
  simple week-by-week band showing where the misses cluster.
- The full dose-by-dose list moves behind "See every dose", stays paged, and gains filters for
  medicine, date range and missed-only.
- Add a period switcher (7 / 30 / 90 days) so the default view is short by design.

## 4. The assistant does the filing

The rule does not change: **the assistant proposes, the clinician or patient approves, and only
then is anything written.** What changes is how much it can propose.

Clinician side — new proposals, each with a preview showing exactly what will be written and
where:
- Book an appointment (or request scheduling)
- Create a task / to-do
- Create a referral
- Add an internal team note
- Record a vital or a medication change discussed in the room
- Assign the patient to a colleague

Voice: pressing the mic and talking produces a **single review screen** listing every action the
sentence implied, grouped by what it touches, with Approve all / approve some / edit / discard.
Where a name is ambiguous ("Mr John James"), the assistant shows candidates and the clinician
picks — it never guesses, and an unresolved name blocks that one action rather than defaulting.

Patient side:
- Dictating readings and doses already works; add **naming a family member** so a parent with
  twins can say whose reading it is.
- "Take me to my medicines" style requests navigate, with the destination named in plain words.

Consent and disclosure:
- Voice actions sit behind their own explicit opt-in, separate from chat, revocable at any time
  from Settings, with a plain-English panel saying what is recorded, what is sent for
  processing, what is kept, and that nothing is written without approval.
- The words that produced each action are stored with it, so the audit answers "why was this
  written" with the sentence that caused it.
- Terms, Privacy and the data-processing page get matching sections covering voice capture,
  transcription, AI processing, retention and withdrawal.

## 5. EHR: where we actually stand

Short answer: the FHIR groundwork is real, but we are not yet safe to connect a hospital.

Present: FHIR resource mapping for observations, medications, appointments, care plans,
documents and invoices; a FHIR router over our own tables; inbound webhook, scheduled pull,
outbound export queue; provenance columns on imported readings.

Three gaps before a first integration:
1. **Connections belong to a clinician, not a hospital** — a departing doctor takes the
   hospital's link with them. Needs tenant ownership.
2. **Patient matching is a free-form column.** Needs a real link table plus a review queue, so a
   result can never silently land on the wrong person.
3. **Write-back has no conflict rules** and the outbound queue is untested end to end.

This plan delivers the written assessment plus gaps 1 and 2 (tenant-owned connections and a
confirmed-match link table with a review queue). Write-back stays out — it is where an
integration can cause harm and deserves its own pass.

---

## Technical notes

- Patient page: `ClinicianPatientDetail.tsx` splits into a section shell plus per-section
  components; tab state moves into the URL so a section is linkable and a refresh keeps place.
- Scribe: `EncounterScribePanel` is lifted into a persistent slide-over host mounted above the
  clinician routes; `useLiveScribe` gains per-window transcript persistence so a crash mid-visit
  does not lose the words. Fix the WAV upload naming so live-captured audio is not labelled
  webm.
- Assistant: new `propose_*` tools in `clinician-ai-chat` with executors in
  `clinician-ai-actions.ts`, each writing to `patient_action_log`; a name resolver built on
  `identity-match.ts` that returns candidates, never a winner; multi-action review UI replacing
  the single pending card. Patient tools gain `family_member_id`.
- Adherence: server-side aggregate query for the summary; existing paged query behind the full
  list.
- EHR: migration adding `practice_id` to `ehr_connections` and a new `ehr_patient_links` table
  with grants, RLS and a confirmation queue reusing `patient-dedup.ts`.
- New consent columns for voice actions plus a Settings panel; SQL tests for the new proposals
  and for link-table access.
