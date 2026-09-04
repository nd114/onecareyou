import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { supabaseExtra } from '@/integrations/supabase/types-extra';
import { useAuth } from '@/contexts/AuthContext';

/**
 * A record waiting to be claimed, as shown *before* the person confirms it is
 * theirs.
 *
 * Deliberately carries no clinical content. This used to return the whole row
 * — allergies, conditions, medications, the clinician's notes — to anyone
 * whose auth email matched, confirmed or not. If the answer to "is this you?"
 * turns out to be no, everything in this object has already been shown to the
 * wrong person, so there must be nothing in it worth protecting.
 *
 * The clinical content is read after claiming, through the normal policies.
 */
export interface PendingClinicianRecord {
  id: string;
  clinician_user_id: string;
  practice_id: string | null;
  patient_name: string;
  /** First character and the domain. Enough to recognise, not to learn. */
  masked_email: string | null;
  masked_phone: string | null;
  data_sharing_model: string;
  created_at: string;
  clinician_name?: string;
  clinician_practice?: string;
}

export function usePendingClinicianRecords() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['pending-clinician-records', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // A function rather than a select: the row carries clinical content and
      // RLS is row-level, so choosing not to render those columns would not
      // stop them reaching the browser. This returns only what identifies the
      // record, and only to an address the caller has confirmed.
      const { data, error } = await supabaseExtra.rpc('my_pending_clinician_records');
      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Clinician names via a SECURITY DEFINER RPC that returns only safe
      // display fields (no Stripe IDs, license, push subscription, etc.).
      const clinicianIds = [...new Set(data.map((r) => r.clinician_user_id))];
      const { data: clinicians } = await supabase
        .rpc('get_clinician_basic_info', { clinician_ids: clinicianIds });

      const clinicianMap = new Map(
        (clinicians ?? []).map((c) => [c.user_id, c]),
      );

      return data.map((record) => {
        const clinician = clinicianMap.get(record.clinician_user_id);
        return {
          id: record.id,
          clinician_user_id: record.clinician_user_id,
          practice_id: record.practice_id ?? null,
          patient_name: record.patient_name,
          masked_email: record.masked_email ?? null,
          masked_phone: record.masked_phone ?? null,
          data_sharing_model: record.data_sharing_model,
          created_at: record.created_at,
          clinician_name: clinician
            ? `${clinician.title || ''} ${clinician.first_name || ''} ${clinician.last_name || ''}`.trim()
            : 'A healthcare provider',
          clinician_practice: clinician?.practice_name || undefined,
        } as PendingClinicianRecord;
      });
    },
    enabled: !!user?.id,
  });
}
