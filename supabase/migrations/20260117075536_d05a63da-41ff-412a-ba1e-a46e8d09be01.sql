-- Allow clinicians to update their own notes on shares they're linked to
CREATE POLICY "Clinicians can update notes on their patient shares" 
ON public.provider_shares 
FOR UPDATE 
USING (auth.uid() = clinician_user_id)
WITH CHECK (auth.uid() = clinician_user_id);