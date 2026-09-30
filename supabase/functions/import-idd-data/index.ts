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
    // Admin status comes from the roles table, never from an email list.
    const { data: isAdmin, error: roleErr } = await supabase.rpc('has_role', {
      _user_id: userData.user.id,
      _role: 'admin',
    });
    if (roleErr || isAdmin !== true) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action, fileUrl, csvContent, mappings } = body;

    // Direct batch import from client
    if (action === 'import-batch' && mappings) {
      // Deduplicate by brand_name_normalized within this batch (keep last occurrence)
      // Only the known mapping fields are written, each as bounded text.
      if (!Array.isArray(mappings) || mappings.length > 5000) {
        return new Response(JSON.stringify({ error: 'mappings must be an array of at most 5000 rows' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const text = (v: unknown, n: number) =>
        typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null;
      const uniqueMap = new Map<string, Record<string, string | null>>();
      for (const raw of mappings as Record<string, unknown>[]) {
        const brand = text(raw?.brand_name, 200);
        const normalized = text(raw?.brand_name_normalized, 200)?.toLowerCase() ?? null;
        const generic = text(raw?.generic_name, 300);
        if (!brand || !normalized || !generic) continue;
        uniqueMap.set(normalized, {
          brand_name: brand,
          brand_name_normalized: normalized,
          generic_name: generic,
          rxcui: text(raw?.rxcui, 20),
          country_code: text(raw?.country_code, 3)?.toUpperCase() ?? null,
          source: text(raw?.source, 100),
        });
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
        // Only fetch from approved public data hosts over HTTPS; never an
        // address the caller picks (internal services, metadata endpoints).
        const ALLOWED_HOSTS = new Set([
          'raw.githubusercontent.com',
          'data.nafdac.gov.ng',
          'download.nlm.nih.gov',
        ]);
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(String(fileUrl));
        } catch {
          throw new Error('Invalid fileUrl');
        }
        if (parsedUrl.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsedUrl.hostname)) {
          return new Response(JSON.stringify({ error: 'That file address is not on the approved list' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        console.log('Fetching CSV file from:', parsedUrl.hostname);
        const response = await fetch(parsedUrl.toString(), { redirect: 'error' });
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
