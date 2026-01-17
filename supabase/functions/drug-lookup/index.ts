import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schemas
const SearchRequestSchema = z.object({
  action: z.enum(['search', 'get-info', 'get-rxcui', 'check-interactions', 'lookup-ndc']),
  query: z.string().max(200).optional(),
  drugName: z.string().max(200).optional(),
  drugNames: z.array(z.string().max(200)).max(20).optional(),
  ndc: z.string().max(20).regex(/^[\d\-]+$/, 'Invalid NDC format').optional(),
});

type SearchRequest = z.infer<typeof SearchRequestSchema>;

// Clean HTML from label text
const cleanLabelText = (text: string | undefined): string => {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 2000);
};

// Search DailyMed for medications
async function searchMedications(query: string) {
  try {
    const response = await fetch(
      `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=${encodeURIComponent(query)}&pagesize=10`
    );
    
    if (!response.ok) return [];
    
    const data = await response.json();
    
    return (data.data || []).map((item: any) => ({
      setId: item.setid,
      name: item.title,
      labeler: item.labeler,
      productType: item.product_type,
    }));
  } catch (error) {
    console.error('DailyMed search error:', error);
    return [];
  }
}

// Get detailed medication info
async function getMedicationInfo(drugName: string) {
  try {
    // First, search for the drug to get its setId
    const searchResponse = await fetch(
      `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=${encodeURIComponent(drugName)}&pagesize=1`
    );
    
    if (!searchResponse.ok) {
      throw new Error('Failed to search medication');
    }
    
    const searchData = await searchResponse.json();
    
    if (!searchData.data || searchData.data.length === 0) {
      return null;
    }

    const setId = searchData.data[0].setid;
    
    // Get detailed label information using OpenFDA
    const fdaResponse = await fetch(
      `https://api.fda.gov/drug/label.json?search=set_id:"${setId}"&limit=1`
    );
    
    let labelData: any = {
      setId,
      name: searchData.data[0].title,
    };

    if (fdaResponse.ok) {
      const fdaData = await fdaResponse.json();
      const result = fdaData.results?.[0];
      
      if (result) {
        labelData = {
          setId,
          name: result.openfda?.brand_name?.[0] || searchData.data[0].title,
          genericName: result.openfda?.generic_name?.[0],
          manufacturerName: result.openfda?.manufacturer_name?.[0],
          dosageForm: result.dosage_form?.[0],
          route: result.openfda?.route,
          activeIngredients: result.openfda?.substance_name,
          indications: cleanLabelText(result.indications_and_usage?.[0]),
          warnings: cleanLabelText(result.warnings?.[0] || result.boxed_warning?.[0]),
          adverseReactions: cleanLabelText(result.adverse_reactions?.[0]),
          dosageAndAdministration: cleanLabelText(result.dosage_and_administration?.[0]),
          howSupplied: cleanLabelText(result.how_supplied?.[0]),
          drugInteractions: cleanLabelText(result.drug_interactions?.[0]),
          contraindications: cleanLabelText(result.contraindications?.[0]),
          pregnancyInfo: cleanLabelText(result.pregnancy?.[0]),
          pediatricUse: cleanLabelText(result.pediatric_use?.[0]),
          geriatricUse: cleanLabelText(result.geriatric_use?.[0]),
        };
      }
    }

    return labelData;
  } catch (error) {
    console.error('Medication info error:', error);
    throw error;
  }
}

// Get RxCUI for a drug name
async function getRxCui(drugName: string): Promise<string | null> {
  try {
    // First try exact match
    const response = await fetch(
      `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(drugName)}&search=1`
    );
    const data = await response.json();
    
    if (data.idGroup?.rxnormId?.[0]) {
      return data.idGroup.rxnormId[0];
    }

    // Try approximate match
    const approxResponse = await fetch(
      `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(drugName)}&maxEntries=1`
    );
    const approxData = await approxResponse.json();
    
    if (approxData.approximateGroup?.candidate?.[0]?.rxcui) {
      return approxData.approximateGroup.candidate[0].rxcui;
    }

    return null;
  } catch (err) {
    console.error('Error fetching RxCUI:', err);
    return null;
  }
}

