import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { toClinicalList } from "@/lib/clinical-lists";

export interface FamilyMember {
  id: string;
  owner_user_id: string;
  name: string;
  relationship: string | null;
  date_of_birth: string | null;
  gender: string | null;
  blood_type: string | null;
  height: number | null;
  allergies: string[];
  health_conditions: string[];
  avatar_color: string;
  /** Derived from archived_at by the database; true while the member is offered in pickers. */
  is_active: boolean;
  /** Set when the owner removed this person. Their history is kept and they can be restored. */
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateFamilyMemberData {
  name: string;
  relationship?: string;
  date_of_birth?: string;
  gender?: string;
  blood_type?: string;
  height?: number;
  allergies?: string[];
  health_conditions?: string[];
  avatar_color?: string;
}

const MAX_FAMILY_MEMBERS = 5;

const AVATAR_COLORS = [
  '#6366f1', // Indigo
  '#ec4899', // Pink
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#f43f5e', // Rose
  '#84cc16', // Lime
];

export const useFamilyMembers = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeFamilyMember, setActiveFamilyMember] = useState<string | null>(null);

  const { data: familyMembers = [], isLoading, error } = useQuery({
    queryKey: ['family-members', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('family_members')
        .select('*')
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      
      return (data || []).map(member => ({
        ...member,
        // The previous guard was Array.isArray(...) ? ... : [], which does not
        // crash but throws the list away: a member whose conditions were stored
        // as "Diabetes, Hypertension" showed none at all. Recover it instead.
        allergies: toClinicalList(member.allergies),
        health_conditions: toClinicalList(member.health_conditions),
      })) as FamilyMember[];
    },
    enabled: !!user,
  });

  // Archived members keep their history and stay reachable from the family
  // dashboard to view or restore, but are never offered as someone to record for.
  const activeMembers = familyMembers.filter((m) => !m.archived_at);
  const archivedMembers = familyMembers.filter((m) => !!m.archived_at);

  const createMember = useMutation({
    mutationFn: async (data: CreateFamilyMemberData) => {
      if (!user) throw new Error('Not authenticated');

      // Check limit
      if (activeMembers.length >= MAX_FAMILY_MEMBERS) {
        throw new Error(`Maximum of ${MAX_FAMILY_MEMBERS} family members allowed`);
      }

      const avatarColor = data.avatar_color || AVATAR_COLORS[familyMembers.length % AVATAR_COLORS.length];

      const { data: newMember, error } = await supabase
        .from('family_members')
        .insert({
          owner_user_id: user.id,
          name: data.name,
          relationship: data.relationship || null,
          date_of_birth: data.date_of_birth || null,
          gender: data.gender || null,
          blood_type: data.blood_type || null,
          height: data.height || null,
          allergies: data.allergies || [],
          health_conditions: data.health_conditions || [],
          avatar_color: avatarColor,
        })
        .select()
        .single();

      if (error) throw error;
      return newMember;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-members'] });
      toast.success('Family member added successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add family member');
    },
  });

  const updateMember = useMutation({
    mutationFn: async ({ id, ...data }: Partial<FamilyMember> & { id: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { data: updated, error } = await supabase
        .from('family_members')
        .update({
          name: data.name,
          relationship: data.relationship,
          date_of_birth: data.date_of_birth,
          gender: data.gender,
          blood_type: data.blood_type,
          height: data.height,
          allergies: data.allergies,
          health_conditions: data.health_conditions,
          avatar_color: data.avatar_color,
        })
        .eq('id', id)
        .eq('owner_user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-members'] });
      toast.success('Family member updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update family member');
    },
  });

  // Removing a family member archives them. This used to delete the row, and
  // the database then deleted their medications, readings and dose history
  // with it and moved their documents, folders and notes into the owner's own
  // record. The database now refuses the delete; archiving hides them from the
  // pickers and keeps everything.
  const setArchived = async (id: string, archived: boolean) => {
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase
      .from('family_members')
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq('id', id)
      .eq('owner_user_id', user.id)
      .select('id');
    if (error) throw error;
    // A zero-row update is a clean success from PostgREST; say it did nothing.
    if (!data || data.length === 0) throw new Error('That family member could not be updated');
  };

  const archiveMember = useMutation({
    mutationFn: (id: string) => setArchived(id, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-members'] });
      setActiveFamilyMember(null);
      toast.success('Family member archived. Their history is kept.');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to archive family member');
    },
  });

  const restoreMember = useMutation({
    mutationFn: (id: string) => setArchived(id, false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-members'] });
      toast.success('Family member restored');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to restore family member');
    },
  });

  const canAddMore = activeMembers.length < MAX_FAMILY_MEMBERS;

  return {
    familyMembers,
    activeMembers,
    archivedMembers,
    isLoading,
    error,
    activeFamilyMember,
    setActiveFamilyMember,
    createMember,
    updateMember,
    archiveMember,
    restoreMember,
    canAddMore,
    maxMembers: MAX_FAMILY_MEMBERS,
    avatarColors: AVATAR_COLORS,
  };
};
