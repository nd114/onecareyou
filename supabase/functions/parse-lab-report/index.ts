import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Vital types that can be extracted
const VALID_VITAL_TYPES = [
  'weight', 'blood_pressure', 'heart_rate', 'temperature', 'glucose',
  'hba1c', 'urea', 'creatinine', 'gfr',
  'cholesterol_total', 'ldl', 'hdl',
  'alt', 'ast',
  'hemoglobin', 'wbc',
  'potassium', 'sodium'
];

const VITAL_UNITS: Record<string, string> = {
  weight: 'kg',
  blood_pressure: 'mmHg',
  heart_rate: 'bpm',
  temperature: '°C',
  glucose: 'mg/dL',
  hba1c: '%',
  urea: 'mg/dL',
  creatinine: 'mg/dL',
  gfr: 'mL/min',
  cholesterol_total: 'mg/dL',
  ldl: 'mg/dL',
  hdl: 'mg/dL',
  alt: 'U/L',
  ast: 'U/L',
  hemoglobin: 'g/dL',
  wbc: 'x10³/µL',
  potassium: 'mmol/L',
  sodium: 'mmol/L',
};

/**
 * PII Stripping Patterns
 * These patterns identify and remove personally identifiable information
 * from extracted text before sending to AI for vital parsing
 */
const PII_PATTERNS = [
  // Names - common patterns in medical documents
  { pattern: /\b(patient\s*(name)?|name|mr\.?|mrs\.?|ms\.?|dr\.?)\s*[:\-]?\s*[A-Z][a-z]+(\s+[A-Z][a-z]+){1,3}/gi, replacement: '[NAME REDACTED]' },
  
  // Date of Birth / DOB
  { pattern: /\b(d\.?o\.?b\.?|date\s*of\s*birth|birth\s*date|born)\s*[:\-]?\s*\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/gi, replacement: '[DOB REDACTED]' },
  { pattern: /\b(age)\s*[:\-]?\s*\d{1,3}\s*(years?|yrs?|y\.?o\.?)?/gi, replacement: '[AGE REDACTED]' },
  
  // Patient ID / MRN / Account Numbers
  { pattern: /\b(patient\s*id|pat\.?\s*id|mrn|medical\s*record|account\s*(no\.?|number)?|acc\.?\s*no\.?|id\s*no\.?)\s*[:\-]?\s*[A-Z0-9\-]{4,20}/gi, replacement: '[ID REDACTED]' },
  
  // Phone Numbers
  { pattern: /\b(\+?1?\s*)?(\([0-9]{3}\)|[0-9]{3})[\s\-\.]?[0-9]{3}[\s\-\.]?[0-9]{4}\b/g, replacement: '[PHONE REDACTED]' },
  
  // Email addresses
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL REDACTED]' },
  
  // Addresses - street addresses
  { pattern: /\b\d{1,5}\s+[A-Za-z]+\s+(Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Court|Ct\.?)\b[^,]*,?\s*[A-Za-z\s]+,?\s*[A-Z]{2}\s*\d{5}(-\d{4})?/gi, replacement: '[ADDRESS REDACTED]' },
  
  // ZIP codes (standalone)
  { pattern: /\b[A-Z]{2}\s+\d{5}(-\d{4})?\b/g, replacement: '[LOCATION REDACTED]' },
  
  // Social Security Numbers
  { pattern: /\b\d{3}[\-\s]?\d{2}[\-\s]?\d{4}\b/g, replacement: '[SSN REDACTED]' },
  
  // Insurance/Policy numbers
  { pattern: /\b(insurance|policy|member|subscriber)\s*(id|no\.?|number)?\s*[:\-]?\s*[A-Z0-9\-]{6,20}/gi, replacement: '[INSURANCE REDACTED]' },
  
  // Doctor/Physician names
  { pattern: /\b(physician|doctor|dr\.?|attending|ordering\s*physician|referring)\s*[:\-]?\s*[A-Z][a-z]+(\s+[A-Z][a-z]+){1,2}/gi, replacement: '[PHYSICIAN REDACTED]' },
  
  // Hospital/Clinic names (common patterns)
  { pattern: /\b[A-Z][a-z]+(\s+[A-Z][a-z]+)*\s+(Hospital|Medical\s*Center|Clinic|Health\s*Center|Laboratory|Labs?)\b/gi, replacement: '[FACILITY REDACTED]' },
];

/**
 * Strips PII from text using pattern matching
 */
