-- The storage ledger billed dictation audio by a guess
--
-- `sync_storage_ledger_dictation()` set bytes to `duration_seconds * 32000` —
-- a fixed 32 kB/s regardless of the codec, bitrate or silence in the actual
-- recording. `health_documents` never had this problem: its ledger sync reads
-- `file_size`, a real number Storage already knows. Dictation audio is a real
-- object in the `clinician-dictations` bucket the whole time; nothing read it.
--
-- The duration estimate stays, but only as the fallback for the moment
-- between the row landing and the upload's metadata being visible — a dose of
-- caution, not the steady state, since the client uploads to storage first
-- and creates this row after (EncounterScribePanel.tsx).

CREATE OR REPLACE FUNCTION public.sync_storage_ledger_dictation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _practice_id uuid;
  _real_bytes bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.storage_ledger
     WHERE resource_type = 'dictation' AND resource_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT pm.practice_id INTO _practice_id
  FROM public.practice_members pm
  WHERE pm.user_id = NEW.clinician_user_id AND pm.status = 'active'
  LIMIT 1;

  SELECT (o.metadata->>'size')::bigint INTO _real_bytes
    FROM storage.objects o
   WHERE o.bucket_id = 'clinician-dictations' AND o.name = NEW.audio_path;

  INSERT INTO public.storage_ledger (user_id, practice_id, resource_type, resource_id, bytes)
  VALUES (NEW.clinician_user_id, _practice_id, 'dictation', NEW.id,
          COALESCE(_real_bytes, COALESCE(NEW.duration_seconds, 0) * 32000))
  ON CONFLICT (resource_type, resource_id)
  DO UPDATE SET bytes = EXCLUDED.bytes, practice_id = EXCLUDED.practice_id, updated_at = now();
  RETURN NEW;
END;
$$;

-- Existing rows: reconcile against real object sizes where Storage has them.
-- Left as the estimate where it does not (the object was since removed) —
-- better than losing the row's billed size entirely.
UPDATE public.storage_ledger sl
   SET bytes = (o.metadata->>'size')::bigint,
       updated_at = now()
  FROM public.clinician_dictations cd
  JOIN storage.objects o
    ON o.bucket_id = 'clinician-dictations' AND o.name = cd.audio_path
 WHERE sl.resource_type = 'dictation'
   AND sl.resource_id = cd.id
   AND (o.metadata->>'size')::bigint IS DISTINCT FROM sl.bytes;
