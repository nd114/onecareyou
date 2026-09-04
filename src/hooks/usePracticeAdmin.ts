// Administrative (hospital management) accounts.
//
// An administrative account is a practice_members row with a management role and
// no clinical surface: it manages staff, patients, departments and other admins.
// It is deliberately separate from a clinician account and from a patient
// account, so every action is attributable to one named person.
//
// The `as any` casts on .from() match the rest of the practice hooks: these
// tables are newer than the generated Supabase types file, which must not be
// hand-edited.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePractice } from '@/hooks/usePractice';
import { toast } from 'sonner';

export const ADMINISTRATIVE_ROLES = ['owner', 'admin', 'sub_admin'] as const;
export type AdministrativeRole = (typeof ADMINISTRATIVE_ROLES)[number];

export function isAdministrativeRole(role?: string | null): role is AdministrativeRole {
  return !!role && (ADMINISTRATIVE_ROLES as readonly string[]).includes(role);
}

/**
 * Does the signed-in account manage a practice or hospital?
 *
 * Read straight from practice_members so a hospital owner who has no clinician
 * profile still resolves — that gap is why owners used to land on the patient
 * dashboard after accepting their invitation.
 */
export function usePracticeAdminAccess() {
  const { user, loading } = useAuth();

  const query = useQuery({
    queryKey: ['practice-admin-access', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('practice_members')
        .select('id, practice_id, role, status')
        .eq('user_id', user!.id)
        .eq('status', 'active');
      if (error) throw error;
      const rows = (data ?? []) as { practice_id: string; role: string }[];
      return rows.find((r) => isAdministrativeRole(r.role)) ?? null;
    },
  });

  const row = query.data ?? null;
  return {
    isAdministrative: !!row,
    role: (row?.role ?? null) as AdministrativeRole | null,
    /** Owners and chief admins see the whole hospital; sub-admins only their departments. */
    isChiefAdmin: row?.role === 'owner' || row?.role === 'admin',
    practiceId: row?.practice_id ?? null,
    isLoading: loading || query.isLoading,
  };
}

/**
 * Administrative actions on staff and patients.
 *
 * Nothing here deletes: staff are archived (status flips to `archived`) so the
 * audit trail and their past actions stay intact, and patient access is
 * suspended rather than erased — the patient's own consent record is theirs.
 */
export function usePracticeAdminActions(practiceId?: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['practice-staff-overview'] });
    queryClient.invalidateQueries({ queryKey: ['practice-patient-overview'] });
    queryClient.invalidateQueries({ queryKey: ['practice-members'] });
    queryClient.invalidateQueries({ queryKey: ['practice-memberships'] });
    queryClient.invalidateQueries({ queryKey: ['practice-assignments'] });
  };

  const setMemberStatus = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: 'active' | 'archived' }) => {
      if (!practiceId) throw new Error('No hospital selected');
      const { error } = await supabase
        .from('practice_members')
        .update({ status })
        .eq('practice_id', practiceId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.status === 'archived' ? 'Team member archived' : 'Team member restored');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'Could not update this team member'),
  });

  /**
   * The practice suspending its own staff's access to a patient.
   *
   * This used to write practice_patient_access.is_active. That table is gone —
   * two tables answered "can this hospital see this patient" and disagreed —
   * and the switch moved onto practice_shares as its own column. It is
   * deliberately NOT practice_shares.is_active: that one is the patient's
   * decision, and a practice must never be able to write it.
   */
  const setPatientAccess = useMutation({
    mutationFn: async ({ patientUserId, isActive }: { patientUserId: string; isActive: boolean }) => {
      if (!practiceId) throw new Error('No hospital selected');
      // Through the RPC, not a direct UPDATE. The only UPDATE policy a practice
      // admin has on practice_shares requires is_active = false in its WITH
      // CHECK — it exists to let a practice end a share — so writing the
      // suspension columns while leaving is_active true failed with an RLS
      // violation every time. Both suspending and restoring were broken.
      const { error } = await supabase.rpc('set_practice_suspension', {
        _practice_id: practiceId,
        _patient_user_id: patientUserId,
        _suspended: !isActive,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.isActive ? 'Patient access restored' : 'Patient access suspended');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'Could not update patient access'),
  });

  const assignClinician = useMutation({
    mutationFn: async ({
      patientUserId,
      clinicianUserId,
      departmentId,
    }: {
      patientUserId: string;
      clinicianUserId: string;
      departmentId?: string | null;
    }) => {
      if (!practiceId || !user) throw new Error('No hospital selected');
      const { error } = await supabase.from('practice_patient_assignments').insert({
        practice_id: practiceId,
        patient_user_id: patientUserId,
        clinician_user_id: clinicianUserId,
        department_id: departmentId || null,
        assignment_role: 'primary',
        assigned_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Clinician assigned to the patient');
      invalidate();
    },
    onError: (e: Error) =>
      toast.error(
        e.message.includes('duplicate')
          ? 'That clinician is already assigned to this patient'
          : e.message || 'Could not assign the clinician',
      ),
  });

  return {
    archiveMember: (userId: string) => setMemberStatus.mutateAsync({ userId, status: 'archived' }),
    restoreMember: (userId: string) => setMemberStatus.mutateAsync({ userId, status: 'active' }),
    isUpdatingMember: setMemberStatus.isPending,
    suspendPatient: (patientUserId: string) =>
      setPatientAccess.mutateAsync({ patientUserId, isActive: false }),
    restorePatient: (patientUserId: string) =>
      setPatientAccess.mutateAsync({ patientUserId, isActive: true }),
    isUpdatingPatient: setPatientAccess.isPending,
    assignClinician: assignClinician.mutateAsync,
    isAssigning: assignClinician.isPending,
  };
}

/** Archived staff, kept for audit — never deleted. */
export function useArchivedPracticeMembers(practiceId?: string | null) {
  const query = useQuery({
    queryKey: ['practice-members', 'archived', practiceId],
    enabled: !!practiceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('practice_members')
        .select('id, user_id, role, status, created_at')
        .eq('practice_id', practiceId!)
        .eq('status', 'archived');
      if (error) throw error;
      return (data ?? []) as { id: string; user_id: string; role: string; created_at: string }[];
    },
  });
  return { archived: query.data ?? [], isLoading: query.isLoading };
}

/** Convenience: the practice this administrator manages, with its name. */
export function useAdministeredPractice() {
  const { practiceId, role, isChiefAdmin, isAdministrative, isLoading } = usePracticeAdminAccess();
  const { practices, isLoading: loadingPractices } = usePractice();
  const practice = practices.find((p) => p.id === practiceId) ?? null;
  return {
    practice,
    practiceId,
    role,
    isChiefAdmin,
    isAdministrative,
    isLoading: isLoading || loadingPractices,
  };
}
