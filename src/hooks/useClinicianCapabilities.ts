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
import { useClinicianProfile } from "@/hooks/useClinicianProfile";

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
  created_at?: string;
}

export function useClinicianCapabilities() {
  const { user } = useAuth();
  const { isClinician } = useClinicianProfile();
  const [membership, setMembership] = useState<MembershipRow | null>(null);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [grants, setGrants] = useState<Set<PracticeCapability>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setMembership(null);
      setMemberships([]);
      setGrants(new Set());
      setLoading(false);
      return;
    }

    setLoading(true);

    // 1. Look up active practice memberships.
    //    A clinician can be affiliated with several hospitals at once (sharing
    //    model §6), so this reads the full set. maybeSingle() used to error on
    //    exactly that case, dropping the user through to the solo branch below
    //    and handing them every capability.
    const { data: memberRows } = await supabase
      .from("practice_members")
      .select("practice_id, role, created_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: true });

    // Until there is a tenant switcher, the earliest affiliation is the active
    // one — deterministic, and the same row the database-side default resolves.
    const memberRow = (memberRows ?? [])[0] as MembershipRow | undefined;

    if (!memberRow) {
      setMembership(null);
      setMemberships([]);
      // Solo clinician (verified clinician profile, no practice yet) is the
      // owner of their own workspace — grant all capabilities so audit,
      // reports, compliance, templates, etc. are accessible without forcing
      // them to create a practice first. Non-clinicians get nothing.
      setGrants(isClinician ? new Set(ALL_CAPABILITIES) : new Set());
      setLoading(false);
      return;
    }

    setMembership(memberRow);
    setMemberships((memberRows ?? []) as MembershipRow[]);

    // 2. Resolve every capability via the SECURITY DEFINER RPC, scoped to the
    //    tenant in hand so a role at one hospital cannot answer for another.
    const results = await Promise.all(
      ALL_CAPABILITIES.map(async (cap) => {
        // Cast: the practice-scoped overload is newer than the generated types.
        const { data, error } = await supabase.rpc("has_practice_capability", {
          _user_id: user.id,
          _capability: cap,
          _practice_id: memberRow.practice_id,
        });
        return [cap, !error && data === true] as const;
      }),
    );

    const next = new Set<PracticeCapability>();
    for (const [cap, ok] of results) if (ok) next.add(cap);
    setGrants(next);
    setLoading(false);
  }, [user, isClinician]);

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
      /** Every active affiliation — a clinician may work across hospitals. */
      memberships,
      isInPractice: membership !== null,
      can,
      refresh: load,
    }),
    [loading, membership, memberships, can, load],
  );
}
