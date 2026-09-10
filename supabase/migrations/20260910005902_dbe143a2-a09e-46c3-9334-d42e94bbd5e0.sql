-- Folders in the Health Vault used to exist only as a label on a document, so a
-- new folder vanished the moment the page reloaded and could never be renamed.
CREATE TABLE public.document_folders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  family_member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX document_folders_owner_name_key
  ON public.document_folders (user_id, coalesce(family_member_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_folders TO authenticated;
GRANT ALL ON public.document_folders TO service_role;

ALTER TABLE public.document_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "A person manages their own folders"
  ON public.document_folders FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_document_folders_updated_at
  BEFORE UPDATE ON public.document_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Renaming has to move the documents with it, or the folder disappears from the
-- Vault while its files sit under the old label.
CREATE OR REPLACE FUNCTION public.rename_document_folder(_folder_id uuid, _new_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old text;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT name INTO v_old FROM public.document_folders
   WHERE id = _folder_id AND user_id = v_uid;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'Folder not found';
  END IF;

  UPDATE public.document_folders SET name = btrim(_new_name)
   WHERE id = _folder_id AND user_id = v_uid;

  UPDATE public.health_documents SET folder = btrim(_new_name)
   WHERE user_id = v_uid AND folder = v_old;
END;
$$;

REVOKE ALL ON FUNCTION public.rename_document_folder(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_document_folder(uuid, text) TO authenticated;

-- Removing a folder never touches the files: its documents go back to Unfiled.
CREATE OR REPLACE FUNCTION public.delete_document_folder(_folder_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old text;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT name INTO v_old FROM public.document_folders
   WHERE id = _folder_id AND user_id = v_uid;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'Folder not found';
  END IF;

  UPDATE public.health_documents SET folder = NULL
   WHERE user_id = v_uid AND folder = v_old;

  DELETE FROM public.document_folders WHERE id = _folder_id AND user_id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_document_folder(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_document_folder(uuid) TO authenticated;

-- Backfill the folders people already have, so nothing appears to be lost.
INSERT INTO public.document_folders (user_id, family_member_id, name)
SELECT DISTINCT d.user_id, d.family_member_id, btrim(d.folder)
  FROM public.health_documents d
 WHERE d.folder IS NOT NULL AND btrim(d.folder) <> ''
ON CONFLICT DO NOTHING;

-- A patient's own note. Not a document: there is no file, and it is never part
-- of whole-Vault sharing — it is theirs alone until they choose otherwise.
CREATE TABLE public.personal_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  family_member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  body_html text NOT NULL DEFAULT '',
  note_date date NOT NULL DEFAULT (now()::date),
  folder text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_notes TO authenticated;
GRANT ALL ON public.personal_notes TO service_role;

ALTER TABLE public.personal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "A person manages their own notes"
  ON public.personal_notes FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX personal_notes_owner_idx ON public.personal_notes (user_id, note_date DESC);

CREATE TRIGGER update_personal_notes_updated_at
  BEFORE UPDATE ON public.personal_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();