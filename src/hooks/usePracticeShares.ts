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
