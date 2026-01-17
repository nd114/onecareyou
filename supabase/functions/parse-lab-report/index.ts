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
      // Detect mime type from base64 header or default to jpeg
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

    console.log('Calling AI to extract vitals from lab report...');

    // Call Lovable AI to extract vitals
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: `You are a medical lab report parser. Extract health metrics from lab reports and blood tests.

Your task is to identify and extract numerical health values from the image. Return ONLY a valid JSON array.

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
  {"type": "blood_pressure", "value": 120, "secondary_value": 80},
  {"type": "cholesterol_total", "value": 185, "secondary_value": null}
]

Important:
- Only include vitals you can clearly identify in the image
- Use exact type names from the list above
- Convert units if needed to match the expected units
- If you cannot find any vitals, return an empty array []
- Do NOT include any explanation or markdown, just the JSON array`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract all health metrics from this lab report. Return only a JSON array with the values found.'
              },
              imageContent
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.1
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to process image with AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    console.log('AI response received');

    const content = aiData.choices?.[0]?.message?.content;
    if (!content) {
      console.error('No content in AI response');
      return new Response(
        JSON.stringify({ success: false, error: 'No response from AI', extractedVitals: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse the JSON response
    let extractedVitals = [];
    try {
      // Clean up potential markdown formatting
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
      console.error('Failed to parse AI response:', content);
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

    return new Response(
      JSON.stringify({ 
        success: true, 
        extractedVitals: validVitals,
        count: validVitals.length,
        reportDate: reportDate || new Date().toISOString()
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
