-- A signed BAA should stop asking to be signed.
--
-- Found in platform review: after signing, the page kept offering the signing
-- form. The cause is a loop between the data and the read:
--
--   * signing always INSERTs a new row with status 'active' and never
--     supersedes the previous one, and nothing stops a clinician holding
--     several active agreements at once;
--   * the page reads that row with .maybeSingle(), which throws as soon as two
--     rows match. The query errors, the component falls through to its
--     unsigned branch, and the signing form appears again — which lets another
--     active row be added, so the fault is self-reinforcing.
--
-- This fixes the data half. Signing a new agreement now supersedes the old one,
-- and a partial unique index makes a second active agreement impossible.

-- Collapse any clinician who already holds several: keep the newest, supersede
-- the rest, so the index below can be created.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY clinician_user_id
           ORDER BY signed_at DESC NULLS LAST, created_at DESC
         ) AS rn
    FROM public.baa_agreements
   WHERE status = 'active'
)
UPDATE public.baa_agreements b
   SET status = 'superseded'
  FROM ranked r
 WHERE b.id = r.id
   AND r.rn > 1;

-- Signing a new agreement retires the previous one.
CREATE OR REPLACE FUNCTION public.supersede_previous_baa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    UPDATE public.baa_agreements
       SET status = 'superseded'
     WHERE clinician_user_id = NEW.clinician_user_id
       AND status = 'active'
       AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.supersede_previous_baa() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_supersede_previous_baa ON public.baa_agreements;
CREATE TRIGGER trg_supersede_previous_baa
AFTER INSERT ON public.baa_agreements
FOR EACH ROW EXECUTE FUNCTION public.supersede_previous_baa();

-- Belt and braces: one active agreement per clinician, enforced by the database.
DROP INDEX IF EXISTS idx_baa_one_active_per_clinician;
CREATE UNIQUE INDEX idx_baa_one_active_per_clinician
  ON public.baa_agreements (clinician_user_id)
  WHERE status = 'active';

COMMENT ON FUNCTION public.supersede_previous_baa() IS
  'Retires a clinician''s previous active BAA when a new one is signed, so exactly one is current.';
