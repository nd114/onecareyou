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
//
// Cached through React Query on purpose. Every guarded screen and every sub-tab
// bar asks this question, and a per-mount fetch (one membership read plus one
// RPC per capability) made each move to Invoices, Import or Compliance sit on a
// full-screen spinner — indistinguishable from a page reload. The answer only
// changes when a role changes, so it is read once and shared.

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useClinicianProfile } from "@/hooks/useClinicianProfile";
import { useWorkspaceSelection } from "@/hooks/useWorkspaceSelection";
import { activeMembership } from "@/lib/staff-roles";

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
  | "view_audit"
  // Routing patients to colleagues. The database has answered for this since
  // department leads existed; the interface simply never asked.
  | "assign_patients";

export type PracticeRole =
  | "owner"
  | "admin"
  // A department lead is a real role in the database enum. Leaving it out here
  // made a lead's role read as an unknown value in the interface.
  | "sub_admin"
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
  "assign_patients",
];

interface MembershipRow {
  practice_id: string;
  role: PracticeRole;
  created_at?: string;
}

interface CapabilityAnswer {
  membership: MembershipRow | null;
  memberships: MembershipRow[];
  grants: PracticeCapability[];
}

const EMPTY: CapabilityAnswer = { membership: null, memberships: [], grants: [] };

async function fetchCapabilities(
  userId: string,
  isClinician: boolean,
  selectedWorkspaceId: string | null,
): Promise<CapabilityAnswer> {
  // 1. Look up active practice memberships.
  //    A clinician can be affiliated with several hospitals at once (sharing
  //    model §6), so this reads the full set. maybeSingle() used to error on
  //    exactly that case, dropping the user through to the solo branch below
  //    and handing them every capability.
  const { data: memberRows } = await supabase
    .from("practice_members")
    .select("practice_id, role, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const rows = (memberRows ?? []) as MembershipRow[];

  // Shared with useClinicianProfile so capabilities and the screens they gate
  // cannot disagree about which workspace is current. See activeMembership for
  // what went wrong when this hook resolved it alone.
  const memberRow = activeMembership(rows, selectedWorkspaceId) ?? undefined;

  if (!memberRow) {
    // Solo clinician (verified clinician profile, no practice yet) is the
    // owner of their own workspace — grant all capabilities so audit,
    // reports, compliance, templates, etc. are accessible without forcing
    // them to create a practice first. Non-clinicians get nothing.
    return {
      membership: null,
      memberships: [],
      grants: isClinician ? [...ALL_CAPABILITIES] : [],
    };
  }

  // 2. Resolve every capability via the SECURITY DEFINER RPC, scoped to the
  //    tenant in hand so a role at one hospital cannot answer for another.
  const results = await Promise.all(
    ALL_CAPABILITIES.map(async (cap) => {
      const { data, error } = await supabase.rpc("has_practice_capability", {
        _user_id: userId,
        _capability: cap,
        _practice_id: memberRow.practice_id,
      });
      return [cap, !error && data === true] as const;
    }),
  );

  return {
    membership: memberRow,
    memberships: rows,
    grants: results.filter(([, ok]) => ok).map(([cap]) => cap),
  };
}

export function useClinicianCapabilities() {
  const { user } = useAuth();
  const { isClinician, isLoading: profileLoading } = useClinicianProfile();
  const { selectedWorkspaceId } = useWorkspaceSelection(user?.id);
  const queryClient = useQueryClient();

  const enabled = !!user && !profileLoading;

  const { data, isLoading, isFetching } = useQuery({
    // The chosen workspace is part of the key: switching workspace has to give a
    // fresh answer rather than serve the previous tenant's cached grants for
    // the next five minutes.
    queryKey: ["clinician-capabilities", user?.id ?? null, isClinician, selectedWorkspaceId],
    queryFn: () => {
      if (!user) return Promise.resolve(EMPTY);
      return fetchCapabilities(user.id, isClinician, selectedWorkspaceId);
    },
    enabled,
    // A role change is an administrative act, not a per-navigation event.
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const answer = data ?? EMPTY;

  const grants = useMemo(() => new Set(answer.grants), [answer.grants]);

  const can = useCallback(
    (capability: PracticeCapability): boolean => grants.has(capability),
    [grants],
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["clinician-capabilities"] });
  }, [queryClient]);

  return useMemo(
    () => ({
      // Only the very first answer counts as loading. A background refresh must
      // never blank a screen the person is already reading.
      loading: enabled ? isLoading || (!data && isFetching) : !!user,
      role: answer.membership?.role ?? null,
      practiceId: answer.membership?.practice_id ?? null,
      /** Every active affiliation — a clinician may work across hospitals. */
      memberships: answer.memberships,
      isInPractice: answer.membership !== null,
      can,
      refresh,
    }),
    [enabled, isLoading, isFetching, data, user, answer, can, refresh],
  );
}
