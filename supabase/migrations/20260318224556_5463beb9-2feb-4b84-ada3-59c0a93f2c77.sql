
CREATE TABLE public.beta_bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  page_url text NOT NULL,
  category text NOT NULL DEFAULT 'bug',
  description text NOT NULL,
  browser_info jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.beta_bug_reports ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can submit bug reports
CREATE POLICY "Anyone can submit bug reports"
  ON public.beta_bug_reports
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Authenticated users can view their own reports
CREATE POLICY "Users can view their own bug reports"
  ON public.beta_bug_reports
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
