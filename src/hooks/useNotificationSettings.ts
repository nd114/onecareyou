import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface NotificationSettings {
  push_notifications_enabled: boolean;
  email_notifications_enabled: boolean;
  weekly_adherence_report_enabled: boolean;
}

export function useNotificationSettings() {
  const { user, profile } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>({
    push_notifications_enabled: false,
    email_notifications_enabled: true,
    weekly_adherence_report_enabled: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load settings from profile
  useEffect(() => {
    if (profile) {
      setSettings({
        push_notifications_enabled: (profile as any).push_notifications_enabled ?? false,
        email_notifications_enabled: (profile as any).email_notifications_enabled ?? true,
        weekly_adherence_report_enabled: (profile as any).weekly_adherence_report_enabled ?? true,
      });
      setIsLoading(false);
    }
  }, [profile]);

  const updatePushNotifications = useCallback(async (enabled: boolean) => {
    if (!user) return false;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ push_notifications_enabled: enabled })
        .eq('user_id', user.id);

      if (error) throw error;

      setSettings(prev => ({ ...prev, push_notifications_enabled: enabled }));
      toast.success(enabled ? 'Push notifications enabled' : 'Push notifications disabled');
      return true;
    } catch (error) {
      console.error('Error updating push notification settings:', error);
      toast.error('Failed to update notification settings');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [user]);

  const updateEmailNotifications = useCallback(async (enabled: boolean) => {
    if (!user) return false;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ email_notifications_enabled: enabled })
        .eq('user_id', user.id);

      if (error) throw error;

      setSettings(prev => ({ ...prev, email_notifications_enabled: enabled }));
      toast.success(enabled ? 'Email notifications enabled' : 'Email notifications disabled');
      return true;
    } catch (error) {
      console.error('Error updating email notification settings:', error);
      toast.error('Failed to update notification settings');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [user]);

  return {
    settings,
    isLoading,
    isSaving,
    updatePushNotifications,
    updateEmailNotifications,
  };
}

export function useClinicianNotificationSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>({
    push_notifications_enabled: false,
    email_notifications_enabled: true,
    weekly_adherence_report_enabled: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load settings from clinician profile
  useEffect(() => {
    const loadSettings = async () => {
      if (!user) return;
      
      const { data, error } = await supabase
        .from('clinician_profiles')
        .select('push_notifications_enabled, email_notifications_enabled')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setSettings({
          push_notifications_enabled: data.push_notifications_enabled ?? false,
          email_notifications_enabled: data.email_notifications_enabled ?? true,
          weekly_adherence_report_enabled: true, // Clinicians don't have this setting
        });
      }
      setIsLoading(false);
    };

    loadSettings();
  }, [user]);

  const updatePushNotifications = useCallback(async (enabled: boolean) => {
    if (!user) return false;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('clinician_profiles')
        .update({ push_notifications_enabled: enabled })
        .eq('user_id', user.id);

      if (error) throw error;

      setSettings(prev => ({ ...prev, push_notifications_enabled: enabled }));
      toast.success(enabled ? 'Push notifications enabled' : 'Push notifications disabled');
      return true;
    } catch (error) {
      console.error('Error updating push notification settings:', error);
      toast.error('Failed to update notification settings');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [user]);

  const updateEmailNotifications = useCallback(async (enabled: boolean) => {
    if (!user) return false;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('clinician_profiles')
        .update({ email_notifications_enabled: enabled })
        .eq('user_id', user.id);

      if (error) throw error;

      setSettings(prev => ({ ...prev, email_notifications_enabled: enabled }));
      toast.success(enabled ? 'Email notifications enabled' : 'Email notifications disabled');
      return true;
    } catch (error) {
      console.error('Error updating email notification settings:', error);
      toast.error('Failed to update notification settings');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [user]);

  return {
    settings,
    isLoading,
    isSaving,
    updatePushNotifications,
    updateEmailNotifications,
  };
}
