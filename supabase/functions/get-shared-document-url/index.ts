import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the clinician's identity
    const supabaseAuth = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { documentShareId } = await req.json();
    if (!documentShareId) {
      return new Response(JSON.stringify({ error: "documentShareId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the share is active and belongs to this clinician
    const { data: share, error: shareError } = await supabaseAuth
      .from("document_shares")
      .select(`
        id,
        document_id,
        user_id,
        is_active,
        provider_share_id,
        provider_shares!inner (
          id,
          clinician_user_id,
          provider_email,
          is_active,
          expires_at
        )
      `)
      .eq("id", documentShareId)
      .eq("is_active", true)
      .single();

    if (shareError || !share) {
      return new Response(JSON.stringify({ error: "Share not found or inactive" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ps = (share as any).provider_shares;
    const isClinicianOwner =
      ps.clinician_user_id === user.id || ps.provider_email === user.email;

    if (!isClinicianOwner || !ps.is_active) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (ps.expires_at && new Date(ps.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Share link has expired" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the document file path
    const { data: doc, error: docError } = await supabaseAuth
      .from("health_documents")
      .select("file_path, file_name, user_id")
      .eq("id", share.document_id)
      .single();

    if (docError || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate a signed URL (5 minutes)
    const { data: signedUrl, error: urlError } = await supabaseAuth.storage
      .from("health-documents")
      .createSignedUrl(doc.file_path, 300);

    if (urlError || !signedUrl) {
      return new Response(JSON.stringify({ error: "Failed to generate URL" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log access in audit trail
    await supabaseAuth.from("access_audit_logs").insert({
      actor_user_id: user.id,
      target_user_id: doc.user_id,
      share_id: share.provider_share_id,
      resource_id: share.document_id,
      action: "document_download",
      resource_type: "health_document",
      metadata: { document_share_id: documentShareId, file_name: doc.file_name },
    });

    return new Response(
      JSON.stringify({ signedUrl: signedUrl.signedUrl, fileName: doc.file_name }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
