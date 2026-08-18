import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * The clinicians a patient's connected hospitals have assigned to them.
 *
 * Care Circle could show which hospitals hold a patient's record, and which
 * doctors the patient invited directly, but not the staff the hospital had
 * given access to — the assignment rows are readable only by practice members.
 * That left the delegated half of the sharing model invisible to the person it
 * concerns. `my_institution_care_team()` returns it, scoped to the caller.
 */
export interface InstitutionCareTeamMember {
  practiceId: string;
  practiceName: string;
  practiceSlug: string | null;
  clinicianUserId: string;
  clinicianName: string | null;
  specialty: string | null;
  assignmentRole: string;
  assignedAt: string;
}

export interface InstitutionCareTeamGroup {
  practiceId: string;
  practiceName: string;
  practiceSlug: string | null;
  members: InstitutionCareTeamMember[];
}

export function useInstitutionCareTeam() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['institution-care-team', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<InstitutionCareTeamMember[]> => {
      const { data, error } = await supabase.rpc('my_institution_care_team');
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        practiceId: row.practice_id as string,
        practiceName: row.practice_name as string,
        practiceSlug: (row.practice_slug as string) ?? null,
        clinicianUserId: row.clinician_user_id as string,
        clinicianName: (row.clinician_name as string) ?? null,
        specialty: (row.specialty as string) ?? null,
        assignmentRole: (row.assignment_role as string) ?? 'primary',
        assignedAt: row.assigned_at as string,
      }));
    },
  });

  // One card per hospital, with its staff underneath — the shape the patient
  // reasons about ("who at St Aidan's can see me?").
  const byPractice: InstitutionCareTeamGroup[] = [];
  for (const member of query.data ?? []) {
    let group = byPractice.find((g) => g.practiceId === member.practiceId);
    if (!group) {
      group = {
        practiceId: member.practiceId,
        practiceName: member.practiceName,
        practiceSlug: member.practiceSlug,
        members: [],
      };
      byPractice.push(group);
    }
    group.members.push(member);
  }

  return {
    careTeam: query.data ?? [],
    byPractice,
    isLoading: query.isLoading,
    error: query.error,
  };
}
