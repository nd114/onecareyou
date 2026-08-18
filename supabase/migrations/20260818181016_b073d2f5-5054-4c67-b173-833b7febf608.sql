ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS job_applications_archived_at_idx ON public.job_applications (archived_at);