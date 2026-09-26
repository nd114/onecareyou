-- practice_audit_log confined the actor to the tenant and left the patient free.
--
-- One clinician working at two hospitals is a supported arrangement, so every
-- action they took at hospital B appeared in hospital A's audit screen with the
-- patient's real name — and could be searched for by name, since _search matches
-- patient.name. The function is SECURITY DEFINER, so the RLS that would have
-- stopped it never ran.
--
-- These assert the patient side of the scope, and the two things the fix
-- deliberately does *not* hide.

BEGIN;

CREATE OR REPLACE FUNCTION assert(_condition boolean, _label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF _condition IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', _label; END IF;
END $$;

DO $$
DECLARE
  v_hospital_a uuid := gen_random_uuid();
  v_hospital_b uuid := gen_random_uuid();
  v_admin_a    uuid := '1a1a1a1a-1111-4111-8111-111111111111';
  v_admin_b    uuid := '6f6f6f6f-6666-4666-8666-666666666666';
  v_shared_doc uuid := '2b2b2b2b-2222-4222-8222-222222222222';
  v_patient_a  uuid := '3c3c3c3c-3333-4333-8333-333333333333';
  v_patient_b  uuid := '4d4d4d4d-4444-4444-8444-444444444444';
  v_revoked    uuid := '5e5e5e5e-5555-4555-8555-555555555555';
  v_rows       integer;
  v_names      text[];
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (v_admin_a,    'admin-a@example.com'),
    (v_admin_b,    'admin-b@example.com'),
    (v_shared_doc, 'works-at-both@example.com'),
    (v_patient_a,  'patient-a@example.com'),
    (v_patient_b,  'patient-b@example.com'),
    (v_revoked,    'used-to-be-ours@example.com');

  -- Names are what actually leaked, so they have to be present to be missed.
  INSERT INTO public.profiles (user_id, name, email) VALUES
    (v_patient_a, 'Ada Ours',        'patient-a@example.com'),
    (v_patient_b, 'Bode Theirs',     'patient-b@example.com'),
    (v_revoked,   'Chidi Departed',  'used-to-be-ours@example.com'),
    (v_shared_doc,'Dr Both',         'works-at-both@example.com'),
    (v_admin_a,   'Admin A',         'admin-a@example.com'),
    (v_admin_b,   'Admin B',         'admin-b@example.com')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email;

  INSERT INTO public.practices (id, name, created_by) VALUES
    (v_hospital_a, 'Hospital A', v_admin_a),
    (v_hospital_b, 'Hospital B', v_admin_b);

  -- Creating a practice auto-enrols its creator, so upsert rather than insert.
  -- The shared clinician is a plain clinician at both, which is the point: only
  -- the two owners can read an audit log at all.
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (v_hospital_a, v_admin_a,    'owner',     'active'),
    (v_hospital_b, v_admin_b,    'owner',     'active'),
    (v_hospital_a, v_shared_doc, 'clinician', 'active'),
    (v_hospital_b, v_shared_doc, 'clinician', 'active')
  ON CONFLICT (practice_id, user_id) DO UPDATE
    SET role = EXCLUDED.role, status = EXCLUDED.status;

  -- Ada belongs to hospital A. Bode belongs only to hospital B. Chidi belonged
  -- to A and revoked.
  INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions)
  VALUES
    (v_hospital_a, v_patient_a, true,  true, '{}'::jsonb),
    (v_hospital_b, v_patient_b, true,  true, '{}'::jsonb),
    (v_hospital_a, v_revoked,   false, true, '{}'::jsonb);

  -- The shared clinician's activity: one action per patient, plus one action
  -- with no patient in it at all.
  INSERT INTO public.hipaa_audit_logs (user_id, action, resource_type, patient_user_id) VALUES
    (v_shared_doc, 'encounter_recorded',    'encounter',     v_patient_a),
    (v_shared_doc, 'internal_note_written', 'internal_note', v_patient_b),
    (v_shared_doc, 'guidance_issued',       'guidance',      v_revoked),
    (v_shared_doc, 'settings_changed',      'practice',      NULL);

  PERFORM set_config('request.jwt.claim.sub', v_admin_a::text, true);

  SELECT array_agg(patient_name ORDER BY patient_name)
    INTO v_names
    FROM public.practice_audit_log(v_hospital_a)
   WHERE patient_name IS NOT NULL;

  -- The leak itself.
  PERFORM assert(
    NOT ('Bode Theirs' = ANY(COALESCE(v_names, '{}'))),
    'hospital A must not see a patient who only ever belonged to hospital B'
  );

  -- ... while still doing its job for its own patients.
  PERFORM assert(
    'Ada Ours' = ANY(COALESCE(v_names, '{}')),
    'hospital A must still see its own patient'
  );

  -- A revoked share is still the tenant's own accountability record.
  PERFORM assert(
    'Chidi Departed' = ANY(COALESCE(v_names, '{}')),
    'a revoked share must not retroactively hide what staff did while it was live'
  );

  -- An action with no patient is tenant activity and must survive the scoping.
  SELECT count(*) INTO v_rows
    FROM public.practice_audit_log(v_hospital_a)
   WHERE action = 'settings_changed';
  PERFORM assert(v_rows = 1, 'an action with no patient must stay visible');

  -- _search matches patient.name, so it was a way to probe for names across
  -- tenants rather than merely receive them.
  SELECT count(*) INTO v_rows
    FROM public.practice_audit_log(v_hospital_a, 'Bode');
  PERFORM assert(v_rows = 0, 'searching another tenant''s patient by name must find nothing');

  -- And the other tenant is unaffected: B's own owner still sees B's patient.
  -- Scoping one tenant in must not scope the other out.
  PERFORM set_config('request.jwt.claim.sub', v_admin_b::text, true);
  SELECT count(*) INTO v_rows
    FROM public.practice_audit_log(v_hospital_b)
   WHERE patient_name = 'Bode Theirs';
  PERFORM assert(v_rows = 1, 'hospital B must still see its own patient');

  -- Symmetry: B must not see A's patient either.
  SELECT count(*) INTO v_rows
    FROM public.practice_audit_log(v_hospital_b)
   WHERE patient_name = 'Ada Ours';
  PERFORM assert(v_rows = 0, 'hospital B must not see hospital A''s patient');

  -- A plain clinician is not an auditor, whichever tenant they are in.
  PERFORM set_config('request.jwt.claim.sub', v_shared_doc::text, true);
  SELECT count(*) INTO v_rows FROM public.practice_audit_log(v_hospital_a);
  PERFORM assert(v_rows = 0, 'a plain clinician must read no audit log');

  RAISE NOTICE 'the_tenant_audit_log_stays_in_the_tenant: all assertions passed';
END $$;

ROLLBACK;
