import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PracticeContact {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  npi: string | null;
}

export type PracticeContactInput = Omit<PracticeContact, 'id' | 'name'>;

/**
 * Contact and address details owned by the tenant. They set these up when
 * onboarding and can update them later; everyone else reads the same row.
 */
export function usePracticeContact(practiceId?: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['practice-contact', practiceId],
    enabled: !!practiceId,
    queryFn: async (): Promise<PracticeContact | null> => {
      const { data, error } = await supabase.rpc('practice_contact_details', {
        _practice_id: practiceId!,
      });
      if (error) throw error;
      return ((data || []) as PracticeContact[])[0] ?? null;
    },
  });

  const save = useMutation({
    mutationFn: async (input: Partial<PracticeContactInput>) => {
      if (!practiceId) throw new Error('No practice selected');
      const { error } = await supabase.rpc('practice_set_contact', {
        _practice_id: practiceId,
        _address: input.address ?? null,
        _city: input.city ?? null,
        _state: input.state ?? null,
        _zip_code: input.zip_code ?? null,
        _country: input.country ?? null,
        _phone: input.phone ?? null,
        _email: input.email ?? null,
        _npi: input.npi ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Contact details saved');
      queryClient.invalidateQueries({ queryKey: ['practice-contact', practiceId] });
      queryClient.invalidateQueries({ queryKey: ['practices'] });
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-detail'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save the contact details'),
  });

  return {
    contact: query.data ?? null,
    isLoading: query.isLoading,
    save: save.mutateAsync,
    isSaving: save.isPending,
  };
}
