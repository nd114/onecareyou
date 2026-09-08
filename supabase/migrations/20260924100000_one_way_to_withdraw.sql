-- One way to withdraw
--
-- `retract_health_document()` was the first cut and is still granted to
-- `authenticated`. Nothing in the client calls it, but PostgREST exposes every
-- granted function, so it stayed a complete bypass of the model that replaced
-- it: a document of any age withdrawn on free text instead of a reason code,
-- no second signature however old the disclosure, and no
-- `document_retraction_events` row — no evidence beyond a single audit line.
--
-- The failure the "one vocabulary" rule exists to prevent, and worth naming
-- precisely: the new mechanism was not weakened by anything inside it. It was
-- weakened by leaving the old one reachable. Adding a stricter path does not
-- remove a permissive one, the same way adding a restrictive RLS policy does
-- not narrow a permissive one.
--
-- `my_retracted_documents` goes too. Two views answering "what was taken out of
-- my Vault" is how they come to disagree, and the newer one carries the neutral
-- reason-code wording.

DROP FUNCTION IF EXISTS public.retract_health_document(uuid, text);
DROP VIEW IF EXISTS public.my_retracted_documents;

-- ---------------------------------------------------------------------------
-- A message attachment cannot be withdrawn by an ordinary UPDATE
-- ---------------------------------------------------------------------------
--
-- Only on `messages`, and only after checking which tables actually need it.
--
-- `health_documents` does **not**. Its UPDATE policy already refuses a row whose
-- `retracted_at` is being set — RLS raises 42501 rather than allowing it — so a
-- trigger there would add nothing except converting a loud refusal into a silent
-- no-op, which is the wrong direction. A first draft of this migration had one,
-- with a comment claiming it was load-bearing. It was not.
--
-- `messages` genuinely needs it. The read-status policy lets a recipient update
-- the row, and nothing in it mentions the attachment columns, so without this a
-- patient could mark a clinician's attachment withdrawn — removing a clinical
-- instruction from the thread, with no reason code, no authority check and no
-- event. Verified by dropping the trigger and watching exactly that happen.

CREATE OR REPLACE FUNCTION public.guard_attachment_withdrawal_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Migrations and the seed have no actor at all.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- withdraw_shared_file() announces itself before it writes. Definer rights
  -- change the executing role but not the JWT claim, so that function's own
  -- write carries the caller's `auth.uid()` and looks exactly like a client's —
  -- checking the actor cannot tell them apart. The flag can.
  IF current_setting('onecare.withdrawal', true) = 'on' THEN
    RETURN NEW;
  END IF;

  NEW.attachment_retracted_at := OLD.attachment_retracted_at;
  NEW.attachment_retracted_by := OLD.attachment_retracted_by;
  -- The path too. Repointing it would leave the storage policy guarding an
  -- object nobody is asking for while it hands back the withdrawn one.
  NEW.attachment_path         := OLD.attachment_path;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_attachment_withdrawal ON public.messages;
CREATE TRIGGER trg_guard_attachment_withdrawal
BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.guard_attachment_withdrawal_columns();

COMMENT ON FUNCTION public.guard_attachment_withdrawal_columns() IS
  'An attachment is withdrawn by withdraw_shared_file() and by nothing else. '
  'Reverts the columns silently for any client write, the same shape as '
  'guard_provider_share_consent().';
