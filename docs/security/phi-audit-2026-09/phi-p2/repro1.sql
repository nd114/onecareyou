\set ON_ERROR_STOP 1
\pset footer off
BEGIN;
-- ids
\set P  '''a0000000-0000-0000-0000-00000000000a'''
\set D  '''a0000000-0000-0000-0000-00000000000b'''
\set F  '''a0000000-0000-0000-0000-00000000000c'''
\set R  '''a0000000-0000-0000-0000-00000000000d'''
\set Q  '''a0000000-0000-0000-0000-00000000000e'''
\set O  '''a0000000-0000-0000-0000-00000000000f'''
\set X  '''a0000000-0000-0000-0000-0000000000c1'''

INSERT INTO auth.users (id,email,email_confirmed_at) VALUES
 (:P,'p@t.local',now()),(:D,'d@t.local',now()),(:F,'fd@t.local',now()),
 (:R,'r@t.local',now()),(:Q,'q@t.local',now()),(:O,'o@t.local',now());

SELECT set_config('request.jwt.claim.sub', :O, true);
INSERT INTO public.practices (id,name,created_by) VALUES (:X,'Test Practice',:O);
INSERT INTO public.practice_members (practice_id,user_id,role,status) VALUES
 (:X,:D,'provider','active'),
 (:X,:F,'front_desk','active'),
 (:X,:R,'provider','revoked');   -- what usePractice.removeMember writes

SELECT set_config('request.jwt.claim.sub', :P, true);
INSERT INTO public.practice_shares (practice_id,user_id) VALUES (:X,:P);   -- all defaults
INSERT INTO public.practice_patient_assignments (practice_id,patient_user_id,clinician_user_id,assigned_by)
VALUES (:X,:P,:R,:O);   -- assigned while R was still a member; nothing ends it on removal

WITH m AS (INSERT INTO public.medications (user_id,name,dosage,frequency)
           VALUES (:P,'Sertraline','50mg','daily') RETURNING id)
INSERT INTO public.schedule_entries (user_id,medication_id,scheduled_time,status)
SELECT :P, id, now(), 'missed' FROM m;
INSERT INTO public.health_documents (user_id,file_path,file_name,title)
VALUES (:P, 'a0000000-0000-0000-0000-00000000000a/psych-eval.pdf','psych-eval.pdf','Psychiatric evaluation');
INSERT INTO public.vitals (user_id,type,value,unit,recorded_at) VALUES (:P,'blood_pressure',128,'mmHg',now());

SELECT set_config('request.jwt.claim.sub', :D, true);
INSERT INTO public.encounters (patient_user_id,clinician_user_id,practice_id,assessment)
VALUES (:P,:D,:X,'ENC: depression, started sertraline');

SELECT set_config('request.jwt.claim.sub', :Q, true);
INSERT INTO public.health_documents (id,user_id,file_path,file_name)
VALUES ('a0000000-0000-0000-0000-0000000000d1',:Q,'a0000000-0000-0000-0000-00000000000e/lab.pdf','lab.pdf');
RESET ROLE;
INSERT INTO public.document_retraction_events
 (document_id,file_name,storage_path,sending_practice_id,sending_clinician_id,actual_recipient_id,
  authority_used,reason_code,internal_note,incident_ref)
VALUES ('a0000000-0000-0000-0000-0000000000d1','lab.pdf','a0000000-0000-0000-0000-00000000000e/lab.pdf',:X,:D,:Q,
  'sender','wrong_recipient','INTERNAL: meant for Jane Roe (DOB 1971-02-03), same surname','INC-2026-014');

-- readback: fixture values survived triggers
SELECT user_id, role, status, can_view_all_patients FROM public.practice_members WHERE practice_id=:X ORDER BY role;
SELECT share_all, is_active, practice_suspended_at FROM public.practice_shares WHERE user_id=:P;

\echo '=== T1: front_desk member F, active, default scope'
SELECT set_config('request.jwt.claim.sub', :F, true);
SET LOCAL ROLE authenticated;
SELECT current_user, auth.uid();
SELECT 'medications' AS tbl, count(*) FROM public.medications WHERE user_id=:P
UNION ALL SELECT 'schedule_entries', count(*) FROM public.schedule_entries WHERE user_id=:P
UNION ALL SELECT 'health_documents', count(*) FROM public.health_documents WHERE user_id=:P
UNION ALL SELECT 'vitals (control)', count(*) FROM public.vitals WHERE user_id=:P
UNION ALL SELECT 'encounters (control)', count(*) FROM public.encounters WHERE patient_user_id=:P;
SELECT name, dosage FROM public.medications WHERE user_id=:P;
SELECT status FROM public.schedule_entries WHERE user_id=:P;
SELECT title, file_name FROM public.health_documents WHERE user_id=:P;
RESET ROLE;

\echo '=== T2: removed clinician R (status=revoked), assignment left in place'
SELECT set_config('request.jwt.claim.sub', :R, true);
SET LOCAL ROLE authenticated;
SELECT current_user, auth.uid(), public.is_practice_member(:X) AS is_member;
SELECT 'encounters' AS tbl, count(*), max(assessment) FROM public.encounters WHERE patient_user_id=:P
UNION ALL SELECT 'medications (control)', count(*), NULL FROM public.medications WHERE user_id=:P;
RESET ROLE;

\echo '=== T3: misdirected recipient Q'
SELECT set_config('request.jwt.claim.sub', :Q, true);
SET LOCAL ROLE authenticated;
SELECT current_user, auth.uid();
SELECT count(*) AS intended_view_rows FROM public.my_withdrawn_documents;
SELECT internal_note, incident_ref, storage_path FROM public.document_retraction_events;
SELECT internal_note, audit_description, is_privacy_incident FROM public.practice_withdrawal_register;
RESET ROLE;
ROLLBACK;
