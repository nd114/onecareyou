-- Fix job_applications SELECT policy to restrict to own email
DROP POLICY IF EXISTS "Applicants can view their own applications" ON public.job_applications;

CREATE POLICY "Applicants can view their own applications"
ON public.job_applications
FOR SELECT
USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Fix resumes storage bucket - drop permissive read policy, add owner-only access
DROP POLICY IF EXISTS "Resumes are readable" ON storage.objects;

CREATE POLICY "Applicants can read their own resumes"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'resumes' AND
  auth.uid()::text = (storage.foldername(name))[1]
);