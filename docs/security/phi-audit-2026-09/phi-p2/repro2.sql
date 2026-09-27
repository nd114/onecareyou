\set ON_ERROR_STOP 1
\pset footer off
BEGIN;
\set P  '''a0000000-0000-0000-0000-00000000000a'''
\set D  '''a0000000-0000-0000-0000-00000000000b'''
\set F  '''a0000000-0000-0000-0000-00000000000c'''
\set R  '''a0000000-0000-0000-0000-00000000000d'''
\set B  '''a0000000-0000-0000-0000-000000000011'''
\set C  '''a0000000-0000-0000-0000-000000000010'''
\set O  '''a0000000-0000-0000-0000-00000000000f'''
\set X  '''a0000000-0000-0000-0000-0000000000c1'''
\set DOC '''a0000000-0000-0000-0000-0000000000d2'''

INSERT INTO auth.users (id,email,email_confirmed_at) VALUES
 (:P,'p@t.local',now()),(:D,'d@t.local',now()),(:F,'fd@t.local',now()),
 (:R,'r@t.local',now()),(:B,'b@t.local',now()),(:C,'c@t.local',now()),(:O,'o@t.local',now());
SELECT set_config('request.jwt.claim.sub', :O, true);
INSERT INTO public.practices (id,name,created_by) VALUES (:X,'Test Practice',:O);
INSERT INTO public.practice_members (practice_id,user_id,role,status) VALUES
 (:X,:D,'provider','active'),(:X,:F,'front_desk','active'),(:X,:B,'billing','active'),(:X,:R,'provider','revoked');

SELECT set_config('request.jwt.claim.sub', :P, true);
INSERT INTO public.practice_shares (practice_id,user_id) VALUES (:X,:P);
INSERT INTO public.practice_patient_assignments (practice_id,patient_user_id,clinician_user_id,assigned_by)
VALUES (:X,:P,:R,:O), (:X,:P,:F,:O);
INSERT INTO public.medications (user_id,name,dosage,frequency) VALUES (:P,'Sertraline','50mg','daily');
INSERT INTO public.health_documents (id,user_id,file_path,file_name,title)
VALUES (:DOC,:P,'a0000000-0000-0000-0000-00000000000a/psych-eval.pdf','psych-eval.pdf','Psychiatric evaluation');
INSERT INTO public.provider_shares (id,user_id,clinician_user_id,provider_email,provider_name,invite_code)   -- default perms: no 'documents'
VALUES ('a0000000-0000-0000-0000-0000000000e1',:P,:C,'c@t.local','Dr C','INV-TEST-1');

SELECT set_config('request.jwt.claim.sub', :D, true);
WITH e AS (INSERT INTO public.encounters (patient_user_id,clinician_user_id,practice_id,assessment)
           VALUES (:P,:D,:X,'ENC: depression') RETURNING id)
INSERT INTO public.encounter_addenda (encounter_id,author_user_id,body) SELECT id,:D,'ADDENDUM: SI screen negative' FROM e;
INSERT INTO public.clinician_guidance (clinician_user_id,patient_user_id,title,instruction) VALUES (:D,:P,'Taper','Reduce dose');
INSERT INTO public.internal_notes (patient_user_id,author_user_id,body,visibility) VALUES (:P,:D,'Team note','team');
WITH cp AS (INSERT INTO public.fhir_care_plans (patient_user_id,practice_id,title,status,created_by)
            VALUES (:P,:X,'Depression plan','active',:D) RETURNING id)
INSERT INTO public.fhir_care_goals (care_plan_id,description) SELECT id,'PHQ-9 below 10' FROM cp;
INSERT INTO public.clinician_patient_records
  (clinician_user_id,practice_id,patient_name,date_of_birth,health_conditions,medications,notes,linked_user_id)
VALUES (:D,:X,'Pat Example','1980-01-01','["major depressive disorder"]','[{"name":"Sertraline"}]','Staging note',:P);
RESET ROLE;
INSERT INTO storage.objects (bucket_id,name,owner) VALUES
 ('health-documents','a0000000-0000-0000-0000-00000000000a/psych-eval.pdf',:P),
 ('medication-photos','a0000000-0000-0000-0000-00000000000a/pill.jpg',:P),
 ('voice-notes','a0000000-0000-0000-0000-00000000000a/note.webm',:P),
 ('clinician-avatars','a0000000-0000-0000-0000-00000000000b/avatar.png',:D);

