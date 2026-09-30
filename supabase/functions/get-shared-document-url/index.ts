import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { confirmedEmailOf, isClinicianAccount, shareOpensTo } from "../_shared/share-access.ts";

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

    // Two ways in, matching the two ways a patient can share a document.
    //
    //   documentShareId   — the patient shared this one document (default).
    //   documentId + providerShareId — the patient switched on whole-vault
    //                       access for this clinician.
    //
    // Both end at the same checks: the share must belong to this caller, be
    // active, and not have expired. Whole-vault additionally requires the
    // documents permission and that the document really belongs to that
    // patient — without that second check a clinician with vault access to one
    // patient could name any document id at all.
    const { documentShareId, documentId, providerShareId } = await req.json();

    if (!documentShareId && !(documentId && providerShareId)) {
      return new Response(
        JSON.stringify({ error: "documentShareId, or documentId with providerShareId, required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let ps: any = null;
    let resolvedDocumentId: string | null = null;
    let auditShareId: string | null = null;

    if (documentShareId) {
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
            expires_at,
            user_id,
            permissions
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

      ps = (share as any).provider_shares;
      resolvedDocumentId = share.document_id;
      auditShareId = share.provider_share_id;
    } else {
      const { data: share, error: shareError } = await supabaseAuth
        .from("provider_shares")
        .select("id, clinician_user_id, provider_email, is_active, expires_at, user_id, permissions")
        .eq("id", providerShareId)
        .single();

      if (shareError || !share) {
        return new Response(JSON.stringify({ error: "Share not found or inactive" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if ((share as any).permissions?.documents !== true) {
        return new Response(JSON.stringify({ error: "Access denied" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      ps = share;
      resolvedDocumentId = documentId;
      auditShareId = share.id;
    }

    if (ps.expires_at && new Date(ps.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Share link has expired" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Same rule as clinician_has_patient_permission(): the share is claimed by
    // this caller, or addressed to an email they have CONFIRMED. Comparing
    // against user.email as typed let an unconfirmed look-alike account
    // download documents shared with the real clinician.
    // And the caller must be a clinician: a patient account whose confirmed
    // address matched a share used to get the file too.
    const caller = {
      id: user.id,
      confirmedEmail: confirmedEmailOf(user),
      isClinician: await isClinicianAccount(supabaseAuth, user.id),
    };
    if (!shareOpensTo(ps, caller)) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the document file path
    const { data: doc, error: docError } = await supabaseAuth
      .from("health_documents")
      .select("file_path, file_name, user_id, retracted_at, archived_at, source_context, family_member_id")
      .eq("id", resolvedDocumentId)
      .single();

    // A retracted document is invisible under RLS; the service role has to
    // honour that itself. So are the two kinds whole-vault access does not
    // reach (the RLS policy "Clinicians can view whole vault when granted"):
    // the patient's own recordings, and care records of their conversations
    // with somebody else. Shared one at a time, the patient has chosen them.
    // Whole-vault access also stops at a document the patient archived, as the
    // policy does.
    //
    // On both routes, a document filed for a family member (family_member_id
    // set, user_id the account holder's) is not the patient's record and no
    // share of theirs covers it: it would have reached the parent's clinician
    // as the parent's own letter.
    const notInWholeVault = ["patient_recording", "care_record_snapshot"];
    if (
      docError || !doc || doc.retracted_at || doc.family_member_id ||
      (!documentShareId && (doc.archived_at || notInWholeVault.includes(doc.source_context ?? "")))
    ) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The document must belong to the patient on the share. Only reachable on
    // the whole-vault route, where the document id came from the caller.
    if (doc.user_id !== ps.user_id) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
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
      share_id: auditShareId,
      resource_id: resolvedDocumentId,
      action: "document_download",
      resource_type: "health_document",
      metadata: {
        document_share_id: documentShareId ?? null,
        access_route: documentShareId ? "per_document" : "whole_vault",
        file_name: doc.file_name,
      },
    });

    return new Response(
      JSON.stringify({ signedUrl: signedUrl.signedUrl, fileName: doc.file_name }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("get-shared-document-url failed", error);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
