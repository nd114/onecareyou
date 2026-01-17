import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NIHPillResult {
  rxcui?: string;
  name?: string;
  imageUrl?: string;
  imprint?: string;
  shape?: string;
  color?: string;
  score?: number;
}

// Cross-reference with NIH RxImage database for verification
async function crossReferenceNIH(imprint?: string, shape?: string, color?: string): Promise<NIHPillResult[]> {
  if (!imprint && !shape && !color) return [];
  
  try {
    const params = new URLSearchParams();
    if (imprint) params.append('imprint', imprint);
    if (shape) params.append('shape', shape.toUpperCase());
    if (color) params.append('color', color.toUpperCase());
    params.append('imageExists', '1'); // Only return results with images
    
    const response = await fetch(
      `https://rximage.nlm.nih.gov/api/rximage/1/rxnav?${params.toString()}`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) {
      console.error('NIH RxImage API error:', response.status);
      return [];
    }
    
    const data = await response.json();
    const results: NIHPillResult[] = [];
    
    if (data.nlmRxImages && Array.isArray(data.nlmRxImages)) {
      for (const img of data.nlmRxImages.slice(0, 5)) {
        results.push({
          rxcui: img.rxcui,
          name: img.name,
          imageUrl: img.imageUrl,
          imprint: img.imprint,
          shape: img.shape,
          color: img.color,
          score: img.score,
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error querying NIH RxImage:', error);
    return [];
  }
}

// Get additional drug information from DailyMed
async function getDrugInfoFromDailyMed(drugName: string): Promise<{ setId?: string; warnings?: string[] }> {
  try {
    const response = await fetch(
      `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=${encodeURIComponent(drugName)}&pagesize=1`
    );
    
    if (!response.ok) return {};
    
    const data = await response.json();
    if (data.data && data.data.length > 0) {
      return { setId: data.data[0].setid };
    }
    
    return {};
  } catch (error) {
    console.error('Error querying DailyMed:', error);
    return {};
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image, manualSearch } = await req.json();
    
    // Handle manual search without image
    if (manualSearch && !image) {
      const { imprint, shape, color } = manualSearch;
      const nihResults = await crossReferenceNIH(imprint, shape, color);
      
      if (nihResults.length === 0) {
        return new Response(
          JSON.stringify({
            identified: false,
            confidence: "low",
            notes: "No matching medications found in the NIH database with the provided characteristics.",
            nihMatches: [],
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Get additional info for the top match
      const topMatch = nihResults[0];
      const dailyMedInfo = topMatch.name ? await getDrugInfoFromDailyMed(topMatch.name) : {};
      
      return new Response(
        JSON.stringify({
          identified: true,
          confidence: "medium",
          name: topMatch.name,
          imprint: topMatch.imprint,
          shape: topMatch.shape,
          color: topMatch.color,
          rxcui: topMatch.rxcui,
          nihMatches: nihResults,
          dailyMedSetId: dailyMedInfo.setId,
          verificationSource: "NIH RxImage Database",
          notes: "Identification based on NIH RxImage database. Always verify with a pharmacist.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (!image) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use Gemini vision to analyze the pill image
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a medication identification assistant. Analyze the pill/medication image and identify it based on visible characteristics like shape, color, imprint codes, and markings.

IMPORTANT: You must respond with a JSON object in this exact format:
{
  "identified": true/false,
  "confidence": "high"/"medium"/"low",
  "name": "medication name or null",
  "genericName": "generic name if different",
  "imprint": "any visible imprint code",
  "shape": "round/oval/capsule/etc",
  "color": "primary color",
  "manufacturer": "if identifiable",
  "strength": "if identifiable",
  "warnings": ["any important warnings"],
  "notes": "additional observations"
}

If you cannot identify the medication with reasonable confidence, set identified to false and provide whatever characteristics you can observe.

NEVER provide medical advice. Always recommend consulting a pharmacist or doctor for verification.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Please identify this medication from the image. Describe its visual characteristics and attempt to identify what it is."
              },
              {
                type: "image_url",
                image_url: {
                  url: image
                }
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Failed to analyze image" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "No response from AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the JSON from the response
    let result;
    try {
      // Try to extract JSON from the response (it might be wrapped in markdown code blocks)
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                        content.match(/```\s*([\s\S]*?)\s*```/) ||
                        [null, content];
      const jsonStr = jsonMatch[1] || content;
      result = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      // Return a structured response even if parsing fails
      result = {
        identified: false,
        confidence: "low",
        notes: content,
        error: "Could not parse structured response"
      };
    }

    // Cross-reference with NIH database if we have identifying features
    if (result.imprint || result.shape || result.color) {
      const nihResults = await crossReferenceNIH(
        result.imprint,
        result.shape,
        result.color
      );
      
      result.nihMatches = nihResults;
      result.nihVerified = nihResults.length > 0 && nihResults.some(
        (n: NIHPillResult) => n.name?.toLowerCase().includes(result.name?.toLowerCase() || '') ||
             result.name?.toLowerCase().includes(n.name?.toLowerCase() || '')
      );
      
      if (result.nihVerified) {
        result.verificationSource = "NIH RxImage Database";
        result.confidence = "high";
      }
      
      // Get DailyMed info for the identified medication
      if (result.name) {
        const dailyMedInfo = await getDrugInfoFromDailyMed(result.name);
        if (dailyMedInfo.setId) {
          result.dailyMedSetId = dailyMedInfo.setId;
        }
      }
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in identify-pill:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});