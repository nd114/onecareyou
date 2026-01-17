import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ClinicianGuidanceNotification {
  id: string;
  guidance_id: string;
  clinician_user_id: string;
  patient_user_id: string;
  notification_type: 'acknowledged' | 'completed' | 'expired' | 'dismissed';
  is_read: boolean;
  created_at: string;
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
  const queryClient = useQueryClient();

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
          created_at
        `)
        .eq('clinician_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch related guidance and patient info
      const notificationsWithDetails = await Promise.all(
        (data || []).map(async (notification) => {
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
    enabled: !!user,
    refetchInterval: 30000, // Refetch every 30 seconds
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
    enabled: !!user,
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
    updatePreferences,
  };
};
