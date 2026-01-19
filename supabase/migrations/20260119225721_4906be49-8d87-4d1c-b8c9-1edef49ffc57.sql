-- Add unique constraint on brand_name_normalized for upsert support
ALTER TABLE public.international_drug_mappings 
ADD CONSTRAINT international_drug_mappings_brand_name_normalized_key 
UNIQUE (brand_name_normalized);