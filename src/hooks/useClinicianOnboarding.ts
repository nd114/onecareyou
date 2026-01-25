import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useClinicianProfile } from './useClinicianProfile';
import { useClinicianPatients } from './useClinicianPatients';
import { useAlertRules } from './useAlertRules';

export interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  action?: () => void;
  actionLabel?: string;
  href?: string;
}

type OnboardingStepsCompleted = {
  [key: string]: boolean;
};

export const useClinicianOnboarding = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { clinicianProfile } = useClinicianProfile();
  const { patients } = useClinicianPatients();
  const { alertRules } = useAlertRules();

  // Check if BAA is signed
  const { data: baaAgreement } = useQuery({
    queryKey: ['baa-agreement', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('baa_agreements')
        .select('id')
        .eq('clinician_user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Calculate step completion
  const isProfileComplete = !!(
    clinicianProfile?.first_name &&
    clinicianProfile?.last_name &&
    clinicianProfile?.practice_name
  );
  const isBaaSigned = !!baaAgreement;
  const hasFirstPatient = patients.length > 0;
  const hasFirstAlert = alertRules.length > 0;

  const stepsCompleted: OnboardingStepsCompleted = {
    profile: isProfileComplete,
    baa: isBaaSigned,
    first_patient: hasFirstPatient,
    first_alert: hasFirstAlert,
  };

  const completedCount = Object.values(stepsCompleted).filter(Boolean).length;
  const totalSteps = Object.keys(stepsCompleted).length;
  const isComplete = completedCount === totalSteps;

  // Check if onboarding was dismissed
  const { data: onboardingStatus } = useQuery({
    queryKey: ['clinician-onboarding-status', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('clinician_profiles')
        .select('onboarding_completed, onboarding_dismissed_at')
        .eq('user_id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!clinicianProfile,
  });

  const isDismissed = !!(
    onboardingStatus?.onboarding_completed ||
    onboardingStatus?.onboarding_dismissed_at
  );

  // Dismiss onboarding
  const dismissOnboarding = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('clinician_profiles')
        .update({
          onboarding_dismissed_at: new Date().toISOString(),
          onboarding_completed: isComplete,
        })
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinician-onboarding-status'] });
    },
  });

  // Mark onboarding complete
  const completeOnboarding = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('clinician_profiles')
        .update({
          onboarding_completed: true,
          onboarding_steps_completed: stepsCompleted,
        })
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinician-onboarding-status'] });
    },
  });

  // Build steps array
  const steps: OnboardingStep[] = [
    {
      id: 'account',
      label: 'Create your account',
      description: 'Sign up as a healthcare provider',
      completed: true, // Always true if they're here
    },
    {
      id: 'profile',
      label: 'Complete your professional profile',
      description: 'Add your practice name and professional details',
      completed: isProfileComplete,
      href: '/clinician/settings',
      actionLabel: 'Complete Profile',
    },
    {
      id: 'baa',
      label: 'Sign HIPAA Business Associate Agreement',
      description: 'Required for Enterprise tier to ensure compliance',
      completed: isBaaSigned,
      href: '/clinician/baa',
      actionLabel: 'Sign BAA',
    },
    {
      id: 'first_patient',
      label: 'Invite your first patient',
      description: 'Start monitoring patient health data',
      completed: hasFirstPatient,
      href: '/clinician/patients',
      actionLabel: 'Invite Patient',
    },
    {
      id: 'first_alert',
      label: 'Configure vital alerts',
      description: 'Set up automatic notifications for patient vitals',
      completed: hasFirstAlert,
      href: '/clinician/alerts',
      actionLabel: 'Set Up Alerts',
    },
  ];

  // Get next incomplete step
  const nextStep = steps.find((step) => !step.completed);

  // Should show onboarding card
  const shouldShowOnboarding = !isDismissed && !isComplete;

  return {
    steps,
    stepsCompleted,
    completedCount,
    totalSteps,
    isComplete,
    isDismissed,
    shouldShowOnboarding,
    nextStep,
    dismissOnboarding,
    completeOnboarding,
  };
};
