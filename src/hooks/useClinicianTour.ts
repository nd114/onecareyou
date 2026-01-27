import { useEffect, useState, useCallback } from 'react';
import { driver, DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const TOUR_STEPS: DriveStep[] = [
  {
    element: '[data-tour="stats-patients"]',
    popover: {
      title: 'Patient Overview',
      description: 'See how many patients are connected to your practice at a glance.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="stats-pending"]',
    popover: {
      title: 'Pending Guidance',
      description: 'Track guidance items that patients haven\'t acknowledged yet.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="stats-alerts"]',
    popover: {
      title: 'Active Alert Rules',
      description: 'Monitor how many vital alert rules are actively protecting your patients.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="patients-tab"]',
    popover: {
      title: 'Patient Management',
      description: 'View all your connected patients, search by name, and access their health data.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="invite-patient"]',
    popover: {
      title: 'Invite New Patients',
      description: 'Send email invitations to connect new patients to your practice.',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="guidance-tab"]',
    popover: {
      title: 'Clinical Guidance',
      description: 'Send personalized health instructions directly to your patients\' apps.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="alerts-tab"]',
    popover: {
      title: 'Vital Alerts',
      description: 'Configure automatic notifications when patient vitals exceed thresholds.',
      side: 'bottom',
      align: 'center',
    },
  },
];

export const useClinicianTour = () => {
  const { user } = useAuth();
  const [hasSeenTour, setHasSeenTour] = useState<boolean | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Check if user has seen the tour
  useEffect(() => {
    const checkTourStatus = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from('clinician_profiles')
        .select('onboarding_steps_completed')
        .eq('user_id', user.id)
        .single();

      const stepsCompleted = data?.onboarding_steps_completed as Record<string, boolean> | null;
      setHasSeenTour(stepsCompleted?.dashboard_tour === true);
    };

    checkTourStatus();
  }, [user]);

  // Mark tour as completed
  const markTourComplete = useCallback(async () => {
    if (!user) return;
    
    const { data: existing } = await supabase
      .from('clinician_profiles')
      .select('onboarding_steps_completed')
      .eq('user_id', user.id)
      .single();

    const current = (existing?.onboarding_steps_completed as Record<string, boolean>) || {};
    
    await supabase
      .from('clinician_profiles')
      .update({
        onboarding_steps_completed: {
          ...current,
          dashboard_tour: true,
        },
      })
      .eq('user_id', user.id);

    setHasSeenTour(true);
  }, [user]);

  // Start the tour
  const startTour = useCallback(() => {
    setIsRunning(true);
    
    const driverObj = driver({
      showProgress: true,
      steps: TOUR_STEPS,
      nextBtnText: 'Next →',
      prevBtnText: '← Back',
      doneBtnText: 'Done',
      progressText: '{{current}} of {{total}}',
      onDestroyStarted: () => {
        markTourComplete();
        setIsRunning(false);
        driverObj.destroy();
      },
    });

    // Small delay to ensure DOM elements are rendered
    setTimeout(() => {
      driverObj.drive();
    }, 500);
  }, [markTourComplete]);

  // Auto-start tour for first-time users
  useEffect(() => {
    if (hasSeenTour === false && !isRunning) {
      // Delay to let page fully render
      const timer = setTimeout(() => {
        startTour();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [hasSeenTour, isRunning, startTour]);

  return {
    hasSeenTour,
    isRunning,
    startTour,
  };
};
