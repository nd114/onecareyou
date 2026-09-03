import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, HeartPulse } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toClinicalList, wasShared } from '@/lib/clinical-lists';

interface ClinicalProfile {
  user_id: string;
  health_conditions: unknown;
  allergies: unknown;
}

/**
 * Allergies and conditions for a patient the clinician is connected to, through
 * either pathway. Allergies lead because reacting to the wrong drug is the
 * failure this exists to prevent.
 *
 * Each field is released by the database only if the patient shared that
 * category, so "not shared" and "none recorded" are different states and are
 * shown differently.
 */
export function PatientSafetyStrip({ patientUserId }: { patientUserId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['patient-clinical-profile', patientUserId],
    enabled: !!patientUserId,
    queryFn: async (): Promise<ClinicalProfile | null> => {
      const { data, error } = await supabase.rpc('get_patient_clinical_profile', {
        patient_ids: [patientUserId],
      });
      if (error) throw error;
      return ((data ?? []) as ClinicalProfile[])[0] ?? null;
    },
  });

  if (isLoading || !data) return null;

  // null means the category was withheld; an empty list means none recorded.
  const allergiesShared = wasShared(data.allergies);
  const conditionsShared = wasShared(data.health_conditions);
  const allergies = toClinicalList(data.allergies);
  const conditions = toClinicalList(data.health_conditions);

  return (
    <div className="grid gap-3 sm:grid-cols-2 mb-6">
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          Allergies
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {!allergiesShared ? (
            <span className="text-sm text-muted-foreground">Not shared by the patient</span>
          ) : allergies.length === 0 ? (
            <span className="text-sm text-muted-foreground">None recorded</span>
          ) : (
            allergies.map((a) => (
              <Badge key={a} variant="destructive" className="text-xs">
                {a}
              </Badge>
            ))
          )}
        </div>
      </div>

      <div className="rounded-lg border p-3">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <HeartPulse className="h-3.5 w-3.5" />
          Conditions
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {!conditionsShared ? (
            <span className="text-sm text-muted-foreground">Not shared by the patient</span>
          ) : conditions.length === 0 ? (
            <span className="text-sm text-muted-foreground">None recorded</span>
          ) : (
            conditions.map((c) => (
              <Badge key={c} variant="secondary" className="text-xs">
                {c}
              </Badge>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
