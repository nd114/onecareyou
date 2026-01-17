-- Create a table for clinician guidance notifications (tracks when clinicians should be notified)
CREATE TABLE public.clinician_guidance_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guidance_id UUID NOT NULL REFERENCES public.clinician_guidance(id) ON DELETE CASCADE,
  clinician_user_id UUID NOT NULL,
  patient_user_id UUID NOT NULL,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('acknowledged', 'completed', 'expired', 'dismissed')),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.clinician_guidance_notifications ENABLE ROW LEVEL SECURITY;

-- Clinicians can view their own notifications
CREATE POLICY "Clinicians can view their own notifications"
ON public.clinician_guidance_notifications
FOR SELECT
USING (auth.uid() = clinician_user_id);

-- Clinicians can update their own notifications (mark as read)
CREATE POLICY "Clinicians can update their own notifications"
ON public.clinician_guidance_notifications
FOR UPDATE
USING (auth.uid() = clinician_user_id);

-- System/patients can insert notifications for clinicians
CREATE POLICY "System can insert notifications"
ON public.clinician_guidance_notifications
FOR INSERT
WITH CHECK (true);

-- Add clinician notification preferences to clinician_profiles table
ALTER TABLE public.clinician_profiles
ADD COLUMN IF NOT EXISTS notify_on_guidance_acknowledged BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_on_guidance_completed BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_on_guidance_expired BOOLEAN DEFAULT true;

-- Create a function to automatically create notifications when guidance status changes
CREATE OR REPLACE FUNCTION public.notify_clinician_on_guidance_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  should_notify BOOLEAN;
  notification_type TEXT;
BEGIN
  -- Only trigger on status changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Determine notification type
  CASE NEW.status
    WHEN 'acknowledged' THEN notification_type := 'acknowledged';
    WHEN 'completed' THEN notification_type := 'completed';
    WHEN 'dismissed' THEN notification_type := 'dismissed';
    ELSE RETURN NEW;
  END CASE;

  -- Check clinician preferences
  SELECT 
    CASE notification_type
      WHEN 'acknowledged' THEN notify_on_guidance_acknowledged
      WHEN 'completed' THEN notify_on_guidance_completed
      ELSE true
    END
  INTO should_notify
  FROM public.clinician_profiles
  WHERE user_id = NEW.clinician_user_id;

  -- Default to true if no profile found
  IF should_notify IS NULL THEN
    should_notify := true;
  END IF;

  -- Insert notification if enabled
  IF should_notify THEN
    INSERT INTO public.clinician_guidance_notifications (
      guidance_id,
      clinician_user_id,
      patient_user_id,
      notification_type
    ) VALUES (
      NEW.id,
      NEW.clinician_user_id,
      NEW.patient_user_id,
      notification_type
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for guidance status changes
CREATE TRIGGER on_guidance_status_change
AFTER UPDATE ON public.clinician_guidance
FOR EACH ROW
EXECUTE FUNCTION public.notify_clinician_on_guidance_change();

-- Create index for faster notification lookups
CREATE INDEX idx_clinician_guidance_notifications_clinician 
ON public.clinician_guidance_notifications(clinician_user_id, is_read);

CREATE INDEX idx_clinician_guidance_notifications_created 
ON public.clinician_guidance_notifications(created_at DESC);