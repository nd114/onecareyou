import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface ConsentState {
  aiProcessingConsent: boolean;
  /**
   * Separate from the above: whether the assistant may *prepare* changes to
   * the record for approval. Using an assistant and letting it change things
   * are two decisions, so they get two answers.
   */
  aiActionsConsent: boolean;
  consentUpdatedAt: string | null;
  loading: boolean;
}

export function useAIConsent() {
  const { user, profile } = useAuth();
  const [state, setState] = useState<ConsentState>({
    aiProcessingConsent: false,
    aiActionsConsent: false,
    consentUpdatedAt: null,
    loading: true,
  });

  useEffect(() => {
    if (profile) {
      setState({
        aiProcessingConsent: (profile as any).ai_processing_consent || false,
        aiActionsConsent: (profile as any).ai_actions_consent || false,
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

  /** Turns the assistant's ability to prepare record changes on or off. */
  const updateActionsConsent = useCallback(async (consent: boolean): Promise<boolean> => {
    if (!user) {
      toast.error('Please sign in to manage consent settings');
      return false;
    }
    const previousValue = state.aiActionsConsent;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          ai_actions_consent: consent,
          ai_actions_consent_updated_at: new Date().toISOString(),
        } as never)
        .eq('user_id', user.id);
      if (error) throw error;

      await supabase.from('consent_logs').insert({
        user_id: user.id,
        consent_type: 'ai_actions',
        action: consent ? 'granted' : 'revoked',
        previous_value: previousValue,
        new_value: consent,
        user_agent: navigator.userAgent,
        metadata: {},
      });

      setState(prev => ({ ...prev, aiActionsConsent: consent }));
      toast.success(consent
        ? 'The assistant can now prepare changes for you to approve'
        : 'The assistant can no longer prepare changes');
      return true;
    } catch (error) {
      console.error('Failed to update assistant actions consent:', error);
      toast.error('Could not save that preference');
      return false;
    }
  }, [user, state.aiActionsConsent]);

  const grantConsent = useCallback(() => updateConsent(true), [updateConsent]);
  const revokeConsent = useCallback(() => updateConsent(false), [updateConsent]);

  const checkConsentRequired = useCallback((): boolean => {
    return !state.aiProcessingConsent;
  }, [state.aiProcessingConsent]);

  return {
    hasConsent: state.aiProcessingConsent,
    hasActionsConsent: state.aiActionsConsent,
    grantActionsConsent: () => updateActionsConsent(true),
    revokeActionsConsent: () => updateActionsConsent(false),
    consentUpdatedAt: state.consentUpdatedAt,
    loading: state.loading,
    grantConsent,
    revokeConsent,
    checkConsentRequired,
    logConsentChange,
  };
}
