// Phase 2.5 — Referrals between clinicians (intra-OneCare or external).
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Referral {
  id: string;
  patient_user_id: string;
  from_clinician_user_id: string;
  to_clinician_user_id: string | null;
  to_email: string | null;
  to_name: string | null;
  specialty: string | null;
  reason: string;
  urgency: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateReferralInput {
  patientUserId: string;
  toEmail?: string;
  toName?: string;
  toClinicianUserId?: string;
  specialty?: string;
  reason: string;
  urgency?: "routine" | "urgent" | "stat";
  notes?: string;
}

export function useReferrals(patientUserId?: string) {
  const qc = useQueryClient();
  const key = ["referrals", patientUserId ?? "all"];

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      let q = supabase.from("referrals").select("*").order("created_at", { ascending: false });
      if (patientUserId) q = q.eq("patient_user_id", patientUserId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Referral[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: CreateReferralInput) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      const { error } = await supabase.from("referrals").insert({
        patient_user_id: input.patientUserId,
        from_clinician_user_id: u.user.id,
        to_clinician_user_id: input.toClinicianUserId ?? null,
        to_email: input.toEmail ?? null,
        to_name: input.toName ?? null,
        specialty: input.specialty ?? null,
        reason: input.reason,
        urgency: input.urgency ?? "routine",
        notes: input.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referrals"] });
      toast.success("Referral created");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not create referral"),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("referrals").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["referrals"] }),
  });

  return { ...query, create, updateStatus };
}
