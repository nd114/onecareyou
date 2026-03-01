import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Shield, Eye, X, CheckCircle2, Handshake, UserCheck, Loader2,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { PendingClinicianRecord } from '@/hooks/usePendingClinicianRecords';

interface Props {
  record: PendingClinicianRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MODEL_OPTIONS = [
  {
    value: 'collaborative',
    label: 'Accept & Collaborate',
    description: 'Merge their data into your profile. Both you and your provider can update records going forward.',
    icon: Handshake,
  },
  {
    value: 'patient_managed',
    label: 'Accept & Take Ownership',
    description: 'Import their data but you control everything. Your provider gets read-only access.',
    icon: UserCheck,
  },
  {
    value: 'view_only',
    label: 'View Only',
    description: 'Let your provider see your data but they cannot modify it. Access expires in 30 days.',
    icon: Eye,
  },
];

export function ClinicianDataConsentDialog({ record, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedModel, setSelectedModel] = useState('collaborative');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAccept = async () => {
    if (!user) return;
    setIsSubmitting(true);

    try {
      // 1. Update the clinician_patient_record to link to this user
      const { error: linkError } = await supabase
        .from('clinician_patient_records')
        .update({
          linked_user_id: user.id,
          invitation_status: 'accepted',
          data_sharing_model: selectedModel,
          patient_data_consent_given_at: new Date().toISOString(),
        } as any)
        .eq('id', record.id);

      if (linkError) throw linkError;

      // 2. Create a data_sharing_agreement
      const permissions = {
        vitals_read: true,
        vitals_write: selectedModel === 'collaborative',
        meds_read: true,
        meds_write: selectedModel === 'collaborative',
        profile_read: true,
        profile_write: false,
        notes_read: selectedModel !== 'view_only',
      };

      const { error: agreementError } = await supabase
        .from('data_sharing_agreements')
        .insert({
          clinician_user_id: record.clinician_user_id,
          patient_user_id: user.id,
          clinician_record_id: record.id,
          sharing_model: selectedModel,
          agreed_by: 'patient',
          permissions,
        } as any);

      if (agreementError) throw agreementError;

      // 3. Create a provider_share so clinician appears in existing patient flows
      const inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      const sharePermissions = {
        vitals: true,
        meds: true,
        adherence: true,
        profile: selectedModel !== 'view_only',
      };

      const { data: share, error: shareError } = await supabase
        .from('provider_shares')
        .insert({
          user_id: user.id,
          provider_name: record.clinician_name || 'Healthcare Provider',
          clinician_user_id: record.clinician_user_id,
          invite_code: inviteCode,
          permissions: sharePermissions,
          is_active: true,
          expires_at: selectedModel === 'view_only'
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            : null,
        })
        .select('id')
        .single();

      if (shareError) throw shareError;

      // 4. Link the provider_share back to the record
      if (share) {
        await supabase
          .from('clinician_patient_records')
          .update({ provider_share_id: share.id } as any)
          .eq('id', record.id);
      }

      queryClient.invalidateQueries({ queryKey: ['pending-clinician-records'] });
      queryClient.invalidateQueries({ queryKey: ['clinician-patients-v2'] });
      queryClient.invalidateQueries({ queryKey: ['provider-shares'] });

      toast.success('Connected with your healthcare provider');
      onOpenChange(false);
    } catch (error) {
      console.error('Error accepting clinician connection:', error);
      toast.error('Failed to connect. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (!user) return;
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('clinician_patient_records')
        .update({
          invitation_status: 'declined',
          linked_user_id: user.id,
        } as any)
        .eq('id', record.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['pending-clinician-records'] });
      toast.success('Connection declined');
      onOpenChange(false);
    } catch (error) {
      console.error('Error declining:', error);
      toast.error('Failed to decline. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const dataSummary = [
    record.health_conditions.length > 0 && `${record.health_conditions.length} health condition(s)`,
    record.medications.length > 0 && `${record.medications.length} medication(s)`,
    record.allergies.length > 0 && `${record.allergies.length} allergy(ies)`,
    record.notes && 'Clinical notes',
  ].filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle>Healthcare Provider Connection</DialogTitle>
              <DialogDescription>
                {record.clinician_name} wants to connect with you
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          {/* Clinician info */}
          <div className="bg-muted/50 rounded-lg p-4">
            <p className="text-sm">
              <span className="font-medium">{record.clinician_name}</span>
              {record.clinician_practice && (
                <span className="text-muted-foreground"> at {record.clinician_practice}</span>
              )}
              {' '}has been managing health records on your behalf. They have the following data about you:
            </p>
            {dataSummary.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {dataSummary.map((item, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{item}</Badge>
                ))}
              </div>
            )}
          </div>

          {/* Consent notice */}
          <p className="text-xs text-muted-foreground">
            You are not required to connect. Declining has no effect on your OneCare account or features.
          </p>

          {/* Model selection */}
          <div>
            <p className="text-sm font-medium mb-3">Choose how you'd like to proceed:</p>
            <RadioGroup value={selectedModel} onValueChange={setSelectedModel} className="space-y-3">
              {MODEL_OPTIONS.map(option => (
                <label
                  key={option.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedModel === option.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                  }`}
                >
                  <RadioGroupItem value={option.value} className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <option.icon className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">{option.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handleDecline}
              disabled={isSubmitting}
              className="flex-1"
            >
              <X className="h-4 w-4 mr-2" />
              Decline
            </Button>
            <Button
              onClick={handleAccept}
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Accept
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
