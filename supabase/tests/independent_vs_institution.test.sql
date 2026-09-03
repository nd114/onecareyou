-- The independent clinician, the hospital, and the person who is both.
--
-- OneCare has to work for a doctor with their own patients, for a hospital with
-- a roster, and — the case that actually breaks things — for a doctor who has
-- both: their own list, and a job at a hospital that has its own list.
--
-- Two pathways grant access and they must not bleed into each other:
--
--   clinician_has_patient_access   the patient invited *this person*
--   institution_has_patient_access the patient shared with a *practice*, and
--                                  this person is an active member of it
--
-- The failures worth designing against, each asserted below: a hospital seeing
-- a doctor's private patients because the doctor works there; a doctor losing
-- their own patients because they left a job; one hospital's assignment
-- granting access at another; and a patient ending one relationship
-- accidentally ending the other.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/independent_vs_institution.test.sql

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(_condition boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _condition IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', _label; END IF;
  RAISE NOTICE '  ok — %', _label;
END;
$$;

DO $$
DECLARE
  -- Dr Nair: her own practice list, and a post at City General.
  _nair      uuid := 'd1000000-0000-0000-0000-000000000001';
  -- Another doctor at City General, with no personal relationships.
  _colleague uuid := 'd1000000-0000-0000-0000-000000000002';
  -- A doctor at a different hospital entirely.
  _outsider  uuid := 'd1000000-0000-0000-0000-000000000003';
  _owner     uuid := 'd1000000-0000-0000-0000-000000000004';

  -- Her own patient, who has never heard of City General.
  _private   uuid := 'd1000000-0000-0000-0000-00000000000a';
  -- City General's patient, who has never met Dr Nair personally.
  _hospital  uuid := 'd1000000-0000-0000-0000-00000000000b';

  _city   uuid := 'd1000000-0000-0000-0000-0000000000c1';
  _other  uuid := 'd1000000-0000-0000-0000-0000000000c2';
  _ok boolean;
BEGIN
  INSERT INTO auth.users (id,email) VALUES
    (_nair,'nair@test.local'), (_colleague,'colleague@test.local'),
    (_outsider,'outsider@test.local'), (_owner,'owner@test.local'),
    (_private,'private@test.local'), (_hospital,'hospital@test.local');

  INSERT INTO public.practices (id, name, created_by, tenant_type) VALUES
    (_city,'City General',_owner,'hospital'),
    (_other,'Other Hospital',_owner,'hospital');

  -- Dr Nair works at City General, and can see its whole roster.
  INSERT INTO public.practice_members (practice_id, user_id, role, status, can_view_all_patients)
  VALUES (_city,_nair,'provider','active',true),
         (_city,_colleague,'provider','active',true),
         (_other,_outsider,'provider','active',true);

  -- Her own patient invited her personally. No hospital involved.
  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES (_private,_nair,'Dr Nair','nair@test.local','ivi001','{"profile":true}'::jsonb,true);

  -- City General's patient shared with the hospital, not with any individual.
  INSERT INTO public.practice_shares (practice_id, user_id, is_active)
  VALUES (_city,_hospital,true);

  -- ==========================================================================
  -- 1. A hospital does not inherit a doctor's private list
  --
  -- The failure this prevents: a doctor takes a post, and the hospital quietly
  -- gains access to patients who never agreed to be seen by it.
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _colleague::text, true);
  PERFORM pg_temp.assert(
    public.institution_has_patient_access(_private) = false,
    'a colleague at the hospital cannot reach Dr Nair''s own patient');
  PERFORM pg_temp.assert(
    public.clinician_has_patient_access(_private) = false,
    'nor through the personal pathway, which is not theirs');

  -- Even the hospital owner, who can see everything the hospital was given.
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM pg_temp.assert(
    public.institution_has_patient_access(_private) = false,
    'nor can the hospital owner — the patient shared with a person, not a place');

  -- ==========================================================================
  -- 2. A doctor does not gain a hospital's list personally
  --
  -- The mirror failure: working somewhere does not make its patients yours in
  -- the sense the patient meant when they invited a clinician directly.
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _nair::text, true);
  PERFORM pg_temp.assert(
    public.clinician_has_patient_access(_hospital) = false,
    'the hospital''s patient is not Dr Nair''s personal patient');
  PERFORM pg_temp.assert(
    public.institution_has_patient_access(_hospital) = true,
    'but she reaches them as a member of the hospital, which is what they agreed to');

  -- ==========================================================================
  -- 3. Both hats at once, and each still means only itself
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _nair::text, true);
  PERFORM pg_temp.assert(
    public.clinician_has_patient_access(_private) = true,
    'she reaches her own patient personally');
  PERFORM pg_temp.assert(
    public.institution_has_patient_access(_private) = false,
    'and not via the hospital, which was never given them');

  -- ==========================================================================
  -- 4. Another hospital's membership grants nothing here
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _outsider::text, true);
  PERFORM pg_temp.assert(
    public.institution_has_patient_access(_hospital) = false,
    'a doctor at another hospital reaches nothing of City General''s');
  PERFORM pg_temp.assert(
    public.clinician_has_patient_access(_hospital) = false,
    'and nothing personally either');

  -- ==========================================================================
  -- 5. Leaving the job does not take your own patients with it
  --
  -- This is the one that decides whether an independent clinician can safely
  -- adopt the platform: if a hospital could end their personal relationships by
  -- ending their employment, the patient's own invitation would mean nothing.
  -- ==========================================================================
  UPDATE public.practice_members SET status = 'inactive'
   WHERE practice_id = _city AND user_id = _nair;

  PERFORM set_config('request.jwt.claim.sub', _nair::text, true);
  PERFORM pg_temp.assert(
    public.institution_has_patient_access(_hospital) = false,
    'once she leaves, the hospital''s patients are no longer hers to see');
  PERFORM pg_temp.assert(
    public.clinician_has_patient_access(_private) = true,
    'but her own patient is still hers — they invited her, not her employer');

  UPDATE public.practice_members SET status = 'active'
   WHERE practice_id = _city AND user_id = _nair;

  -- ==========================================================================
  -- 6. Ending one relationship does not end the other
  --
  -- A patient with both — their own doctor, and a hospital — must be able to
  -- leave one without silently leaving the other.
  -- ==========================================================================
  INSERT INTO public.practice_shares (practice_id, user_id, is_active)
  VALUES (_city,_private,true);

  PERFORM set_config('request.jwt.claim.sub', _colleague::text, true);
  PERFORM pg_temp.assert(
    public.institution_has_patient_access(_private) = true,
    'a patient may share with a hospital as well as with their own doctor');

  PERFORM set_config('request.jwt.claim.sub', _private::text, true);
  UPDATE public.practice_shares SET is_active = false
   WHERE practice_id = _city AND user_id = _private;

  PERFORM set_config('request.jwt.claim.sub', _colleague::text, true);
  PERFORM pg_temp.assert(
    public.institution_has_patient_access(_private) = false,
    'ending the hospital share ends the hospital''s access');

  PERFORM set_config('request.jwt.claim.sub', _nair::text, true);
  PERFORM pg_temp.assert(
    public.clinician_has_patient_access(_private) = true,
    'and leaves their own doctor exactly where they were');

  -- ==========================================================================
  -- 6b. Only the patient ends a personal share
  --
  -- Found while writing this: guard_provider_share_consent reverts any change
  -- to the terms of a share made by anyone other than the patient who owns it.
  -- The first draft of this test tried to end the share while still carrying a
  -- colleague's identity and the change was silently reverted — which is the
  -- guard doing its job, and worth asserting rather than working around.
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _nair::text, true);
  UPDATE public.provider_shares SET is_active = false
   WHERE user_id = _private AND clinician_user_id = _nair;
  PERFORM pg_temp.assert(
    public.clinician_has_patient_access(_private) = true,
    'a clinician cannot end their own share — the terms are the patient''s');

  -- The patient ends it, which is the real flow.
  PERFORM set_config('request.jwt.claim.sub', _private::text, true);
  UPDATE public.provider_shares SET is_active = false
   WHERE user_id = _private AND clinician_user_id = _nair;

  PERFORM set_config('request.jwt.claim.sub', _private::text, true);
  UPDATE public.practice_shares SET is_active = true
   WHERE practice_id = _city AND user_id = _private;

  PERFORM set_config('request.jwt.claim.sub', _nair::text, true);
  PERFORM pg_temp.assert(
    public.clinician_has_patient_access(_private) = false,
    'when the patient ends the personal share, the personal access ends');
  PERFORM pg_temp.assert(
    public.institution_has_patient_access(_private) = true,
    'and leaves the hospital''s, which was agreed separately');

  -- And a clinician cannot let themselves back in.
  PERFORM set_config('request.jwt.claim.sub', _nair::text, true);
  UPDATE public.provider_shares SET is_active = true
   WHERE user_id = _private AND clinician_user_id = _nair;
  PERFORM pg_temp.assert(
    public.clinician_has_patient_access(_private) = false,
    'nor can a clinician restore a share the patient ended');

  -- ==========================================================================
  -- 7. An expired invitation is not a live one
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _private::text, true);
  UPDATE public.provider_shares
     SET is_active = true, expires_at = now() - interval '1 day'
   WHERE user_id = _private AND clinician_user_id = _nair;

  PERFORM set_config('request.jwt.claim.sub', _nair::text, true);
  PERFORM pg_temp.assert(
    public.clinician_has_patient_access(_private) = false,
    'a share that has expired grants nothing, active flag or not');

  RAISE NOTICE 'ALL INDEPENDENT-VS-INSTITUTION TESTS PASSED';
END
$$;

ROLLBACK;
