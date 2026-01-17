import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface ConsentState {
  aiProcessingConsent: boolean;
  consentUpdatedAt: string | null;
  loading: boolean;
}

export function useAIConsent() {
  const { user, profile } = useAuth();
  const [state, setState] = useState<ConsentState>({
    aiProcessingConsent: false,
    consentUpdatedAt: null,
    loading: true,
  });

  useEffect(() => {
    if (profile) {
      setState({
        aiProcessingConsent: (profile as any).ai_processing_consent || false,
        consentUpdatedAt: (profile as any).ai_consent_updated_at || null,
        loading: false,
      });
    } else {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [profile]);

  const logConsentChange = useCallback(async (
    action: 'granted' | 'revoked' | 'viewed',
    previousValue: boolean | null,
    newValue: boolean,
    metadata?: Record<string, any>
  ) => {
    if (!user) return;

    try {
      await supabase.from('consent_logs').insert({
        user_id: user.id,
        consent_type: 'ai_processing',
        action,
        previous_value: previousValue,
        new_value: newValue,
        user_agent: navigator.userAgent,
        metadata: metadata || {},
      });
    } catch (error) {
      console.error('Failed to log consent change:', error);
    }
  }, [user]);

  const updateConsent = useCallback(async (consent: boolean): Promise<boolean> => {
    if (!user) {
      toast.error('Please sign in to manage consent settings');
      return false;
    }

    const previousValue = state.aiProcessingConsent;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          ai_processing_consent: consent,
          ai_consent_updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (error) throw error;

      // Log the consent change
      await logConsentChange(
        consent ? 'granted' : 'revoked',
        previousValue,
        consent
      );

      setState(prev => ({
        ...prev,
        aiProcessingConsent: consent,
        consentUpdatedAt: new Date().toISOString(),
      }));

      toast.success(consent 
        ? 'AI processing consent granted' 
        : 'AI processing consent revoked'
      );

      return true;
    } catch (error) {
      console.error('Failed to update consent:', error);
      toast.error('Failed to update consent settings');
      return false;
    }
  }, [user, state.aiProcessingConsent, logConsentChange]);

  const grantConsent = useCallback(() => updateConsent(true), [updateConsent]);
  const revokeConsent = useCallback(() => updateConsent(false), [updateConsent]);

  const checkConsentRequired = useCallback((): boolean => {
    return !state.aiProcessingConsent;
  }, [state.aiProcessingConsent]);

  return {
    hasConsent: state.aiProcessingConsent,
    consentUpdatedAt: state.consentUpdatedAt,
    loading: state.loading,
    grantConsent,
    revokeConsent,
    checkConsentRequired,
    logConsentChange,
  };
}
