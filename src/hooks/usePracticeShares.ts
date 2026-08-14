import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface InstitutionInfo {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  logo_url: string | null;
  tenant_type: string | null;
  slug?: string | null;
}

export interface PracticeShare {
  id: string;
  practice_id: string;
  user_id: string;
  share_all: boolean;
  permissions: Record<string, boolean>;
  is_active: boolean;
  connected_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
  institution?: InstitutionInfo;
}

/** Patient-side: hospitals/institutions this patient shares their record with. */
export function useMyInstitutionShares() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['my-institution-shares', user?.id],
    queryFn: async (): Promise<PracticeShare[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('practice_shares')
        .select('*')
        .eq('user_id', user.id)
        .order('connected_at', { ascending: false });
      if (error) throw error;

      const shares = (data || []) as unknown as PracticeShare[];
      if (shares.length === 0) return [];

      const { data: info } = await supabase.rpc('get_institution_basic_info', {
        _practice_ids: shares.map((s) => s.practice_id),
      });
      const byId = new Map<string, InstitutionInfo>(
        ((info || []) as InstitutionInfo[]).map((i) => [i.id, i]),
      );
      return shares.map((s) => ({ ...s, institution: byId.get(s.practice_id) }));
    },
    enabled: !!user,
  });

  const lookupInstitution = async (slug: string): Promise<InstitutionInfo | null> => {
    const { data, error } = await supabase.rpc('find_institution_by_slug', { _slug: slug });
    if (error) throw error;
    const rows = (data || []) as InstitutionInfo[];
    return rows[0] ?? null;
  };

  const connect = useMutation({
    mutationFn: async ({
      practiceId,
      shareAll,
      permissions,
    }: {
      practiceId: string;
      shareAll: boolean;
      permissions?: Record<string, boolean>;
    }) => {
      if (!user) throw new Error('Not signed in');
      const payload = {
        practice_id: practiceId,
        user_id: user.id,
        share_all: shareAll,
        permissions:
          permissions ?? {
            vitals: true,
            medications: true,
            documents: true,
            conditions: true,
            allergies: true,
          },
        is_active: true,
        revoked_at: null,
        revoked_by: null,
        revoke_reason: null,
        connected_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('practice_shares')
        .upsert(payload as never, { onConflict: 'practice_id,user_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Connected to the hospital');
      queryClient.invalidateQueries({ queryKey: ['my-institution-shares'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not connect'),
  });

  const disconnect = useMutation({
    mutationFn: async ({ shareId, reason }: { shareId: string; reason?: string }) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase
        .from('practice_shares')
        .update({
          is_active: false,
          revoked_at: new Date().toISOString(),
          revoked_by: user.id,
          revoke_reason: reason ?? null,
        } as never)
        .eq('id', shareId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Disconnected. Your history is preserved.');
      queryClient.invalidateQueries({ queryKey: ['my-institution-shares'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not disconnect'),
  });

  const activeShares = (query.data ?? []).filter((s) => s.is_active);
  const pastShares = (query.data ?? []).filter((s) => !s.is_active);

  return {
    shares: query.data ?? [],
    activeShares,
    pastShares,
    isLoading: query.isLoading,
    lookupInstitution,
    connect: connect.mutateAsync,
    isConnecting: connect.isPending,
    disconnect: disconnect.mutateAsync,
    isDisconnecting: disconnect.isPending,
  };
}

export interface InstitutionAssignedPatient {
  /** The assignment row — one clinician's link to one patient at one hospital. */
  assignmentId: string;
  practiceId: string;
  practiceName: string;
  patientUserId: string;
  patientName: string | null;
  patientEmail: string | null;
  patientPhone: string | null;
  /** Categories the patient shared with this hospital. */
  permissions: Record<string, boolean>;
  shareAll: boolean;
  /** False once the patient disconnects — the row stays so history can be filtered. */
  shareActive: boolean;
  connectedAt: string;
  assignedAt: string;
}

/**
 * Clinician-side: patients this clinician has been assigned to through a
 * hospital's own delegation, as opposed to a private Care Circle share.
 *
 * These two pathways are independent by design (consent model §2), so this
 * deliberately reads the assignment table rather than provider_shares.
 */
export function useInstitutionAssignedPatients() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['institution-assigned-patients', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<InstitutionAssignedPatient[]> => {
      if (!user) return [];

      const nowIso = new Date().toISOString();
      const { data: assignments, error } = await supabase
        .from('practice_patient_assignments')
        .select('id, practice_id, patient_user_id, effective_from, effective_to, created_at')
        .eq('clinician_user_id', user.id)
        .lte('effective_from', nowIso)
        .or(`effective_to.is.null,effective_to.gt.${nowIso}`);
      if (error) throw error;

      const rows = (assignments || []) as {
        id: string;
        practice_id: string;
        patient_user_id: string;
        created_at: string;
      }[];
      if (rows.length === 0) return [];

      const patientIds = [...new Set(rows.map((a) => a.patient_user_id))];
      const practiceIds = [...new Set(rows.map((a) => a.practice_id))];

      const [{ data: shares }, { data: identities }, { data: institutions }] = await Promise.all([
        supabase
          .from('practice_shares')
          .select('practice_id, user_id, share_all, permissions, is_active, connected_at')
          .in('practice_id', practiceIds)
          .in('user_id', patientIds),
        supabase.rpc('get_patient_identity', { patient_ids: patientIds }),
        supabase.rpc('get_institution_basic_info', { _practice_ids: practiceIds }),
      ]);

      const shareByKey = new Map(
        ((shares || []) as {
          practice_id: string;
          user_id: string;
          share_all: boolean;
          permissions: Record<string, boolean>;
          is_active: boolean;
          connected_at: string;
        }[]).map((s) => [`${s.practice_id}:${s.user_id}`, s]),
      );
      const identityById = new Map(
        ((identities || []) as {
          user_id: string;
          name: string | null;
          email: string | null;
          phone_number: string | null;
        }[]).map((p) => [p.user_id, p]),
      );
      const institutionById = new Map(
        ((institutions || []) as InstitutionInfo[]).map((i) => [i.id, i]),
      );

      return rows
        .map((a) => {
          const share = shareByKey.get(`${a.practice_id}:${a.patient_user_id}`);
          // No share row means the assignment outlived the consent that created
          // it; there is nothing to show and nothing readable behind it.
          if (!share) return null;
          const identity = identityById.get(a.patient_user_id);
          return {
            assignmentId: a.id,
            practiceId: a.practice_id,
            practiceName: institutionById.get(a.practice_id)?.name ?? 'Hospital',
            patientUserId: a.patient_user_id,
            patientName: identity?.name ?? null,
            patientEmail: identity?.email ?? null,
            patientPhone: identity?.phone_number ?? null,
            permissions: share.permissions ?? {},
            shareAll: share.share_all,
            shareActive: share.is_active,
            connectedAt: share.connected_at,
            assignedAt: a.created_at,
          } satisfies InstitutionAssignedPatient;
        })
        .filter((p): p is InstitutionAssignedPatient => p !== null);
    },
  });

  return {
    assignedPatients: query.data ?? [],
    isLoading: query.isLoading,
  };
}

export interface HospitalPatientShare extends PracticeShare {
  patient?: { user_id: string; name: string | null; email: string | null };
  assignedClinicianIds: string[];
}

/** Clinician-side: patients who shared with my practice, plus assignment. */
export function usePracticeSharedPatients(practiceId?: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['practice-shared-patients', practiceId],
    queryFn: async (): Promise<HospitalPatientShare[]> => {
      if (!practiceId) return [];
      const { data, error } = await supabase
        .from('practice_shares')
        .select('*')
        .eq('practice_id', practiceId)
        .order('connected_at', { ascending: false });
      if (error) throw error;

      const shares = (data || []) as unknown as PracticeShare[];
      if (shares.length === 0) return [];

      const patientIds = shares.map((s) => s.user_id);
      const [{ data: identities }, { data: assignments }] = await Promise.all([
        supabase.rpc('get_patient_identity', { patient_ids: patientIds }),
        supabase
          .from('practice_patient_assignments')
          .select('patient_user_id, clinician_user_id, effective_to')
          .in('patient_user_id', patientIds),
      ]);

      const byId = new Map(
        ((identities || []) as { user_id: string; name: string | null; email: string | null }[]).map(
          (p) => [p.user_id, p],
        ),
      );

      return shares.map((s) => ({
        ...s,
        patient: byId.get(s.user_id),
        assignedClinicianIds: ((assignments || []) as {
          patient_user_id: string;
          clinician_user_id: string;
          effective_to: string | null;
        }[])
          .filter(
            (a) =>
              a.patient_user_id === s.user_id &&
              (!a.effective_to || new Date(a.effective_to) > new Date()),
          )
          .map((a) => a.clinician_user_id),
      }));
    },
    enabled: !!practiceId,
  });

  const assign = useMutation({
    mutationFn: async ({
      patientUserId,
      clinicianUserId,
    }: {
      patientUserId: string;
      clinicianUserId: string;
    }) => {
      if (!practiceId || !user) throw new Error('No practice');
      const { error } = await supabase.from('practice_patient_assignments').insert({
        practice_id: practiceId,
        patient_user_id: patientUserId,
        clinician_user_id: clinicianUserId,
        assigned_by: user.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Patient assigned');
      queryClient.invalidateQueries({ queryKey: ['practice-shared-patients'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not assign patient'),
  });

  return {
    shares: query.data ?? [],
    activeShares: (query.data ?? []).filter((s) => s.is_active),
    isLoading: query.isLoading,
    assign: assign.mutateAsync,
    isAssigning: assign.isPending,
  };
}
