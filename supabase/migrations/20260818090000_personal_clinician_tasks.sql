-- A clinician with no practice can keep their own task list.
--
-- Found in platform review: "Create task" did nothing. The cause was not the
-- button — it was disabled, because practice_tasks.practice_id is NOT NULL and
-- the dialog refused to submit without one. A solo clinician, and every demo
-- clinician account, has no practice, so the whole feature was unreachable for
-- them while looking available.
--
-- Tasks are a personal follow-up list first ("call patient about BP reading")
-- and a shared practice queue second. Making the practice optional lets the
-- personal case work without weakening the shared one: a task with no practice
-- belongs to the clinician who created it and is visible to nobody else.

ALTER TABLE public.practice_tasks ALTER COLUMN practice_id DROP NOT NULL;

-- Insert: either a practice task from an active member of that practice, or a
-- personal task the clinician creates for themselves.
DROP POLICY IF EXISTS "Practice members can create tasks" ON public.practice_tasks;
CREATE POLICY "Practice members can create tasks"
  ON public.practice_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      (
        practice_id IS NULL
        AND assignee_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.practice_members pm
        WHERE pm.practice_id = practice_tasks.practice_id
          AND pm.user_id = auth.uid()
          AND pm.status = 'active'
      )
    )
  );

-- The manager clauses below are guarded on practice_id IS NOT NULL so a
-- personal task can never be matched by a practice-management check.
DROP POLICY IF EXISTS "Practice managers can view all practice tasks" ON public.practice_tasks;
CREATE POLICY "Practice managers can view all practice tasks"
  ON public.practice_tasks FOR SELECT
  TO authenticated
  USING (practice_id IS NOT NULL AND can_manage_practice(practice_id));

DROP POLICY IF EXISTS "Assignee or creator can update tasks" ON public.practice_tasks;
CREATE POLICY "Assignee or creator can update tasks"
  ON public.practice_tasks FOR UPDATE
  TO authenticated
  USING (
    assignee_user_id = auth.uid()
    OR created_by = auth.uid()
    OR (practice_id IS NOT NULL AND can_manage_practice(practice_id))
  )
  WITH CHECK (
    assignee_user_id = auth.uid()
    OR created_by = auth.uid()
    OR (practice_id IS NOT NULL AND can_manage_practice(practice_id))
  );

DROP POLICY IF EXISTS "Creator or managers can delete tasks" ON public.practice_tasks;
CREATE POLICY "Creator or managers can delete tasks"
  ON public.practice_tasks FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR (practice_id IS NOT NULL AND can_manage_practice(practice_id))
  );

COMMENT ON COLUMN public.practice_tasks.practice_id IS
  'Null means a personal task: visible only to the clinician who created it, never to a practice manager.';
