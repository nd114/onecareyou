import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Parse CSV line handling quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authenticated admin user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const adminAllowlist = (Deno.env.get('ADMIN_EMAIL_ALLOWLIST') ?? '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const userEmail = (userData.user.email ?? '').toLowerCase();
    if (adminAllowlist.length > 0 && !adminAllowlist.includes(userEmail)) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (adminAllowlist.length === 0) {
      // Fail closed if no allowlist configured
      return new Response(JSON.stringify({ error: 'Admin allowlist not configured' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action, fileUrl, csvContent, mappings } = body;

    // Direct batch import from client
    if (action === 'import-batch' && mappings) {
      // Deduplicate by brand_name_normalized within this batch (keep last occurrence)
      const uniqueMap = new Map<string, typeof mappings[0]>();
      for (const m of mappings) {
        uniqueMap.set(m.brand_name_normalized, m);
      }
      const dedupedMappings = Array.from(uniqueMap.values());
      
      console.log(`Importing batch: ${mappings.length} -> ${dedupedMappings.length} after dedup`);
      
      const { error } = await supabase
        .from('international_drug_mappings')
        .upsert(dedupedMappings, {
          onConflict: 'brand_name_normalized',
          ignoreDuplicates: false,
        });
      
      if (error) {
        console.error('Batch upsert error:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message, errors: dedupedMappings.length }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: true, inserted: dedupedMappings.length, duplicatesRemoved: mappings.length - dedupedMappings.length, errors: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'import-from-url' || action === 'import-csv') {
      let csvText: string;
      
      if (action === 'import-csv' && csvContent) {
        csvText = csvContent;
        console.log('Processing direct CSV content...');
      } else if (fileUrl) {
        console.log('Fetching CSV file from:', fileUrl);
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.status}`);
        }
        csvText = await response.text();
      } else {
        throw new Error('Either fileUrl or csvContent is required');
      }
      
      const lines = csvText.split('\n').filter(line => line.trim());
      console.log(`Found ${lines.length} lines in CSV`);
      
      const dataLines = lines.slice(1);
      
      const parsedMappings: Array<{
        brand_name: string;
        brand_name_normalized: string;
        generic_name: string;
        rxcui: string | null;
        country_code: string | null;
        source: string;
      }> = [];
      
      for (const line of dataLines) {
        const cols = parseCSVLine(line);
        const brandName = cols[0];
        const rxcui = cols[2];
        const genericName = cols[3];
        const countryCode = cols[4];
        
        if (brandName && genericName) {
          parsedMappings.push({
            brand_name: brandName,
            brand_name_normalized: brandName.toLowerCase(),
            generic_name: genericName,
            rxcui: rxcui || null,
            country_code: countryCode || null,
            source: 'mendeley_idd',
          });
        }
      }
      
      console.log(`Prepared ${parsedMappings.length} valid mappings for import`);
      
      if (parsedMappings.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No valid mappings found in file' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const batchSize = 500;
      let inserted = 0;
      let errors = 0;
      
      for (let i = 0; i < parsedMappings.length; i += batchSize) {
        const batch = parsedMappings.slice(i, i + batchSize);
        
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
          console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}: ${batch.length} records`);
        }
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          total_lines: lines.length,
          valid_mappings: parsedMappings.length,
          inserted,
          errors,
          sample: parsedMappings.slice(0, 5),
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
        JSON.stringify({ count }),
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
