-- Create table for international drug mappings from Mendeley IDD dataset
CREATE TABLE public.international_drug_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_name TEXT NOT NULL,
  brand_name_normalized TEXT NOT NULL,
  generic_name TEXT NOT NULL,
  rxcui TEXT,
  country_code TEXT,
  source TEXT DEFAULT 'mendeley_idd',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for fast lookups
CREATE INDEX idx_drug_mappings_brand_normalized ON public.international_drug_mappings (brand_name_normalized);
CREATE INDEX idx_drug_mappings_generic ON public.international_drug_mappings (generic_name);
CREATE INDEX idx_drug_mappings_rxcui ON public.international_drug_mappings (rxcui);
CREATE INDEX idx_drug_mappings_country ON public.international_drug_mappings (country_code);

-- Enable RLS (public read access since drug info is public knowledge)
ALTER TABLE public.international_drug_mappings ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read drug mappings (public health information)
CREATE POLICY "Anyone can read drug mappings"
ON public.international_drug_mappings
FOR SELECT
USING (true);

-- Only service role can insert/update (for data imports)
CREATE POLICY "Service role can manage drug mappings"
ON public.international_drug_mappings
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Add trigger for updated_at
CREATE TRIGGER update_drug_mappings_updated_at
BEFORE UPDATE ON public.international_drug_mappings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();