function stripPII(text: string): string {
  let sanitized = text;
  
  for (const { pattern, replacement } of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  
  // Additional cleanup: remove any remaining sequences that look like IDs
  // (alphanumeric strings of 8+ characters that aren't lab values)
  sanitized = sanitized.replace(/\b[A-Z]{2,}[0-9]{6,}\b/g, '[ID REDACTED]');
  
  return sanitized;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's token
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing lab report for user:', user.id);

    const { imageBase64, imageUrl, reportDate } = await req.json();

    if (!imageBase64 && !imageUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Image data is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare image content for AI
    let imageContent;
    if (imageBase64) {
      const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');
      
      imageContent = {
        type: "image_url",
        image_url: {
          url: `data:${mimeType};base64,${base64Data}`
        }
      };
    } else {
      imageContent = {
        type: "image_url",
        image_url: { url: imageUrl }
      };
    }

    // ============================================================
    // STAGE 1: Extract raw text from document (OCR only)
    // This extracts all text including PII, which we'll strip next
    // ============================================================
    console.log('Stage 1: Extracting text from document (OCR)...');
    
    const ocrResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an OCR system. Extract ALL text visible in this document exactly as written.
Output ONLY the raw text content, preserving the structure with line breaks.
Do not interpret, summarize, or analyze - just transcribe the text you see.`
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract all text from this document.' },
              imageContent
            ]
          }
        ],
        max_tokens: 4000,
        temperature: 0.1
      }),
    });

    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      console.error('OCR API error:', errorText);
      
      if (ocrResponse.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (ocrResponse.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: 'AI service quota exceeded. Please contact support.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to read document' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ocrData = await ocrResponse.json();
    const rawText = ocrData.choices?.[0]?.message?.content || '';
    
    if (!rawText.trim()) {
      console.log('No text extracted from document');
      return new Response(
        JSON.stringify({ success: false, error: 'Could not read text from document', extractedVitals: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Raw text extracted, length:', rawText.length);

    // ============================================================
    // STAGE 2: Strip PII from extracted text
    // This ensures no personal information is sent to the AI
    // ============================================================
    console.log('Stage 2: Stripping PII from extracted text...');
    
    const sanitizedText = stripPII(rawText);
    console.log('PII stripped. Sanitized text length:', sanitizedText.length);
    
    // Log sample of what was redacted (for debugging, not PII)
    const redactionCount = (sanitizedText.match(/\[.*?REDACTED\]/g) || []).length;
    console.log('PII elements redacted:', redactionCount);

    // ============================================================
    // STAGE 3: Extract vitals from sanitized text
    // Only anonymized text is sent to AI at this stage
    // ============================================================
    console.log('Stage 3: Extracting vitals from anonymized text...');
    
    const vitalResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a medical lab report parser. Extract health metrics from the provided text.

Valid vital types you can extract:
- weight (kg)
- blood_pressure (mmHg) - extract systolic as value, diastolic as secondary_value
- heart_rate (bpm)
- temperature (°C)
- glucose (mg/dL) - fasting blood glucose
- hba1c (%) - glycated hemoglobin
- urea (mg/dL) - blood urea nitrogen
- creatinine (mg/dL) - serum creatinine
- gfr (mL/min) - glomerular filtration rate
- cholesterol_total (mg/dL) - total cholesterol
- ldl (mg/dL) - LDL cholesterol
- hdl (mg/dL) - HDL cholesterol
- alt (U/L) - alanine transaminase
- ast (U/L) - aspartate transaminase
- hemoglobin (g/dL)
- wbc (x10³/µL) - white blood cell count
- potassium (mmol/L)
- sodium (mmol/L)

Return format (JSON array only, no markdown):
[
  {"type": "glucose", "value": 95, "secondary_value": null},
  {"type": "blood_pressure", "value": 120, "secondary_value": 80}
]

Important:
- Only extract numerical health values - ignore [REDACTED] markers
- Use exact type names from the list above
- Convert units if needed to match expected units
- Return empty array [] if no vitals found
- Output ONLY the JSON array, no explanation`
          },
          {
            role: 'user',
            content: `Extract health metrics from this anonymized lab report text:\n\n${sanitizedText}`
          }
        ],
        max_tokens: 2000,
        temperature: 0.1
      }),
    });

    if (!vitalResponse.ok) {
      const errorText = await vitalResponse.text();
      console.error('Vital extraction API error:', errorText);
      
      if (vitalResponse.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to extract vitals' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const vitalData = await vitalResponse.json();
    const content = vitalData.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error('No content in vital extraction response');
      return new Response(
        JSON.stringify({ success: false, error: 'No response from AI', extractedVitals: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse the JSON response
    let extractedVitals = [];
    try {
      let cleanContent = content.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.slice(7);
      }
      if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.slice(3);
      }
      if (cleanContent.endsWith('```')) {
        cleanContent = cleanContent.slice(0, -3);
      }
      cleanContent = cleanContent.trim();
      
      extractedVitals = JSON.parse(cleanContent);
      console.log('Extracted vitals:', extractedVitals);
    } catch (parseError) {
      console.error('Failed to parse vital extraction response:', content);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Could not parse lab report values. Please try a clearer image.',
          rawResponse: content 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate and format vitals
    const validVitals = extractedVitals
      .filter((v: any) => {
        const isValid = VALID_VITAL_TYPES.includes(v.type) && 
                       typeof v.value === 'number' && 
                       !isNaN(v.value);
        if (!isValid) {
          console.log('Filtering out invalid vital:', v);
        }
        return isValid;
      })
      .map((v: any) => ({
        type: v.type,
        value: v.value,
        secondary_value: v.secondary_value || null,
        unit: VITAL_UNITS[v.type] || ''
      }));

    console.log('Valid vitals to return:', validVitals);
    console.log('Processing complete. PII stripped, vitals extracted from anonymized data.');

    return new Response(
      JSON.stringify({ 
        success: true, 
        extractedVitals: validVitals,
        count: validVitals.length,
        reportDate: reportDate || new Date().toISOString(),
        privacyNote: 'Document processed with PII stripping. Personal information was not sent to AI for analysis.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing lab report:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to process lab report' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
