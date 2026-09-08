-- A patient can read their own medications
--
-- They currently cannot. Replaying this migration history produces a database
-- where `SELECT * FROM medications` returns nothing for the person the
-- medications belong to.
--
-- How it happened, because the shape matters more than the fix:
--
-- January (20260117135126) dropped "Users can view their own medications" with
-- the comment "our new policies cover both cases" — and they did, because the
-- clinician policy of the day read
--   `auth.uid() = user_id OR clinician_has_patient_access(user_id)`.
-- The owner's access was correct, and it was correct as a clause inside
-- somebody else's policy.
--
-- September (20260904213723) rewrote that policy to
--   `clinician_has_patient_permission(user_id, 'medications')`
-- as part of converging the share vocabulary. The clinician half was the
-- subject of the change; the owner half was collateral. `vitals` and
-- `schedule_entries` were rewritten in the same migration and kept theirs, so
-- this is one table's regression rather than a systematic one — which is
-- exactly why nothing caught it.
--
-- The failure is silent in both directions. RLS returning no rows is not an
-- error, so the client sees an empty list; and a policy rewrite that drops one
-- OR branch is invisible in review because the diff looks like the thing it
-- was meant to be.
--
-- So the fix is not only to restore the branch but to stop storing the owner's
-- access inside a policy about somebody else. A separate policy per concern
-- cannot be destroyed by rewriting an unrelated one.

DROP POLICY IF EXISTS "Patients read their own medications" ON public.medications;
CREATE POLICY "Patients read their own medications"
  ON public.medications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON POLICY "Patients read their own medications" ON public.medications IS
  'Standalone, deliberately. This used to live as an OR branch inside the '
  'clinician sharing policy, and rewriting that policy for an unrelated reason '
  'deleted it. Access that belongs to the owner is stated on its own so that '
  'changing who else may read cannot change whether they may.';

-- The clinician and institution policies stay exactly as they are. They are
-- about somebody else's access and now say only that.
