import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { read, utils } from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, fileUrl } = await req.json();

    if (action === 'import-from-url') {
      // Fetch the Excel file
      console.log('Fetching Excel file from:', fileUrl);
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      
      // Parse Excel file
      console.log('Parsing Excel file...');
      const workbook = read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = utils.sheet_to_json(sheet);
      
      console.log(`Found ${rows.length} rows in Excel file`);
      
      // Map to our schema - IDD columns are: DRUGNAME, STR, RXCUI, SAB
      const mappings: Array<{
        brand_name: string;
        brand_name_normalized: string;
        generic_name: string;
        rxcui: string | null;
        country_code: string | null;
        source: string;
      }> = [];
      
      for (const row of rows as any[]) {
        const brandName = row['DRUGNAME'] || row['drugname'] || row['DrugName'] || row['Brand_Name'] || row['brand_name'];
        const genericName = row['STR'] || row['str'] || row['Generic_Name'] || row['generic_name'] || row['GENERIC'];
        const rxcui = row['RXCUI'] || row['rxcui'] || row['RxCUI'];
        const countryCode = row['SAB'] || row['sab'] || row['Country'] || row['country_code'];
        
        if (brandName && genericName) {
          mappings.push({
            brand_name: String(brandName).trim(),
            brand_name_normalized: String(brandName).trim().toLowerCase(),
            generic_name: String(genericName).trim(),
            rxcui: rxcui ? String(rxcui).trim() : null,
            country_code: countryCode ? String(countryCode).trim() : null,
            source: 'mendeley_idd',
          });
        }
      }
      
      console.log(`Prepared ${mappings.length} valid mappings for import`);
      
      if (mappings.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No valid mappings found in file', columns: Object.keys(rows[0] || {}) }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Insert in batches of 500
      const batchSize = 500;
      let inserted = 0;
      let errors = 0;
      
      for (let i = 0; i < mappings.length; i += batchSize) {
        const batch = mappings.slice(i, i + batchSize);
        
        const { error } = await supabase
          .from('international_drug_mappings')
          .upsert(batch, {
            onConflict: 'brand_name_normalized',
            ignoreDuplicates: false,
          });
        
        if (error) {
          console.error(`Batch ${i / batchSize + 1} error:`, error);
          errors += batch.length;
        } else {
          inserted += batch.length;
          console.log(`Inserted batch ${i / batchSize + 1}: ${batch.length} records`);
        }
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          total_rows: rows.length,
          valid_mappings: mappings.length,
          inserted,
          errors,
          sample: mappings.slice(0, 5),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (action === 'get-stats') {
      const { count, error } = await supabase
        .from('international_drug_mappings')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      
      return new Response(
        JSON.stringify({ total_mappings: count }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Import error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
