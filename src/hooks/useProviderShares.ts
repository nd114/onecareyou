import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/**
 * A type alias, not an interface: this is written straight into a jsonb
 * column, and only type aliases get the implicit index signature that makes
 * them assignable to `Json`.
 */
type SharePermissions = {
  vitals: boolean;
  meds: boolean;
  adherence: boolean;
  profile: boolean;
  /**
   * Whole-vault access. Absent or false means the stricter default: this
   * clinician sees only the documents the patient shared one at a time,
   * through document_shares.
   */
  documents?: boolean;
};

export interface ProviderShare {
  id: string;
  user_id: string;
  /** Label the patient typed when creating the invite. */
  provider_name: string;
  provider_email: string | null;
  invite_code: string;
  permissions: SharePermissions;
  is_active: boolean;
  created_at: string;
  last_accessed_at: string | null;
  expires_at: string | null;
  clinician_user_id: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  reconnected_at: string | null;
  /** Resolved from the clinician's own profile once they claim the share. */
  display_name: string;
  display_subtitle: string | null;
  is_claimed: boolean;
}

export interface ShareEvent {
  id: string;
  share_id: string;
  event_type: string;
  actor_role: string;
  reason: string | null;
  provider_label: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

interface ClinicianBasicInfo {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  practice_name: string | null;
  avatar_url: string | null;
}

interface CreateShareData {
  providerName: string;
  providerEmail?: string;
  permissions: SharePermissions;
  expiresInDays?: number;
}

// Generate a secure random invite code
const generateInviteCode = (): string => {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  const randomValues = new Uint8Array(12);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < 12; i++) {
    code += chars[randomValues[i] % chars.length];
  }
  return code;
};

function formatClinicianName(info: ClinicianBasicInfo): string {
  const parts = [info.first_name, info.last_name].filter(Boolean).join(" ").trim();
  if (!parts) return "";
  const title = info.title?.trim();
  if (!title) return parts;
  // Avoid "Dr. Dr. Jane" when the stored title already prefixes the name.
  return parts.toLowerCase().startsWith(title.toLowerCase()) ? parts : `${title} ${parts}`;
}

