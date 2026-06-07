
-- Phase 1.5 — Practice tasks

CREATE TABLE public.practice_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  practice_id UUID NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  assignee_user_id UUID NOT NULL,
  created_by UUID NOT NULL,
  patient_user_id UUID,
  title TEXT NOT NULL,
  notes TEXT,
  due_at TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','snoozed','cancelled')),
  snoozed_until TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','alert','guidance','message','system')),
  source_alert_id UUID,
  source_guidance_id UUID,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_tasks TO authenticated;
GRANT ALL ON public.practice_tasks TO service_role;

ALTER TABLE public.practice_tasks ENABLE ROW LEVEL SECURITY;

-- Assignee can read their tasks
CREATE POLICY "Assignee can view own tasks"
  ON public.practice_tasks FOR SELECT
  TO authenticated
  USING (assignee_user_id = auth.uid());

-- Creator can read tasks they created
CREATE POLICY "Creator can view tasks they created"
  ON public.practice_tasks FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

-- Practice managers can view all practice tasks
CREATE POLICY "Practice managers can view all practice tasks"
  ON public.practice_tasks FOR SELECT
  TO authenticated
  USING (can_manage_practice(practice_id));

-- Any active practice member can create tasks within their practice
CREATE POLICY "Practice members can create tasks"
  ON public.practice_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.practice_members pm
      WHERE pm.practice_id = practice_tasks.practice_id
        AND pm.user_id = auth.uid()
        AND pm.status = 'active'
    )
  );

-- Assignee or creator can update; managers can update any
CREATE POLICY "Assignee or creator can update tasks"
  ON public.practice_tasks FOR UPDATE
  TO authenticated
  USING (
    assignee_user_id = auth.uid()
    OR created_by = auth.uid()
    OR can_manage_practice(practice_id)
  )
  WITH CHECK (
    assignee_user_id = auth.uid()
    OR created_by = auth.uid()
    OR can_manage_practice(practice_id)
  );

-- Creator or managers can delete
CREATE POLICY "Creator or managers can delete tasks"
  ON public.practice_tasks FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() OR can_manage_practice(practice_id));

CREATE INDEX idx_practice_tasks_assignee_status ON public.practice_tasks(assignee_user_id, status);
CREATE INDEX idx_practice_tasks_practice ON public.practice_tasks(practice_id);
CREATE INDEX idx_practice_tasks_due ON public.practice_tasks(due_at) WHERE status IN ('open','in_progress');
CREATE INDEX idx_practice_tasks_patient ON public.practice_tasks(patient_user_id);

CREATE TRIGGER update_practice_tasks_updated_at
  BEFORE UPDATE ON public.practice_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
