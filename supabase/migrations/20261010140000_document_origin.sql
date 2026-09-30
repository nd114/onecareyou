-- A document someone else puts in a patient's Vault says who sent it, accurately.
--
-- "Send to Vault" files a document straight into the patient's Vault, and
-- every such document was labelled "From your clinician". The INSERT policy
-- admits any member of a hospital the patient shares with who has the patient
-- on their roster, front desk and billing included, so a receptionist filing
-- a registration form produced a document that told the patient their
-- clinician had sent it (G11 in the sharing v2 plan).
--
-- The founder decided the upload itself is right: intake paperwork is a front
-- desk job, and moving it back to a clinician would only make the clinician
-- re-send what reception already has. The danger was the label. So:
--
--   1. The origin is stamped by the server at insert, from the sender's
--      membership and role at that moment, into origin_practice_id,
--      origin_practice_name, origin_role and origin_label. Whatever the client
--      sends in those columns is discarded, and no client may change them
--      afterwards. A later role change, a departure or a hospital renaming
--      itself does not relabel what was sent.
--
--        clinical member   "From Dr Ada Obi · St Elsewhere General"
--        non-clinical      "From St Elsewhere General (front desk)"
--        private clinician "From Dr Kemi Bello"
--
--      A sender who could act through several routes is attributed to a
--      clinical hospital membership first, then to a personal share, then to
--      a non-clinical membership: a person is only ever called a clinician
--      where they hold a clinical role or were invited as one.
--
--   2. A non-clinical member may file only non-clinical categories
--      (insurance, billing, other). The category is what the patient reads as
--      "this is a lab result" or "this is a prescription", and a receptionist
--      filing one would be the same mislabelling by another column. The list
--      is an allowlist, so a category added later is clinical until someone
--      decides otherwise.
--
--   3. The patient is told on receipt, in patient_notices ("St Elsewhere
--      General sent you a document: <title>"), which is written only by
--      server triggers. document_received is mandatory in the notification
--      catalogue: a record that grows without its owner knowing is the thing
--      the notice exists to prevent.
--
-- Documents filed before this migration keep a null origin. Who sent them is
-- in uploaded_by_user_id, but the institution and the role at the time are
-- not, and guessing them from today's memberships would write exactly the
-- inaccurate label this migration exists to remove. The interface shows
-- those as "From a clinic or clinician".

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.health_documents
  ADD COLUMN IF NOT EXISTS origin_practice_id uuid REFERENCES public.practices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_practice_name text,
  ADD COLUMN IF NOT EXISTS origin_role text,
  ADD COLUMN IF NOT EXISTS origin_label text;

COMMENT ON COLUMN public.health_documents.origin_label IS
  'Who filed this into the patient''s Vault, as shown to them. Stamped by stamp_document_origin() at insert; never supplied or changed by a client.';
COMMENT ON COLUMN public.health_documents.origin_role IS
  'The sender''s practice role when they filed it, or private_clinician for a personal share. Not updated when their role changes.';

-- ---------------------------------------------------------------------------
-- 2. Stamping the origin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.document_origin_role_label(_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE _role
    WHEN 'front_desk' THEN 'front desk'
    WHEN 'billing'    THEN 'billing'
    ELSE 'staff'
  END;
$$;

REVOKE ALL ON FUNCTION public.document_origin_role_label(text) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.stamp_document_origin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _sender   uuid := NEW.uploaded_by_user_id;
  _inst     record;
  _has_inst      boolean;
  _is_private    boolean;
  _provider_name text;
  _name          text;
BEGIN
  -- Nothing the client sent about the origin survives.
  NEW.origin_practice_id   := NULL;
  NEW.origin_practice_name := NULL;
  NEW.origin_role          := NULL;
  NEW.origin_label         := NULL;

  IF _sender IS NULL OR NEW.source_context IS DISTINCT FROM 'clinician_upload' THEN
    RETURN NEW;
  END IF;

  -- The routes the INSERT policy admits: a hospital membership with the
  -- patient on the roster, or a personal share. Clinical membership first.
  SELECT pm.practice_id, pm.role::text AS role, p.name,
         public.practice_role_is_clinical(pm.role) AS clinical
    INTO _inst
    FROM public.practice_shares ps
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    JOIN public.practices p ON p.id = ps.practice_id
   WHERE ps.user_id = NEW.user_id
     AND ps.is_active
     AND ps.practice_suspended_at IS NULL
     AND pm.user_id = _sender
     AND pm.status = 'active'
     AND (pm.can_view_all_patients
          OR public.is_assigned_to_patient_in_practice(_sender, NEW.user_id, ps.practice_id))
   ORDER BY public.practice_role_is_clinical(pm.role) DESC, pm.created_at, pm.practice_id
   LIMIT 1;
  _has_inst := FOUND;

  -- The same question the INSERT policy asks of a personal share.
  _is_private := public.clinician_can_see_patient_as(_sender, NEW.user_id, NULL);
  IF _is_private THEN
    SELECT ps.provider_name INTO _provider_name
      FROM public.provider_shares ps
     WHERE ps.user_id = NEW.user_id
       AND ps.clinician_user_id = _sender
       AND ps.is_active
     ORDER BY ps.created_at
     LIMIT 1;
  END IF;

  _name := (
    SELECT nullif(btrim(concat_ws(' ', nullif(btrim(cp.title), ''), nullif(btrim(cp.first_name), ''),
                                   nullif(btrim(cp.last_name), ''))), '')
      FROM public.clinician_profiles cp WHERE cp.user_id = _sender LIMIT 1);

  IF _has_inst AND _inst.clinical THEN
    NEW.origin_practice_id   := _inst.practice_id;
    NEW.origin_practice_name := _inst.name;
    NEW.origin_role          := _inst.role;
    NEW.origin_label := CASE
      WHEN _name IS NOT NULL THEN format('From %s · %s', _name, _inst.name)
      ELSE format('From a clinician at %s', _inst.name)
    END;
  ELSIF _is_private THEN
    NEW.origin_role  := 'private_clinician';
    NEW.origin_label := 'From ' || COALESCE(
      _name,
      nullif(btrim(_provider_name), ''),
      (SELECT nullif(btrim(pr.name), '') FROM public.profiles pr WHERE pr.user_id = _sender LIMIT 1),
      'your clinician');
  ELSIF _has_inst THEN
    -- Not named: the patient needs to know which hospital and that it was
    -- not a clinician, not which receptionist.
    NEW.origin_practice_id   := _inst.practice_id;
    NEW.origin_practice_name := _inst.name;
    NEW.origin_role          := _inst.role;
    NEW.origin_label := format('From %s (%s)', _inst.name, public.document_origin_role_label(_inst.role));

    IF NEW.category NOT IN ('insurance', 'billing', 'other') THEN
      RAISE EXCEPTION 'Front desk and billing staff can send insurance, billing and other paperwork. A clinical document needs to come from a clinical colleague.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  -- No route found: the INSERT policy refuses a client anyway, and a server
  -- insert is left without an origin rather than given a guessed one.

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_document_origin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_stamp_document_origin ON public.health_documents;
CREATE TRIGGER trg_stamp_document_origin
BEFORE INSERT ON public.health_documents
FOR EACH ROW EXECUTE FUNCTION public.stamp_document_origin();

-- ---------------------------------------------------------------------------
-- 3. Nobody edits the origin afterwards
--
-- guard_health_document_record as it stood in 20261010110000, with the four
-- origin columns added to both immutable lists.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_health_document_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client boolean := current_user IN ('authenticated', 'anon');
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Nobody, the server included: a cleanup script is how most records that
    -- were meant to be permanent actually go missing.
    IF OLD.source_context = 'care_record_snapshot' THEN
      RAISE EXCEPTION 'A care record is permanent and cannot be deleted by the patient, the clinician or OneCare'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_client AND (NEW.source_context = 'care_record_snapshot' OR NEW.category = 'care_record') THEN
      RAISE EXCEPTION 'Care records are filed by OneCare, not uploaded'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.source_context = 'care_record_snapshot' THEN
    -- Filing it in a folder, archiving it, and an AI summary beside it are the
    -- patient organising their own Vault. The record itself does not move.
    IF (NEW.id, NEW.user_id, NEW.family_member_id, NEW.file_path, NEW.file_name, NEW.file_size,
        NEW.mime_type, NEW.category, NEW.title, NEW.notes, NEW.document_date, NEW.created_at,
        NEW.source_context, NEW.uploaded_by_user_id, NEW.retracted_at, NEW.retracted_by,
        NEW.retraction_reason, NEW.tags, NEW.origin_practice_id, NEW.origin_practice_name,
        NEW.origin_role, NEW.origin_label)
       IS DISTINCT FROM
       (OLD.id, OLD.user_id, OLD.family_member_id, OLD.file_path, OLD.file_name, OLD.file_size,
        OLD.mime_type, OLD.category, OLD.title, OLD.notes, OLD.document_date, OLD.created_at,
        OLD.source_context, OLD.uploaded_by_user_id, OLD.retracted_at, OLD.retracted_by,
        OLD.retraction_reason, OLD.tags, OLD.origin_practice_id, OLD.origin_practice_name,
        OLD.origin_role, OLD.origin_label) THEN
      RAISE EXCEPTION 'A care record cannot be edited; it can be filed in a folder or archived'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF v_client THEN
    IF NEW.source_context = 'care_record_snapshot'
       OR (NEW.category = 'care_record' AND OLD.category IS DISTINCT FROM 'care_record') THEN
      RAISE EXCEPTION 'Only OneCare files care records; a document cannot be relabelled as one'
        USING ERRCODE = '42501';
    END IF;
    -- Blanking uploaded_by_user_id turned a clinician's document into the
    -- patient's own, which the DELETE policy then let them remove. Rewriting
    -- the origin would let a document claim a sender it never had.
    IF (NEW.id, NEW.user_id, NEW.file_path, NEW.source_context, NEW.uploaded_by_user_id,
        NEW.retracted_at, NEW.retracted_by, NEW.retraction_reason, NEW.created_at,
        NEW.origin_practice_id, NEW.origin_practice_name, NEW.origin_role, NEW.origin_label)
       IS DISTINCT FROM
       (OLD.id, OLD.user_id, OLD.file_path, OLD.source_context, OLD.uploaded_by_user_id,
        OLD.retracted_at, OLD.retracted_by, OLD.retraction_reason, OLD.created_at,
        OLD.origin_practice_id, OLD.origin_practice_name, OLD.origin_role, OLD.origin_label) THEN
      RAISE EXCEPTION 'Who filed a document, where its file is, and whether it was withdrawn are recorded by OneCare and cannot be changed'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Telling the patient
-- ---------------------------------------------------------------------------
ALTER TABLE public.patient_notices DROP CONSTRAINT IF EXISTS patient_notices_notice_type_check;
ALTER TABLE public.patient_notices ADD CONSTRAINT patient_notices_notice_type_check
  CHECK (notice_type IN ('care_handed_over', 'document_received'));

CREATE OR REPLACE FUNCTION public.notification_is_mandatory(_category text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT _category IN (
    'account_security',             -- how a person keeps control of their account
    'patient_vital_alert',          -- a threshold the clinician set, on a reading that matters
    'sharing_ended',                -- the patient was told the other side would learn of it
    'department_routing_oversight', -- the hospital's view of what its leads did
    'departed_work_handover',       -- an unsigned note nobody else knows exists
    'document_received'             -- something was added to the patient's own record by someone else
  );
$function$;

CREATE OR REPLACE FUNCTION public.tell_patient_of_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _from text;
BEGIN
  IF NEW.source_context IS DISTINCT FROM 'clinician_upload' OR NEW.uploaded_by_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF NOT public.notification_allowed(NEW.user_id, 'document_received', 'in_app') THEN
    RETURN NULL;
  END IF;

  -- A hospital speaks as the hospital; a private clinician as themselves.
  _from := CASE
    WHEN NEW.origin_practice_name IS NOT NULL THEN NEW.origin_practice_name
    WHEN NEW.origin_label LIKE 'From %' THEN substr(NEW.origin_label, 6)
    ELSE NULL
  END;

  INSERT INTO public.patient_notices (patient_user_id, practice_id, notice_type, message, related_id)
  VALUES (
    NEW.user_id, NEW.origin_practice_id, 'document_received',
    CASE WHEN _from IS NOT NULL
      THEN format('%s sent you a document: %s', _from, COALESCE(NEW.title, NEW.file_name))
      ELSE format('A document was added to your Vault: %s', COALESCE(NEW.title, NEW.file_name))
    END,
    NEW.id
  )
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.tell_patient_of_document() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tell_patient_of_document ON public.health_documents;
CREATE TRIGGER trg_tell_patient_of_document
AFTER INSERT ON public.health_documents
FOR EACH ROW EXECUTE FUNCTION public.tell_patient_of_document();
