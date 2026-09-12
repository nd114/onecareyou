-- Only the source may claim to be the source.
--
-- Found by attacking the mirror image of 20260929100000: that migration
-- stopped a patient from rewriting or erasing what a clinician recorded.
-- It never asked the opposite question — can a patient write a row that
-- *claims* to be the clinician's in the first place?
--
-- Both INSERT policies checked only `auth.uid() = user_id`. Tested directly,
-- signed in as a patient with no share to any clinician at all:
--
--   INSERT INTO public.vitals (user_id, type, value, unit, source, recorded_by_user_id)
--   VALUES (me, 'blood_pressure', 118, 'mmHg', 'clinician', <any UUID>);
--   -- 1 row inserted, no relationship required.
--
--   INSERT INTO public.medications (user_id, name, dosage, frequency, source, external_id)
--   VALUES (me, 'Oxycodone', '30 mg', 'as_needed', 'City General Hospital', 'RX-FORGED-001');
--   -- 1 row inserted, no connection required.
--
-- This is worse than the read-side gap it mirrors, for two reasons. First, it
-- is the exact scenario raised early in this branch's design conversation —
-- a patient making a change and having it appear to come from the doctor —
-- realised on vitals rather than medications, and on the *origin* of a row
-- rather than an edit to one. Second, and specifically because of
-- 20260929100000: a forged row is now *more* durable than before that fix,
-- not less, because the patient who forged it can no longer be the one to
-- correct or remove it — the very policy built to protect a real clinician's
-- record now also protects a fabricated one wearing its badge.
--
-- The fix is symmetric with 20260929100000: the patient's own INSERT policy
-- gets the same guard their UPDATE and DELETE policies now carry, plus the
-- two columns that name a specific origin (`external_id`, `ehr_connection_id`
-- on medications; `recorded_by_user_id` on vitals, restricted to null or the
-- patient themselves rather than to nothing, since recording one's own
-- reading and naming oneself as having done so is not a claim about anyone
-- else).
--
-- Every legitimate patient-facing write path was read before this migration
-- was written, not assumed: useVitals.ts's addVital, the assistant's
-- log_vital and add_medication, and AddMedication.tsx all either write
-- source: 'manual' explicitly or write nothing and take the column default —
-- none of them ever sets recorded_by_user_id, external_id or
-- ehr_connection_id. The clinician's own INSERT policy on vitals
-- ("Clinicians can record vitals for their patients") is untouched; it
-- already requires recorded_by_user_id = auth.uid(), user_id <> auth.uid(),
-- source = 'clinician' and a real permission grant, and RLS policies on the
-- same command are OR'd, so a correctly-scoped clinician insert still
-- succeeds on that policy regardless of what the patient's own policy allows.
-- The EHR sync and CSV import edge functions run as service_role, which
-- bypasses RLS entirely, so neither is affected by this change either.
--
-- What this does not do: nothing here distinguishes a row inserted under the
-- old, unrestricted policy from a genuine one. A forged row from before this
-- migration is indistinguishable from a real one without cross-referencing
-- recorded_by_user_id against an actual share history — a forensic pass this
-- migration does not attempt and that is recorded here as a follow-up, not
-- silently skipped.

DROP POLICY IF EXISTS "Users can create their own vitals" ON public.vitals;
DROP POLICY IF EXISTS "Patients record only their own manual readings" ON public.vitals;
CREATE POLICY "Patients record only their own manual readings"
  ON public.vitals FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (source IS NULL OR source = 'manual')
    AND (recorded_by_user_id IS NULL OR recorded_by_user_id = auth.uid())
    AND external_id IS NULL
    AND ehr_connection_id IS NULL
  );

COMMENT ON POLICY "Patients record only their own manual readings" ON public.vitals IS
  'A patient may only ever insert a manual reading of their own. Claiming '
  'clinician or device provenance, or naming somebody else as the recorder, '
  'goes through the separate clinician INSERT policy or the EHR sync '
  '(service_role, bypasses RLS) instead.';

DROP POLICY IF EXISTS "Users can create their own medications" ON public.medications;
DROP POLICY IF EXISTS "Patients enter only their own medications" ON public.medications;
CREATE POLICY "Patients enter only their own medications"
  ON public.medications FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (source IS NULL OR source = 'manual')
    AND external_id IS NULL
    AND ehr_connection_id IS NULL
  );

COMMENT ON POLICY "Patients enter only their own medications" ON public.medications IS
  'A patient may only ever insert a manual entry of their own. Claiming a '
  'hospital or clinic as the source, or a real prescription''s external id, '
  'goes through the EHR sync (service_role, bypasses RLS) instead — the '
  'same asymmetry 20260929100000 gave the UPDATE and DELETE policies.';

-- ---------------------------------------------------------------------------
-- The same gap, a third table: health_documents.
--
-- "Users can upload their own documents" checked only auth.uid() = user_id.
-- Tested directly, signed in as a patient with no clinician relationship at
-- all:
--
--   INSERT INTO public.health_documents
--     (user_id, file_path, file_name, title, uploaded_by_user_id, source_context)
--   VALUES (me, ..., 'Fit to work certificate', <any clinician's uuid>, 'clinician_upload');
--   -- 1 row inserted.
--
-- `source_context = 'clinician_upload'` is the exact string DocumentCard.tsx
-- checks to render "From your clinician", and `uploaded_by_user_id` is the
-- exact column the DELETE policy (pass 3, 20260926100000) requires to be
-- NULL before the patient can remove a document themselves. So the same
-- fabricated certificate that displays with a clinician's badge is also, once
-- inserted, permanently outside the patient's own ability to remove it —
-- the second time in this pass that the guard built to protect a real
-- clinician's record has also protected a forged one wearing its badge.
--
-- Unlike vitals and medications, source_context is a genuine, multi-valued
-- categorisation tag with several legitimate patient-side values — direct,
-- vitals_upload, assistant, patient_recording, care_record_snapshot, invoice,
-- message_attachment — read from every caller of uploadDocument() before
-- writing this, rather than assumed. The fix is a denylist on the one
-- reserved value, not an allowlist that would have broken the others.
DROP POLICY IF EXISTS "Users can upload their own documents" ON public.health_documents;
DROP POLICY IF EXISTS "Patients upload only as themselves, never as their clinician" ON public.health_documents;
CREATE POLICY "Patients upload only as themselves, never as their clinician"
  ON public.health_documents FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND uploaded_by_user_id IS NULL
    AND source_context <> 'clinician_upload'
  );

COMMENT ON POLICY "Patients upload only as themselves, never as their clinician" ON public.health_documents IS
  'uploaded_by_user_id and the clinician_upload source_context together are '
  'what DocumentCard.tsx reads as "From your clinician" and what the DELETE '
  'policy treats as not the patient''s to remove. A patient''s own upload '
  'must leave both unclaimed; the separate clinician INSERT policy is what '
  'sets them for real.';
