-- Create medications table
CREATE TABLE public.medications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  frequency TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'tablet',
  instructions TEXT,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  refill_date DATE,
  quantity INTEGER,
  prescriber TEXT,
  pharmacy TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  times_of_day JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create vitals table
CREATE TABLE public.vitals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  value NUMERIC NOT NULL,
  secondary_value NUMERIC,
  unit TEXT NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create schedule_entries table
CREATE TABLE public.schedule_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medication_id UUID NOT NULL REFERENCES public.medications(id) ON DELETE CASCADE,
  scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  taken_at TIMESTAMP WITH TIME ZONE,
  skipped_reason TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for medications
CREATE POLICY "Users can view their own medications" ON public.medications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own medications" ON public.medications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own medications" ON public.medications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own medications" ON public.medications
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for vitals
CREATE POLICY "Users can view their own vitals" ON public.vitals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own vitals" ON public.vitals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own vitals" ON public.vitals
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own vitals" ON public.vitals
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for schedule_entries
CREATE POLICY "Users can view their own schedule entries" ON public.schedule_entries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own schedule entries" ON public.schedule_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own schedule entries" ON public.schedule_entries
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own schedule entries" ON public.schedule_entries
  FOR DELETE USING (auth.uid() = user_id);

-- Create triggers for updated_at
CREATE TRIGGER update_medications_updated_at
  BEFORE UPDATE ON public.medications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_schedule_entries_updated_at
  BEFORE UPDATE ON public.schedule_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better query performance
CREATE INDEX idx_medications_user_id ON public.medications(user_id);
CREATE INDEX idx_medications_is_active ON public.medications(is_active);
CREATE INDEX idx_vitals_user_id ON public.vitals(user_id);
CREATE INDEX idx_vitals_type ON public.vitals(type);
CREATE INDEX idx_vitals_recorded_at ON public.vitals(recorded_at);
CREATE INDEX idx_schedule_entries_user_id ON public.schedule_entries(user_id);
CREATE INDEX idx_schedule_entries_medication_id ON public.schedule_entries(medication_id);
CREATE INDEX idx_schedule_entries_scheduled_time ON public.schedule_entries(scheduled_time);
CREATE INDEX idx_schedule_entries_status ON public.schedule_entries(status);