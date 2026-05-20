import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_SYSTEM_PROMPT = `You are OneCare Assistant, a helpful guide for the OneCare health platform.

RULES:
1. You are NOT a doctor. NEVER diagnose, prescribe, change doses, or recommend specific treatments.
2. For any dose, interaction, or treatment-change question, say: "Please consult your prescriber — they can review your full record."
3. You CAN explain general health concepts (e.g., "What is blood pressure?", "What does HbA1c mean?") and what a drug *class* generally does.
4. You CAN reference the user's own listed medications by name when relevant, but never tell them to start, stop, or change a dose.
5. For red-flag symptoms (chest pain, stroke signs, severe bleeding, suicidal thoughts) tell them to call emergency services immediately.
6. You CAN help users navigate the platform using the route map below.
7. Be empathetic, clear, concise. If unsure, say so honestly. Keep responses under 300 words.

PLATFORM ROUTE MAP (use these to help users navigate):
- Add medication → /medications (then click "Add Medication")
- Check vitals / health metrics → /vitals
- View schedule → /schedule
- Share with doctor / Care Circle → /care-circle
- Change settings → /settings
- View pricing / upgrade → /pricing
- Help / Knowledge Base → /knowledge-base
- Medication info library → /medication-info
- Health Vault / documents → /health-vault
- Family dashboard → /family
- Adherence report → /adherence-report
- Messages with your care team → /messages

When a user asks about navigation, include the route in your response using this exact format:
[NAVIGATE:/path] — the app will detect this and offer a navigation button.

IMPORTANT: Every response must end with this disclaimer on a new line:
"⚠️ This is general information only and not medical advice. Always consult your healthcare provider."`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    // Verify user auth
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check AI consent
    const { data: profile } = await supabase
      .from("profiles")
      .select("ai_processing_consent")
      .eq("user_id", user.id)
      .single();

    if (!profile?.ai_processing_consent) {
      return new Response(
        JSON.stringify({ error: "AI consent required. Please enable AI processing in Settings." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only send last 10 messages for context window management
    const recentMessages = messages.slice(-10);

    // Build per-user medication context (consent already verified above).
    // Cap to 20 active meds; only fields needed for general guidance.
    let medContext = "";
    try {
      const { data: meds } = await supabase
        .from("medications")
        .select("name, dosage, frequency")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(20);
      if (meds && meds.length > 0) {
        const list = meds
          .map((m: any) => `- ${m.name}${m.dosage ? ` ${m.dosage}` : ""}${m.frequency ? ` (${m.frequency})` : ""}`)
          .join("\n");
        medContext = `\n\nUSER'S CURRENT ACTIVE MEDICATIONS (for context only — never advise dose changes):\n${list}`;
      }
    } catch (e) {
      console.warn("med context fetch failed", e);
    }

    const systemPrompt = BASE_SYSTEM_PROMPT + medContext;

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            ...recentMessages,
          ],
          max_tokens: 1024,
          temperature: 0.7,
        }),
      }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "I'm receiving too many requests right now. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI service temporarily unavailable." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Failed to get AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "I'm sorry, I couldn't generate a response. Please try again.";

    // Extract navigation route if present
    const routeMatch = content.match(/\[NAVIGATE:(\/[^\]]+)\]/);
    const suggestedRoute = routeMatch ? routeMatch[1] : null;

    // Clean the navigate tag from visible text
    const cleanContent = content.replace(/\[NAVIGATE:\/[^\]]+\]/g, "").trim();

    return new Response(
      JSON.stringify({ content: cleanContent, suggestedRoute }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
