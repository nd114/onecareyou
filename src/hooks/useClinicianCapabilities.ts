// Phase 1.1 — Practice RBAC capabilities hook.
//
// Reads the caller's practice membership and exposes a `can(capability)`
// helper backed by the SECURITY DEFINER `has_practice_capability` function
// in the database. UI uses this to hide actions rather than relying on a
// silent server-side rejection.
//
// Capability keys must match the defaults in the SQL function:
//   view_phi · edit_clinical · send_guidance · message_patients
//   manage_billing · manage_team · manage_ehr · manage_settings
//   invite_patients · export_data · bulk_message · view_audit

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type PracticeCapability =
  | "view_phi"
  | "edit_clinical"
  | "send_guidance"
  | "message_patients"
  | "manage_billing"
  | "manage_team"
  | "manage_ehr"
  | "manage_settings"
  | "invite_patients"
  | "export_data"
  | "bulk_message"
  | "view_audit";

export type PracticeRole =
  | "owner"
  | "admin"
  | "provider"
  | "clinician"
  | "nurse"
  | "front_desk"
  | "billing"
  | "staff"
  | "read_only";

const ALL_CAPABILITIES: PracticeCapability[] = [
  "view_phi",
  "edit_clinical",
  "send_guidance",
  "message_patients",
  "manage_billing",
  "manage_team",
  "manage_ehr",
  "manage_settings",
  "invite_patients",
  "export_data",
  "bulk_message",
  "view_audit",
];

interface MembershipRow {
  practice_id: string;
  role: PracticeRole;
}

export function useClinicianCapabilities() {
  const { user } = useAuth();
  const [membership, setMembership] = useState<MembershipRow | null>(null);
  const [grants, setGrants] = useState<Set<PracticeCapability>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setMembership(null);
      setGrants(new Set());
      setLoading(false);
      return;
    }

    setLoading(true);

    // 1. Look up the active practice membership (if any).
    const { data: memberRow } = await supabase
      .from("practice_members")
      .select("practice_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!memberRow) {
      setMembership(null);
      setGrants(new Set());
      setLoading(false);
      return;
    }

    setMembership(memberRow as MembershipRow);

    // 2. Resolve every capability via the SECURITY DEFINER RPC.
    //    Parallel calls — one row each, server is the source of truth.
    const results = await Promise.all(
      ALL_CAPABILITIES.map(async (cap) => {
        const { data, error } = await supabase.rpc("has_practice_capability", {
          _user_id: user.id,
          _capability: cap,
        });
        return [cap, !error && data === true] as const;
      }),
    );

    const next = new Set<PracticeCapability>();
    for (const [cap, ok] of results) if (ok) next.add(cap);
    setGrants(next);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const can = useCallback(
    (capability: PracticeCapability): boolean => grants.has(capability),
    [grants],
  );

  return useMemo(
    () => ({
      loading,
      role: membership?.role ?? null,
      practiceId: membership?.practice_id ?? null,
      isInPractice: membership !== null,
      can,
      refresh: load,
    }),
    [loading, membership, can, load],
  );
}
