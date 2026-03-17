import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId } = await req.json();
    if (!documentId) {
      return new Response(JSON.stringify({ error: "documentId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch the document record
    const { data: doc, error: docError } = await supabase
      .from("health_documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docError || !doc) {
      console.error("Document not found:", docError);
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!lovableApiKey) {
      console.error("LOVABLE_API_KEY not configured, skipping AI summarization");
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download the actual file from storage to analyze its content
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("health-documents")
      .download(doc.file_path);

    if (downloadError || !fileData) {
      console.error("Failed to download file:", downloadError);
      return new Response(JSON.stringify({ error: "Failed to download file for analysis" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build messages array with file content for multimodal analysis
    const mimeType = doc.mime_type || "application/octet-stream";
    const isImage = mimeType.startsWith("image/");
    const isPdf = mimeType === "application/pdf";
    const isText = mimeType.startsWith("text/") || mimeType === "application/json";

    const systemPrompt = `You are a health document analyzer. Analyze the provided document and return:
1. A clear 2-4 sentence summary of what this document contains, including key findings, values, or information
2. A suggested category (one of: lab_result, prescription, discharge_summary, imaging, insurance, vaccination, referral, visit_note, other)
3. 3-5 relevant tags for searchability

Additional context from the user:
- User-assigned category: ${doc.category}
- User-assigned title: ${doc.title || "Not provided"}
- User notes: ${doc.notes || "None"}
- Document date: ${doc.document_date || "Not specified"}
- File name: ${doc.file_name}`;

    let messages: any[];

    if (isImage || isPdf) {
      // Convert file to base64 for multimodal models
      const arrayBuffer = await fileData.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let base64 = "";
      // Encode in chunks to avoid stack overflow on large files
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        base64 += String.fromCharCode(...chunk);
      }
      base64 = btoa(base64);

      const dataUrl = `data:${mimeType};base64,${base64}`;

      messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: dataUrl },
            },
            {
              type: "text",
              text: "Please analyze this health document thoroughly. Extract key findings, values, diagnoses, medications, or any clinically relevant information and provide a detailed summary.",
            },
          ],
        },
      ];
    } else if (isText) {
      // Read text content directly
      const textContent = await fileData.text();
      const truncated = textContent.slice(0, 15000); // Limit to ~15k chars

      messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Please analyze this health document thoroughly. Extract key findings, values, diagnoses, medications, or any clinically relevant information and provide a detailed summary.\n\n--- Document Content ---\n${truncated}`,
        },
      ];
    } else {
      // Fallback: metadata-only analysis for unsupported file types
      messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Based on the document metadata provided in the system prompt, provide your best analysis. The file type (${mimeType}) cannot be directly read.`,
        },
      ];
    }

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          tools: [
            {
              type: "function",
              function: {
                name: "classify_document",
                description: "Classify and summarize a health document based on its actual content",
                parameters: {
                  type: "object",
                  properties: {
                    summary: { type: "string", description: "2-4 sentence summary with key findings" },
                    category: {
                      type: "string",
                      enum: [
                        "lab_result", "prescription", "discharge_summary",
                        "imaging", "insurance", "vaccination",
                        "referral", "visit_note", "other",
                      ],
                    },
                    tags: {
                      type: "array",
                      items: { type: "string" },
                      description: "3-5 relevant tags",
                    },
                  },
                  required: ["summary", "category", "tags"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "classify_document" } },
        }),
      }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "AI processing failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let result = { summary: "", category: doc.category, tags: [] as string[] };
    if (toolCall?.function?.arguments) {
      try {
        result = JSON.parse(toolCall.function.arguments);
      } catch {
        console.error("Failed to parse AI response");
      }
    }

    // Update the document with AI results
    const { error: updateError } = await supabase
      .from("health_documents")
      .update({
        ai_summary: result.summary,
        ai_category: result.category,
        ai_tags: result.tags,
      })
      .eq("id", documentId);

    if (updateError) {
      console.error("Failed to update document:", updateError);
    }

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