export function useProviderShares() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: shares = [],
    isLoading,
    error,
  } = useQuery({
    // v2: display identity now resolves from the clinician profile, not the typed label.
    queryKey: ["provider-shares-v2", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("provider_shares")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = data || [];
      const clinicianIds = Array.from(
        new Set(rows.map((r) => (r as { clinician_user_id: string | null }).clinician_user_id).filter(Boolean)),
      ) as string[];

      const infoMap = new Map<string, ClinicianBasicInfo>();
      if (clinicianIds.length > 0) {
        const { data: infos, error: infoError } = await supabase.rpc("get_clinician_basic_info", {
          clinician_ids: clinicianIds,
        });
        if (infoError) console.error("Failed to resolve clinician names", infoError);
        for (const row of (infos || []) as ClinicianBasicInfo[]) infoMap.set(row.user_id, row);
      }

      return rows.map((share) => {
        const raw = share as Record<string, unknown>;
        const clinicianId = (raw.clinician_user_id as string | null) ?? null;
        const info = clinicianId ? infoMap.get(clinicianId) : undefined;
        const resolved = info ? formatClinicianName(info) : "";
        const isClaimed = !!clinicianId && !!resolved;

        return {
          ...(share as unknown as ProviderShare),
          permissions: share.permissions as unknown as SharePermissions,
          revoked_at: (raw.revoked_at as string | null) ?? null,
          revoke_reason: (raw.revoke_reason as string | null) ?? null,
          reconnected_at: (raw.reconnected_at as string | null) ?? null,
          clinician_user_id: clinicianId,
          display_name: resolved || share.provider_name,
          display_subtitle: info?.practice_name || null,
          is_claimed: isClaimed,
        } as ProviderShare;
      });
    },
    enabled: !!user,
  });

  /** Append to the permanent relationship ledger. Never blocks the caller. */
  const logShareEvent = async (input: {
    shareId: string;
    eventType: string;
    reason?: string | null;
    providerLabel?: string | null;
    clinicianUserId?: string | null;
    details?: Record<string, Json>;
  }) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("share_events").insert({
        share_id: input.shareId,
        patient_user_id: user.id,
        clinician_user_id: input.clinicianUserId ?? null,
        provider_label: input.providerLabel ?? null,
        event_type: input.eventType,
        actor_user_id: user.id,
        actor_role: "patient",
        reason: input.reason ?? null,
        details: input.details ?? {},
      });
      if (error) console.error("share_events insert failed", error);
    } catch (err) {
      console.error("share_events insert threw", err);
    }
  };

  const createShare = useMutation({
    mutationFn: async (data: CreateShareData) => {
      if (!user) throw new Error("Not authenticated");

      const inviteCode = generateInviteCode();
      const expiresAt = data.expiresInDays
        ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const { data: newShare, error } = await supabase
        .from("provider_shares")
        .insert({
          user_id: user.id,
          provider_name: data.providerName,
          provider_email: data.providerEmail || null,
          invite_code: inviteCode,
          permissions: data.permissions,
          expires_at: expiresAt,
        } as never)
        .select()
        .single();

      if (error) throw error;

      await logShareEvent({
        shareId: newShare.id,
        eventType: "connected",
        providerLabel: data.providerName,
        details: { permissions: data.permissions, expires_at: expiresAt },
      });

      return {
        ...newShare,
        permissions: newShare.permissions as unknown as SharePermissions,
      } as unknown as ProviderShare;
    },
    onSuccess: (newShare) => {
      queryClient.invalidateQueries({ queryKey: ["provider-shares-v2"] });
      queryClient.invalidateQueries({ queryKey: ["share-events"] });

      const shareLink = `${window.location.origin}/clinician/patient/${newShare.invite_code}`;
      navigator.clipboard.writeText(shareLink);

      toast.success("Share link created and copied to clipboard!");
    },
    onError: (error) => {
      console.error("Error creating share:", error);
      toast.error("Failed to create share link");
    },
  });

  /**
   * Ending a relationship is an event, not a delete.
   *
   * The share row, the message history, the guidance and the documents that
   * were already shared all stay on record — the patient keeps them forever
   * and the clinician keeps read-only sight of the conversation they took
   * part in. What stops is the flow of any new health data.
   */
  const revokeShare = useMutation({
    mutationFn: async (input: string | { shareId: string; reason?: string }) => {
      if (!user) throw new Error("Not authenticated");
      const shareId = typeof input === "string" ? input : input.shareId;
      const reason = typeof input === "string" ? undefined : input.reason;

      const { data: existing } = await supabase
        .from("provider_shares")
        .select("provider_name, provider_email, clinician_user_id, permissions")
        .eq("id", shareId)
        .eq("user_id", user.id)
        .maybeSingle();

      const { error } = await supabase
        .from("provider_shares")
        .update({
          is_active: false,
          revoked_at: new Date().toISOString(),
          revoked_by: user.id,
          revoke_reason: reason || null,
        } as never)
        .eq("id", shareId)
        .eq("user_id", user.id);

      if (error) throw error;

      await logShareEvent({
        shareId,
        eventType: "revoked",
        reason: reason || null,
        providerLabel: existing?.provider_name ?? null,
        clinicianUserId: (existing as { clinician_user_id?: string | null } | null)?.clinician_user_id ?? null,
        details: { permissions_at_revocation: existing?.permissions ?? null },
      });

      // The audit entry for this revocation is written by trg_audit_provider_share
      // in the same statement as the update, so it cannot be declined or
      // mislabelled by the client. This used to also insert one from the browser,
      // which duplicated the trigger's row and — because the client chose every
      // field — was the weaker of the two records. See 20260820140000.

      return existing;
    },
    onSuccess: (existing) => {
      queryClient.invalidateQueries({ queryKey: ["provider-shares-v2"] });
      queryClient.invalidateQueries({ queryKey: ["share-events"] });
      const name = existing?.provider_name ? `${existing.provider_name}'s` : "Provider";
      toast.success(`${name} access ended`, {
        description: "No new data will be shared. Your past messages and records are kept in your Health Vault.",
      });
    },
    onError: (error) => {
      console.error("Error revoking share:", error);
      toast.error("Failed to end access");
    },
  });

  /** Re-share with a provider the patient previously disconnected. */
  const reshare = useMutation({
    mutationFn: async ({ shareId, permissions }: { shareId: string; permissions?: SharePermissions }) => {
      if (!user) throw new Error("Not authenticated");

      const updates: Record<string, unknown> = {
        is_active: true,
        revoked_at: null,
        revoked_by: null,
        revoke_reason: null,
        reconnected_at: new Date().toISOString(),
      };
      if (permissions) updates.permissions = permissions;

      const { error } = await supabase
        .from("provider_shares")
        .update(updates as never)
        .eq("id", shareId)
        .eq("user_id", user.id);

      if (error) throw error;

      await logShareEvent({
        shareId,
        eventType: "reshared",
        details: permissions ? { permissions } : {},
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-shares-v2"] });
      queryClient.invalidateQueries({ queryKey: ["share-events"] });
      toast.success("Sharing resumed", {
        description: "Your provider has been reconnected and can see new data again.",
      });
    },
    onError: (error) => {
      console.error("Error resuming share:", error);
      toast.error("Failed to resume sharing");
    },
  });

  const updateShare = useMutation({
    mutationFn: async ({
      shareId,
      permissions,
      isActive,
    }: {
      shareId: string;
      permissions?: SharePermissions;
      isActive?: boolean;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const updates: Record<string, unknown> = {};
      if (permissions !== undefined) updates.permissions = permissions as unknown as Record<string, unknown>;
      if (isActive !== undefined) updates.is_active = isActive;

      const { error } = await supabase
        .from("provider_shares")
        .update(updates as never)
        .eq("id", shareId)
        .eq("user_id", user.id);

      if (error) throw error;

      if (permissions !== undefined) {
        await logShareEvent({ shareId, eventType: "permissions_changed", details: { permissions } });
      }
      if (isActive !== undefined) {
        await logShareEvent({ shareId, eventType: isActive ? "resumed" : "paused" });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-shares-v2"] });
      queryClient.invalidateQueries({ queryKey: ["share-events"] });
      toast.success("Share updated successfully");
    },
    onError: (error) => {
      console.error("Error updating share:", error);
      toast.error("Failed to update share");
    },
  });

  return {
    shares,
    isLoading,
    error,
    createShare,
    revokeShare,
    reshare,
    updateShare,
  };
}

/** Permanent, append-only relationship history for one share (or all of them). */
export function useShareEvents(shareId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["share-events", user?.id, shareId ?? "all"],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from("share_events").select("*").order("created_at", { ascending: false }).limit(200);
      if (shareId) q = q.eq("share_id", shareId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ShareEvent[];
    },
  });
}
