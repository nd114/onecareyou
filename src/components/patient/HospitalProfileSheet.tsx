import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Building2, Loader2, Mail, MapPin, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export interface InstitutionContact {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
}

/**
 * A patient who shares their record with a hospital needs to be able to reach
 * that hospital — the number they are actually registered with, not a search
 * result. The details come from the tenant's own record, so they stay correct
 * without the patient maintaining anything.
 */
export function useInstitutionContact(practiceId?: string | null) {
  return useQuery({
    queryKey: ['institution-contact', practiceId],
    enabled: !!practiceId,
    queryFn: async (): Promise<InstitutionContact | null> => {
      const { data, error } = await supabase.rpc('patient_institution_contact' as any, {
        _practice_id: practiceId!,
      });
      if (error) throw error;
      return ((data || []) as InstitutionContact[])[0] ?? null;
    },
  });
}

interface HospitalProfileSheetProps {
  practiceId: string | null;
  fallbackName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const HospitalProfileSheet = ({
  practiceId,
  fallbackName,
  open,
  onOpenChange,
}: HospitalProfileSheetProps) => {
  const { data: contact, isLoading } = useInstitutionContact(open ? practiceId : null);

  const addressLine = [
    contact?.address,
    contact?.city,
    contact?.state,
    contact?.zip_code,
    contact?.country,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            {contact?.name || fallbackName || 'Hospital'}
          </DialogTitle>
          <DialogDescription>
            How to reach the hospital you are registered with
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <Phone className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              {contact?.phone ? (
                <a href={`tel:${contact.phone}`} className="font-medium hover:underline">
                  {contact.phone}
                </a>
              ) : (
                <span className="text-muted-foreground">No phone number on file yet</span>
              )}
            </div>
            <div className="flex items-start gap-3">
              <Mail className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              {contact?.email ? (
                <a href={`mailto:${contact.email}`} className="font-medium hover:underline">
                  {contact.email}
                </a>
              ) : (
                <span className="text-muted-foreground">No email on file yet</span>
              )}
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <span className={addressLine ? '' : 'text-muted-foreground'}>
                {addressLine || 'No address on file yet'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground pt-2 border-t">
              These details are maintained by the hospital. In an emergency, call your local
              emergency number instead.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