// Check drug interactions
async function checkInteractions(drugNames: string[]) {
  if (drugNames.length < 2) return [];
  
  try {
    // Get RxCUIs for all drugs in parallel
    const rxcuiPromises = drugNames.map(name => getRxCui(name));
    const rxcuis = await Promise.all(rxcuiPromises);
    
    // Filter out drugs without RxCUIs
    const validRxcuis = rxcuis.filter((rxcui): rxcui is string => rxcui !== null);
    
    if (validRxcuis.length < 2) {
      return [];
    }

    // Call the interaction API
    const interactionResponse = await fetch(
      `https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis=${validRxcuis.join('+')}`
    );
    const interactionData = await interactionResponse.json();
    
    const interactions: any[] = [];
    
    if (interactionData.fullInteractionTypeGroup) {
      for (const group of interactionData.fullInteractionTypeGroup) {
        for (const interactionType of group.interactionType || []) {
          for (const pair of interactionType.interactionPair || []) {
            // Extract drug names from the interaction
            const drugs = pair.interactionConcept.map((c: any) => c.minConceptItem.name);
            
            // Determine severity based on description keywords
            let severity: 'high' | 'moderate' | 'low' = 'moderate';
            const desc = pair.description.toLowerCase();
            
            if (
              desc.includes('contraindicated') ||
              desc.includes('avoid') ||
              desc.includes('serious') ||
              desc.includes('severe') ||
              desc.includes('fatal') ||
              desc.includes('death') ||
              desc.includes('life-threatening') ||
              desc.includes('do not use') ||
              desc.includes('serotonin syndrome') ||
              desc.includes('qt prolongation') ||
              desc.includes('bleeding')
            ) {
              severity = 'high';
            } else if (
              desc.includes('minor') ||
              desc.includes('unlikely') ||
              desc.includes('theoretical') ||
              desc.includes('not clinically significant')
            ) {
              severity = 'low';
            }

            interactions.push({
              drug1: drugs[0] || 'Unknown',
              drug2: drugs[1] || 'Unknown',
              severity,
              description: pair.description,
              source: group.sourceName,
              sourceUrl: pair.interactionConcept[0]?.sourceConceptItem?.url,
            });
          }
        }
      }
    }
    
    // Sort by severity
    return interactions.sort((a, b) => {
      const order = { high: 0, moderate: 1, low: 2 };
      return order[a.severity as keyof typeof order] - order[b.severity as keyof typeof order];
    });
  } catch (err) {
    console.error('Error fetching drug interactions:', err);
    throw err;
  }
}

// Look up medication by NDC (barcode)
async function lookupNDC(ndc: string) {
  try {
    // Clean the NDC
    const cleanNdc = ndc.replace(/[^0-9]/g, '');
    
    // Look up in RxNorm using NDC
    const response = await fetch(
      `https://rxnav.nlm.nih.gov/REST/ndcstatus.json?ndc=${cleanNdc}`
    );
    const data = await response.json();

    if (data.ndcStatus?.rxcui) {
      // Get drug name from RxCUI
      const rxcuiResponse = await fetch(
        `https://rxnav.nlm.nih.gov/REST/rxcui/${data.ndcStatus.rxcui}/properties.json`
      );
      const rxcuiData = await rxcuiResponse.json();

      if (rxcuiData.properties) {
        return {
          found: true,
          name: rxcuiData.properties.name,
          rxcui: data.ndcStatus.rxcui,
        };
      }
    }

    // Try OpenFDA as fallback
    const fdaResponse = await fetch(
      `https://api.fda.gov/drug/ndc.json?search=product_ndc:"${cleanNdc}"&limit=1`
    );
    const fdaData = await fdaResponse.json();

    if (fdaData.results?.[0]) {
      const drug = fdaData.results[0];
      return {
        found: true,
        name: drug.brand_name || drug.generic_name,
        dosageForm: drug.dosage_form,
        strength: drug.active_ingredients?.[0]?.strength,
        manufacturer: drug.labeler_name,
      };
    }

    return { found: false };
  } catch (err) {
    console.error('NDC lookup error:', err);
    throw err;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    
    // Validate input with zod
    const parseResult = SearchRequestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      console.error('Validation error:', parseResult.error.flatten());
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: parseResult.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const body: SearchRequest = parseResult.data;
    const { action } = body;

    console.log(`Drug lookup action: ${action}`);

    let result;
    
    switch (action) {
      case 'search':
        if (!body.query) {
          return new Response(
            JSON.stringify({ error: 'Query is required for search' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await searchMedications(body.query);
        break;
        
      case 'get-info':
        if (!body.drugName) {
          return new Response(
            JSON.stringify({ error: 'Drug name is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await getMedicationInfo(body.drugName);
        break;
        
      case 'get-rxcui':
        if (!body.drugName) {
          return new Response(
            JSON.stringify({ error: 'Drug name is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await getRxCui(body.drugName);
        break;
        
      case 'check-interactions':
        if (!body.drugNames || body.drugNames.length < 2) {
          return new Response(
            JSON.stringify({ error: 'At least 2 drug names are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await checkInteractions(body.drugNames);
        break;
        
      case 'lookup-ndc':
        if (!body.ndc) {
          return new Response(
            JSON.stringify({ error: 'NDC is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await lookupNDC(body.ndc);
        break;
        
      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Drug lookup error:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
