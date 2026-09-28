import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { toast } from 'sonner';
import { SELF_DESCRIBING_TYPES, type NotificationType } from '@/lib/notification-display';

export interface ClinicianGuidanceNotification {
  id: string;
  guidance_id: string | null;
  clinician_user_id: string;
  patient_user_id: string;
  notification_type: NotificationType;
  is_read: boolean;
  created_at: string;
  /** Written by the server for share-ended and routing notices. */
  message: string | null;
  practice_id: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  // Joined data
  guidance?: {
    title: string;
    category: string;
    priority: string;
  };
  patient_profile?: {
    name: string | null;
  };
}

export interface ClinicianNotificationPreferences {
  notify_on_guidance_acknowledged: boolean;
  notify_on_guidance_completed: boolean;
  notify_on_guidance_expired: boolean;
}

export const useClinicianNotifications = () => {
  const { user } = useAuth();
  const { clinicianProfile } = useClinicianProfile();
  const queryClient = useQueryClient();
  const isClinician = !!clinicianProfile;

  // Fetch unread notifications for the clinician
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['clinician-notifications', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('clinician_guidance_notifications')
        .select(`
          id,
          guidance_id,
          clinician_user_id,
          patient_user_id,
          notification_type,
          is_read,
          created_at,
          message,
          practice_id,
          acknowledged_at,
          acknowledged_by
        `)
        .eq('clinician_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch related guidance and patient info
      const notificationsWithDetails = await Promise.all(
        (data || []).map(async (notification) => {
          // These carry their own words, and the patient's profile may already
          // be closed to the reader — that is what a share-ended notice means.
          if (SELF_DESCRIBING_TYPES.includes(notification.notification_type) || !notification.guidance_id) {
            return notification as ClinicianGuidanceNotification;
          }

          // Get guidance details
          const { data: guidance } = await supabase
            .from('clinician_guidance')
            .select('title, category, priority')
            .eq('id', notification.guidance_id)
            .single();

          // Get patient name from profiles
          const { data: patientProfile } = await supabase
            .from('profiles')
            .select('name')
            .eq('user_id', notification.patient_user_id)
            .single();

          return {
            ...notification,
            guidance: guidance || undefined,
            patient_profile: patientProfile || undefined,
          } as ClinicianGuidanceNotification;
        })
      );

      return notificationsWithDetails;
    },
    enabled: !!user && isClinician,
    refetchInterval: isClinician ? 30000 : false,
  });

  // Fetch notification preferences
  const { data: preferences } = useQuery({
    queryKey: ['clinician-notification-preferences', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from('clinician_profiles')
        .select('notify_on_guidance_acknowledged, notify_on_guidance_completed, notify_on_guidance_expired')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data as ClinicianNotificationPreferences | null;
    },
    enabled: !!user && isClinician,
  });

  // Mark notification as read
  const markAsRead = useMutation({
    mutationFn: async (notificationId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('clinician_guidance_notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('clinician_user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinician-notifications'] });
    },
  });

  // Mark all notifications as read
  const markAllAsRead = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('clinician_guidance_notifications')
        .update({ is_read: true })
        .eq('clinician_user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinician-notifications'] });
    },
  });

  const acknowledge = useAcknowledgePracticeNotice();

  // Update notification preferences
  const updatePreferences = useMutation({
    mutationFn: async (newPreferences: Partial<ClinicianNotificationPreferences>) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('clinician_profiles')
        .update(newPreferences)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinician-notification-preferences'] });
    },
      onError: (error: Error) => {
      toast.error(error.message || 'Could not save your notification preferences');
    },
});

  const unreadNotifications = notifications.filter(n => !n.is_read);
  const unreadCount = unreadNotifications.length;

  return {
    notifications,
    unreadNotifications,
    unreadCount,
    isLoading,
    preferences,
    markAsRead,
    markAllAsRead,
    acknowledge,
    updatePreferences,
  };
};

/**
 * A manager records that they have seen a lead's routing. Goes through the
 * server function: the column is not client-writable, and the function stamps
 * every manager's copy and checks the caller still runs the practice.
 */
export const useAcknowledgePracticeNotice = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase.rpc('acknowledge_practice_notice', {
        _notification_id: notificationId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinician-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['practice-routing-notices'] });
      toast.success('Acknowledged');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Could not acknowledge that notice');
    },
  });
};

/**
 * Routings by department leads outside their departments that this manager has
 * not yet seen acknowledged, for the practice admin page. Reads the caller's own
 * copies only (RLS), so a manager who joined after a notice was sent does not
 * see it — the audit log still does.
 */
export const usePracticeRoutingNotices = (practiceId: string | null) => {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['practice-routing-notices', practiceId, user?.id],
    enabled: !!user && !!practiceId,
    queryFn: async (): Promise<ClinicianGuidanceNotification[]> => {
      const { data, error } = await supabase
        .from('clinician_guidance_notifications')
        .select(
          'id, guidance_id, clinician_user_id, patient_user_id, notification_type, is_read, created_at, message, practice_id, acknowledged_at, acknowledged_by',
        )
        .eq('clinician_user_id', user!.id)
        .eq('practice_id', practiceId!)
        .eq('notification_type', 'routed_outside_department')
        .is('acknowledged_at', null)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ClinicianGuidanceNotification[];
    },
  });
  return { notices: query.data ?? [], isLoading: query.isLoading };
};
