-- Every kind of patient notice, in one list.
--
-- Two migrations written side by side each extended the patient_notices type
-- check with their own value: 20261010140000 added document_received (a
-- clinic or clinician filed a document into the Vault), and 20261010160000
-- added guidance_withdrawn. The later one recreates the constraint from its
-- own list, which drops document_received, so every document sent to a Vault
-- after it would fail the insert in tell_patient_of_document and roll back
-- the upload with it. This restates the full list. The next migration to add
-- a notice type should start from this one.

ALTER TABLE public.patient_notices DROP CONSTRAINT IF EXISTS patient_notices_notice_type_check;
ALTER TABLE public.patient_notices ADD CONSTRAINT patient_notices_notice_type_check
  CHECK (notice_type IN ('care_handed_over', 'guidance_withdrawn', 'document_received'));
