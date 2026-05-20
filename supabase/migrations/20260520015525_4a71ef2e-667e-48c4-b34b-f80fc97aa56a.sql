-- Secure messaging between patients and clinicians
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_user_id UUID NOT NULL,
  clinician_user_id UUID NOT NULL,
  sender_user_id UUID NOT NULL,
  body TEXT NOT NULL,
  attachment_path TEXT,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_thread ON public.messages (patient_user_id, clinician_user_id, created_at DESC);
CREATE INDEX idx_messages_patient ON public.messages (patient_user_id, created_at DESC);
CREATE INDEX idx_messages_clinician ON public.messages (clinician_user_id, created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Patient can read their own threads
CREATE POLICY "Patients can read their messages"
ON public.messages FOR SELECT
TO authenticated
USING (auth.uid() = patient_user_id);

-- Clinician can read messages with patients who share with them
CREATE POLICY "Clinicians can read messages with shared patients"
ON public.messages FOR SELECT
TO authenticated
USING (
  auth.uid() = clinician_user_id
  AND public.clinician_has_patient_access(patient_user_id)
);

-- Patient can send messages in their own threads
CREATE POLICY "Patients can send messages"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = patient_user_id
  AND auth.uid() = sender_user_id
);

-- Clinician can send messages to shared patients
CREATE POLICY "Clinicians can send messages"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = clinician_user_id
  AND auth.uid() = sender_user_id
  AND public.clinician_has_patient_access(patient_user_id)
);

-- Recipient can mark messages as read (only read_at updates allowed via app-side enforcement)
CREATE POLICY "Recipient can update read status (patient)"
ON public.messages FOR UPDATE
TO authenticated
USING (auth.uid() = patient_user_id AND sender_user_id <> auth.uid())
WITH CHECK (auth.uid() = patient_user_id AND sender_user_id <> auth.uid());

CREATE POLICY "Recipient can update read status (clinician)"
ON public.messages FOR UPDATE
TO authenticated
USING (
  auth.uid() = clinician_user_id
  AND sender_user_id <> auth.uid()
  AND public.clinician_has_patient_access(patient_user_id)
)
WITH CHECK (
  auth.uid() = clinician_user_id
  AND sender_user_id <> auth.uid()
  AND public.clinician_has_patient_access(patient_user_id)
);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;