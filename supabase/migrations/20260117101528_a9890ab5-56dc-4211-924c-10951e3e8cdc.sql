-- Create medication_photos table for pill photo gallery
CREATE TABLE public.medication_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  medication_id UUID NOT NULL REFERENCES public.medications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  storage_path TEXT NOT NULL,
  caption TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.medication_photos ENABLE ROW LEVEL SECURITY;

-- RLS policies for medication_photos
CREATE POLICY "Users can view their own medication photos"
  ON public.medication_photos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upload their own medication photos"
  ON public.medication_photos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own medication photos"
  ON public.medication_photos FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own medication photos"
  ON public.medication_photos FOR UPDATE
  USING (auth.uid() = user_id);

-- Create care_alert_settings table for family notifications
CREATE TABLE public.care_alert_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  family_member_id UUID REFERENCES public.family_members(id) ON DELETE CASCADE,
  alert_recipient_email TEXT NOT NULL,
  alert_recipient_name TEXT NOT NULL,
  missed_dose_threshold INTEGER NOT NULL DEFAULT 2,
  is_active BOOLEAN DEFAULT true,
  notify_by_email BOOLEAN DEFAULT true,
  notify_by_push BOOLEAN DEFAULT false,
  last_alert_sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.care_alert_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for care_alert_settings
CREATE POLICY "Users can view their own care alert settings"
  ON public.care_alert_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own care alert settings"
  ON public.care_alert_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own care alert settings"
  ON public.care_alert_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own care alert settings"
  ON public.care_alert_settings FOR DELETE
  USING (auth.uid() = user_id);

-- Create care_alert_logs table to track sent alerts
CREATE TABLE public.care_alert_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_id UUID NOT NULL REFERENCES public.care_alert_settings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  recipient_email TEXT NOT NULL,
  missed_count INTEGER NOT NULL,
  message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.care_alert_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for care_alert_logs
CREATE POLICY "Users can view their own care alert logs"
  ON public.care_alert_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert care alert logs"
  ON public.care_alert_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create storage bucket for medication photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('medication-photos', 'medication-photos', true);

-- Storage policies for medication photos
CREATE POLICY "Users can view their own medication photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'medication-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own medication photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'medication-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own medication photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'medication-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add trigger for updated_at on care_alert_settings
CREATE TRIGGER update_care_alert_settings_updated_at
  BEFORE UPDATE ON public.care_alert_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();