\echo '=== A: front_desk F with an assignment row; billing B'
SELECT set_config('request.jwt.claim.sub', :F, true);
SET LOCAL ROLE authenticated;
SELECT current_user, auth.uid();
SELECT 'F encounters' t, count(*) FROM public.encounters WHERE patient_user_id=:P
UNION ALL SELECT 'F encounter_addenda', count(*) FROM public.encounter_addenda
UNION ALL SELECT 'F clinician_patient_records', count(*) FROM public.clinician_patient_records
UNION ALL SELECT 'F clinician_guidance (ctl)', count(*) FROM public.clinician_guidance
UNION ALL SELECT 'F internal_notes (ctl)', count(*) FROM public.internal_notes
UNION ALL SELECT 'F fhir_care_plans (ctl)', count(*) FROM public.fhir_care_plans
UNION ALL SELECT 'F fhir_care_goals (ctl)', count(*) FROM public.fhir_care_goals
UNION ALL SELECT 'F storage health-documents (ctl)', count(*) FROM storage.objects WHERE bucket_id='health-documents';
SELECT health_conditions, medications, notes FROM public.clinician_patient_records;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :B, true);
SET LOCAL ROLE authenticated;
SELECT 'B(billing) medications' t, count(*) FROM public.medications WHERE user_id=:P
UNION ALL SELECT 'B clinician_patient_records', count(*) FROM public.clinician_patient_records;
RESET ROLE;

\echo '=== clinical control: provider D sees the same fixtures'
SELECT set_config('request.jwt.claim.sub', :D, true);
SET LOCAL ROLE authenticated;
SELECT 'D guidance' t, count(*) FROM public.clinician_guidance UNION ALL SELECT 'D internal_notes', count(*) FROM public.internal_notes
UNION ALL SELECT 'D care_plans', count(*) FROM public.fhir_care_plans UNION ALL SELECT 'D care_goals', count(*) FROM public.fhir_care_goals;
RESET ROLE;

\echo '=== E: storage, clinician C (provider share without documents)'
SELECT set_config('request.jwt.claim.sub', :C, true);
SET LOCAL ROLE authenticated;
SELECT 'C vault objects, no doc share' t, count(*) FROM storage.objects WHERE bucket_id='health-documents';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :P, true);
INSERT INTO public.document_shares (document_id,user_id,provider_share_id) VALUES (:DOC,:P,'a0000000-0000-0000-0000-0000000000e1');
SELECT set_config('request.jwt.claim.sub', :C, true);
SET LOCAL ROLE authenticated;
SELECT 'C vault objects, per-document share' t, count(*) FROM storage.objects WHERE bucket_id='health-documents';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :P, true);
UPDATE public.provider_shares SET is_active=false, revoked_at=now() WHERE id='a0000000-0000-0000-0000-0000000000e1' RETURNING is_active;
SELECT set_config('request.jwt.claim.sub', :C, true);
SET LOCAL ROLE authenticated;
SELECT 'C vault objects, after revoke' t, count(*) FROM storage.objects WHERE bucket_id='health-documents';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SET LOCAL ROLE anon;
SELECT 'anon visible objects' t, bucket_id, count(*) FROM storage.objects GROUP BY bucket_id;
RESET ROLE;

\echo '=== F: patient revokes the practice share'
SELECT set_config('request.jwt.claim.sub', :P, true);
UPDATE public.practice_shares SET is_active=false, revoked_at=now() WHERE user_id=:P RETURNING is_active;
SELECT set_config('request.jwt.claim.sub', :F, true);
SET LOCAL ROLE authenticated;
SELECT 'F medications after revoke' t, count(*) FROM public.medications WHERE user_id=:P
UNION ALL SELECT 'F encounters after revoke', count(*) FROM public.encounters WHERE patient_user_id=:P
UNION ALL SELECT 'F clinician_patient_records after revoke', count(*) FROM public.clinician_patient_records;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :R, true);
SET LOCAL ROLE authenticated;
SELECT 'R encounters after revoke' t, count(*) FROM public.encounters WHERE patient_user_id=:P;
RESET ROLE;
ROLLBACK;
