-- Guidance, once sent, is permanent; and OneCare's own evidence outlives the
-- account it is evidence about.
--
-- Guidance. A clinician could delete guidance the patient had not yet
-- acknowledged, on the reasoning that nobody had seen it. Not acknowledged is
-- not unseen, and not unseen is not undone: the patient may already have acted
-- on it. So nobody deletes guidance, and a clinician who issued it in error
-- withdraws it with a reason. The row stays, marked who withdrew it, when and
-- why; the patient is told; the care record snapshot shows it withdrawn. A
-- change to what was said is a new, linked instruction, never a rewrite of the
-- one the patient received.
--
-- Evidence. legal_acceptances, consent_logs and baa_agreements cascaded from
-- auth.users, so deleting an account deleted the proof of what that person had
-- agreed to — the evidence OneCare would need if the agreement were ever in
-- dispute. beta_nda_signatures cascaded from the tester's row in the same way.
-- They now survive the account, unlinked, carrying a hash of the account id
-- and of the email so they can still be matched to the person who presents
-- them.
--
-- Failures are collected, so one run names every broken rule.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(_condition boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _condition IS NOT TRUE THEN
    PERFORM set_config('onecare_test.failures',
      COALESCE(current_setting('onecare_test.failures', true), '') || E'\n    ' || _label, true);
    RAISE NOTICE '  FAILED — %', _label;
  ELSE
    RAISE NOTICE '  ok — %', _label;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', COALESCE(_uid::text, ''), true);
  IF _uid IS NOT NULL THEN EXECUTE 'SET LOCAL ROLE authenticated'; END IF;
END;
$$;

-- Run a statement and report whether it went through. The assertions check
-- what is left, not the error, because RLS refuses by affecting nothing.
CREATE OR REPLACE FUNCTION pg_temp.try(_sql text) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.sha(_t text) RETURNS text
LANGUAGE sql AS $$ SELECT encode(sha256(convert_to(_t, 'UTF8')), 'hex') $$;

SELECT set_config('onecare_test.failures', '', false);

DO $$
DECLARE
  _dr     uuid := 'ae000000-0000-4000-8000-0000000000d1';  -- issuing clinician
  _dr2    uuid := 'ae000000-0000-4000-8000-0000000000d2';  -- another clinician
  _pat    uuid := 'ae000000-0000-4000-8000-0000000000a1';
  _gone_p uuid := 'ae000000-0000-4000-8000-0000000000a9';  -- patient whose account goes
  _gone_d uuid := 'ae000000-0000-4000-8000-0000000000d9';  -- clinician whose account goes
  _share  uuid;
  _g1     uuid;
  _g2     uuid;
  _g3     uuid;
  _new    uuid;
  _job    uuid;
  _doc    uuid;
  _id     uuid;
  _id2    uuid;
  _id3    uuid;
  _tester uuid;
  _nda    uuid;
  _n      integer;
  _ok     boolean;
  _txt    text;
  _html   text;
  _rec    record;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_dr,     'gek-dr@test.local',     now()),
    (_dr2,    'gek-dr2@test.local',    now()),
    (_pat,    'gek-pat@test.local',    now()),
    (_gone_p, 'Gek-Gone-Pat@Test.local', now()),
    (_gone_d, 'gek-gone-dr@test.local', now());
  INSERT INTO public.profiles (user_id, name, email)
  SELECT id, split_part(email, '@', 1), email FROM auth.users WHERE id IN (_dr, _dr2, _pat, _gone_p, _gone_d)
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email;
  INSERT INTO public.clinician_profiles (user_id, title, first_name, last_name)
  VALUES (_dr, 'Dr', 'Grace', 'Keeper'), (_dr2, 'Dr', 'Other', 'One'), (_gone_d, 'Dr', 'Gone', 'Away')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.provider_shares (user_id, provider_name, provider_email, invite_code, clinician_user_id, is_active, permissions)
  VALUES (_pat, 'Dr Keeper', 'gek-dr@test.local', 'GEK-SHARE', _dr, true, '{}') RETURNING id INTO _share;

  -- The clinician issues three instructions the ordinary way.
  PERFORM pg_temp.as_user(_dr);
  INSERT INTO public.clinician_guidance (clinician_user_id, patient_user_id, share_id, title, instruction)
  VALUES (_dr, _pat, _share, 'Halve the dose', 'Take 5 mg instead of 10 mg.') RETURNING id INTO _g1;
  INSERT INTO public.clinician_guidance (clinician_user_id, patient_user_id, share_id, title, instruction)
  VALUES (_dr, _pat, _share, 'Walk daily', 'Twenty minutes every day.') RETURNING id INTO _g2;
  INSERT INTO public.clinician_guidance (clinician_user_id, patient_user_id, share_id, title, instruction)
  VALUES (_dr, _pat, _share, 'Low salt', 'Keep salt under 5 g a day.') RETURNING id INTO _g3;
  PERFORM pg_temp.as_user(_pat);
  UPDATE public.clinician_guidance SET status = 'acknowledged', acknowledged_at = now() WHERE id = _g2;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_g1 IS NOT NULL AND _g2 IS NOT NULL AND _g3 IS NOT NULL, 'fixture: the guidance was issued');
  PERFORM pg_temp.assert((SELECT acknowledged_at FROM public.clinician_guidance WHERE id = _g2) IS NOT NULL,
    'fixture: the patient can still acknowledge guidance');

  -- ==========================================================================
  -- G1. Nobody deletes guidance, acknowledged or not
  -- ==========================================================================
  PERFORM pg_temp.as_user(_dr);
  PERFORM pg_temp.try(format('DELETE FROM public.clinician_guidance WHERE id = %L', _g1));
  PERFORM pg_temp.try(format('DELETE FROM public.clinician_guidance WHERE id = %L', _g2));
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert((SELECT count(*) FROM public.clinician_guidance WHERE id = _g1) = 1,
    'G1a the clinician cannot delete guidance the patient has not acknowledged');
  PERFORM pg_temp.assert((SELECT count(*) FROM public.clinician_guidance WHERE id = _g2) = 1,
    'G1b nor guidance the patient has acknowledged');

  PERFORM pg_temp.as_user(_pat);
  PERFORM pg_temp.try(format('DELETE FROM public.clinician_guidance WHERE id = %L', _g1));
  PERFORM pg_temp.try(format('DELETE FROM public.clinician_guidance WHERE id = %L', _g2));
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert((SELECT count(*) FROM public.clinician_guidance WHERE id IN (_g1, _g2)) = 2,
    'G1c the patient cannot delete guidance either');

  _ok := pg_temp.try(format('DELETE FROM public.clinician_guidance WHERE id = %L', _g1));
  PERFORM pg_temp.assert(NOT _ok AND (SELECT count(*) FROM public.clinician_guidance WHERE id = _g1) = 1,
    'G1d nor the platform: a delete with no signed-in user is refused too');

  -- ==========================================================================
  -- G2. Nobody rewrites what was sent, or fakes a withdrawal
  -- ==========================================================================
  PERFORM pg_temp.as_user(_dr);
  PERFORM pg_temp.try(format('UPDATE public.clinician_guidance SET instruction = %L WHERE id = %L', 'Take 2.5 mg.', _g1));
  PERFORM pg_temp.try(format('UPDATE public.clinician_guidance SET title = %L WHERE id = %L', 'Something else', _g1));
  PERFORM pg_temp.as_user(NULL);
  SELECT title, instruction INTO _rec FROM public.clinician_guidance WHERE id = _g1;
  PERFORM pg_temp.assert(_rec.instruction = 'Take 5 mg instead of 10 mg.' AND _rec.title = 'Halve the dose',
    'G2a the clinician cannot rewrite guidance the patient has received');

  PERFORM pg_temp.as_user(_dr);
  PERFORM pg_temp.try(format('UPDATE public.clinician_guidance SET status = %L WHERE id = %L', 'archived', _g1));
  PERFORM pg_temp.try(format('UPDATE public.clinician_guidance SET acknowledged_at = NULL, status = %L WHERE id = %L', 'pending', _g2));
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert((SELECT status FROM public.clinician_guidance WHERE id = _g1) = 'pending',
    'G2b a clinician cannot withdraw by setting the status, without a reason on the record');
  PERFORM pg_temp.assert((SELECT acknowledged_at FROM public.clinician_guidance WHERE id = _g2) IS NOT NULL,
    'G2c a clinician cannot undo the patient''s acknowledgement');

  PERFORM pg_temp.as_user(_pat);
  PERFORM pg_temp.try(format('UPDATE public.clinician_guidance SET status = %L WHERE id = %L', 'archived', _g3));
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert((SELECT status FROM public.clinician_guidance WHERE id = _g3) = 'pending',
    'G2d a patient cannot make guidance look withdrawn by their clinician');

  -- ==========================================================================
  -- G3. Withdrawal: only the issuer, only with a reason
  -- ==========================================================================
  PERFORM pg_temp.as_user(_dr);
  _ok := pg_temp.try(format('SELECT public.withdraw_guidance(%L, %L)', _g1, '   '));
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(NOT _ok, 'G3a a withdrawal without a reason is refused');

  PERFORM pg_temp.as_user(_dr2);
  _ok := pg_temp.try(format('SELECT public.withdraw_guidance(%L, %L)', _g1, 'Not mine'));
  PERFORM pg_temp.as_user(_pat);
  _ok := _ok OR pg_temp.try(format('SELECT public.withdraw_guidance(%L, %L)', _g1, 'I disagree'));
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(NOT _ok AND (SELECT withdrawn_at FROM public.clinician_guidance WHERE id = _g1) IS NULL,
    'G3b nobody but the clinician who issued it can withdraw it');

  PERFORM pg_temp.as_user(_dr);
  PERFORM public.withdraw_guidance(_g1, 'Dose change was meant for another patient.');
  PERFORM pg_temp.as_user(NULL);
  SELECT * INTO _rec FROM public.clinician_guidance WHERE id = _g1;
  PERFORM pg_temp.assert(_rec.withdrawn_at IS NOT NULL AND _rec.withdrawn_by = _dr
    AND _rec.withdrawal_reason = 'Dose change was meant for another patient.' AND _rec.status = 'archived',
    'G3c withdrawing records who, when and why, and the row stays');
  PERFORM pg_temp.assert(_rec.instruction = 'Take 5 mg instead of 10 mg.',
    'G3d the withdrawn instruction is kept as it was sent');

  SELECT count(*), max(message) INTO _n, _txt FROM public.patient_notices
   WHERE patient_user_id = _pat AND notice_type = 'guidance_withdrawn' AND related_id = _g1;
  PERFORM pg_temp.assert(_n = 1, 'G3e the patient is notified of the withdrawal');
  PERFORM pg_temp.assert(_txt LIKE '%Dr Grace Keeper%' AND _txt LIKE '%Halve the dose%'
    AND _txt LIKE '%meant for another patient%', 'G3f the notice names who, what and why');

  -- G4. The patient sees it, withdrawn.
  PERFORM pg_temp.as_user(_pat);
  SELECT status, withdrawn_at, withdrawn_by, withdrawal_reason INTO _rec
    FROM public.clinician_guidance WHERE id = _g1;
  SELECT count(*) INTO _n FROM public.patient_notices WHERE related_id = _g1;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_rec.status = 'archived' AND _rec.withdrawn_at IS NOT NULL AND _rec.withdrawn_by = _dr
    AND _rec.withdrawal_reason IS NOT NULL, 'G4a the patient reads the guidance with its withdrawal');
  PERFORM pg_temp.assert(_n = 1, 'G4b and reads the notice');

  -- G5. A withdrawal is final.
  PERFORM pg_temp.as_user(_dr);
  _ok := pg_temp.try(format('SELECT public.withdraw_guidance(%L, %L)', _g1, 'again'));
  PERFORM pg_temp.try(format('UPDATE public.clinician_guidance SET status = %L WHERE id = %L', 'pending', _g1));
  PERFORM pg_temp.as_user(_pat);
  PERFORM pg_temp.try(format('UPDATE public.clinician_guidance SET status = %L, acknowledged_at = now() WHERE id = %L', 'acknowledged', _g1));
  PERFORM pg_temp.as_user(NULL);
  _ok := _ok OR pg_temp.try(format('UPDATE public.clinician_guidance SET withdrawn_at = NULL, withdrawal_reason = NULL, status = %L WHERE id = %L', 'pending', _g1));
  SELECT * INTO _rec FROM public.clinician_guidance WHERE id = _g1;
  PERFORM pg_temp.assert(NOT _ok AND _rec.status = 'archived' AND _rec.withdrawn_at IS NOT NULL
    AND _rec.acknowledged_at IS NULL AND _rec.withdrawal_reason = 'Dose change was meant for another patient.',
    'G5 a withdrawal cannot be withdrawn again, reversed or cleared, by anyone');

  -- ==========================================================================
  -- G6. Amending issues a new instruction and withdraws the old one
  -- ==========================================================================
  DELETE FROM public.hipaa_audit_logs WHERE resource_id IN (_g3::text);
  PERFORM pg_temp.as_user(_dr);
  _new := public.amend_guidance(_g3, 'Low salt', 'Keep salt under 6 g a day.', 'Target revised after bloods.');
  PERFORM pg_temp.as_user(NULL);
  SELECT * INTO _rec FROM public.clinician_guidance WHERE id = _new;
  PERFORM pg_temp.assert(_rec.supersedes_guidance_id = _g3 AND _rec.instruction = 'Keep salt under 6 g a day.'
    AND _rec.status = 'pending' AND _rec.share_id = _share, 'G6a the amendment is a new instruction linked to the old');
  SELECT * INTO _rec FROM public.clinician_guidance WHERE id = _g3;
  PERFORM pg_temp.assert(_rec.instruction = 'Keep salt under 5 g a day.' AND _rec.withdrawn_at IS NOT NULL
    AND _rec.withdrawal_reason LIKE '%Target revised after bloods.%', 'G6b the original stays as sent, withdrawn with the reason');
  SELECT count(*) INTO _n FROM public.hipaa_audit_logs
   WHERE action = 'guidance_issued_updated' AND resource_id = _g3::text AND user_id = _dr;
  PERFORM pg_temp.assert(_n = 1, 'G6c the amendment is in the audit log under the clinician');
  PERFORM pg_temp.as_user(_dr2);
  _ok := pg_temp.try(format('SELECT public.amend_guidance(%L, %L, %L, %L)', _g2, 'x', 'y', 'z'));
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(NOT _ok, 'G6d only the issuer can amend');

  -- ==========================================================================
  -- G7. The care record snapshot shows it withdrawn
  -- ==========================================================================
  PERFORM pg_temp.as_user(_pat);
  _job := public.request_care_record_snapshot(_share);
  PERFORM pg_temp.as_user(NULL);
  _html := public.compile_care_record_snapshot(_job) ->> 'html';
  PERFORM pg_temp.assert(_html LIKE '%Halve the dose%' AND _html LIKE '%Take 5 mg instead of 10 mg.%',
    'G7a the withdrawn instruction is still in the care record');
  PERFORM pg_temp.assert(_html LIKE '%Withdrawn by Dr Grace Keeper on %' AND _html LIKE '%meant for another patient.%',
    'G7b marked withdrawn, by whom, and why');
  PERFORM pg_temp.assert(_html LIKE '%Walk daily%' AND _html LIKE '%Keep salt under 6 g a day.%',
    'G7c alongside the guidance that stands');

  -- ==========================================================================
  -- E. OneCare's own evidence survives the account it is about
  -- ==========================================================================
  INSERT INTO public.legal_documents (type, version, content, effective_date)
  VALUES ('terms', 'gek-1', 'Terms', now()) RETURNING id INTO _doc;

  PERFORM pg_temp.as_user(_gone_p);
  INSERT INTO public.legal_acceptances (user_id, document_id) VALUES (_gone_p, _doc) RETURNING id INTO _id;
  INSERT INTO public.consent_logs (user_id, consent_type, action, new_value)
  VALUES (_gone_p, 'marketing', 'granted', true) RETURNING id INTO _id2;
  PERFORM pg_temp.as_user(_gone_d);
  INSERT INTO public.baa_agreements (clinician_user_id, practice_name, contact_name, contact_email, agreement_version)
  VALUES (_gone_d, 'Gone Practice', 'Dr Gone', 'gek-gone-dr@test.local', 'baa-1') RETURNING id INTO _id3;
  PERFORM pg_temp.as_user(NULL);

  -- E1. The account holder cannot remove or alter their own evidence.
  PERFORM pg_temp.as_user(_gone_p);
  PERFORM pg_temp.try(format('DELETE FROM public.legal_acceptances WHERE id = %L', _id));
  PERFORM pg_temp.try(format('UPDATE public.consent_logs SET new_value = false WHERE id = %L', _id2));
  PERFORM pg_temp.as_user(_gone_d);
  PERFORM pg_temp.try(format('DELETE FROM public.baa_agreements WHERE id = %L', _id3));
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert((SELECT count(*) FROM public.legal_acceptances WHERE id = _id) = 1
    AND (SELECT new_value FROM public.consent_logs WHERE id = _id2)
    AND (SELECT count(*) FROM public.baa_agreements WHERE id = _id3) = 1,
    'E1 nobody signed in can delete or alter an acceptance, a consent log or a BAA');

  -- Other evidence written about the same people, which has no key to them.
  INSERT INTO public.hipaa_audit_logs (user_id, action, resource_type, resource_id, patient_user_id)
  VALUES (_gone_d, 'view_patient', 'patient', _gone_p::text, _gone_p);
  INSERT INTO public.access_audit_logs (action, actor_user_id, target_user_id) VALUES ('view', _gone_d, _gone_p);
  INSERT INTO public.platform_admin_actions (actor_user_id, action, target_type, target_id)
  VALUES (_gone_d, 'gek_test', 'user', _gone_p);

  -- E2. The accounts go, as the dashboard or the service role would do it.
  DELETE FROM auth.users WHERE id IN (_gone_p, _gone_d);
  PERFORM pg_temp.assert((SELECT count(*) FROM auth.users WHERE id IN (_gone_p, _gone_d)) = 0,
    'E2 fixture: both accounts really were deleted');

  SELECT * INTO _rec FROM public.legal_acceptances WHERE id = _id;
  PERFORM pg_temp.assert(_rec.id IS NOT NULL, 'E2a the terms acceptance survives the account');
  PERFORM pg_temp.assert(_rec.user_id IS NULL AND _rec.document_id = _doc AND _rec.accepted_at IS NOT NULL,
    'E2b unlinked from the account, keeping the document version and when');
  PERFORM pg_temp.assert(_rec.subject_id_sha256 = pg_temp.sha(_gone_p::text)
    AND _rec.subject_email_sha256 = pg_temp.sha('gek-gone-pat@test.local'),
    'E2c and still attributable: the hashes of the account id and the lower-cased email');

  SELECT * INTO _rec FROM public.consent_logs WHERE id = _id2;
  PERFORM pg_temp.assert(_rec.id IS NOT NULL AND _rec.user_id IS NULL
    AND _rec.subject_id_sha256 = pg_temp.sha(_gone_p::text) AND _rec.consent_type = 'marketing',
    'E2d the consent log survives, attributable');

  SELECT * INTO _rec FROM public.baa_agreements WHERE id = _id3;
  PERFORM pg_temp.assert(_rec.id IS NOT NULL AND _rec.clinician_user_id IS NULL
    AND _rec.subject_email_sha256 = pg_temp.sha('gek-gone-dr@test.local') AND _rec.agreement_version = 'baa-1',
    'E2e the BAA survives the clinician''s account, attributable');

  PERFORM pg_temp.assert((SELECT count(*) FROM public.hipaa_audit_logs WHERE user_id = _gone_d AND action = 'view_patient') = 1
    AND (SELECT count(*) FROM public.access_audit_logs WHERE actor_user_id = _gone_d) = 1
    AND (SELECT count(*) FROM public.platform_admin_actions WHERE actor_user_id = _gone_d AND action = 'gek_test') = 1,
    'E2f the audit logs and admin action log survive the accounts they name');

  -- E3. A signed NDA outlives the beta tester's row.
  INSERT INTO public.beta_testers (full_name, email) VALUES ('Gek Tester', 'gek-tester@test.local') RETURNING id INTO _tester;
  INSERT INTO public.beta_nda_signatures (tester_id, signed_name, email, nda_version, affirmed)
  VALUES (_tester, 'Gek Tester', 'gek-tester@test.local', 'nda-1', true) RETURNING id INTO _nda;
  DELETE FROM public.beta_testers WHERE id = _tester;
  PERFORM pg_temp.assert((SELECT count(*) FROM public.beta_nda_signatures WHERE id = _nda AND tester_id IS NULL
    AND signed_name = 'Gek Tester' AND nda_version = 'nda-1') = 1,
    'E3 a signed NDA survives the tester''s row being removed');

  PERFORM pg_temp.as_user(NULL);
  IF current_setting('onecare_test.failures', true) <> '' THEN
    RAISE EXCEPTION 'guidance_and_evidence_are_kept FAILED:%', current_setting('onecare_test.failures', true);
  END IF;
  RAISE NOTICE 'guidance_and_evidence_are_kept: all assertions passed';
END $$;

ROLLBACK;
