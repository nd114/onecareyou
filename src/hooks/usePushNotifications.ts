import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

interface NotificationPermissionState {
  permission: NotificationPermission | 'unsupported';
  isSupported: boolean;
}

export function usePushNotifications() {
  const [permissionState, setPermissionState] = useState<NotificationPermissionState>({
    permission: 'default',
    isSupported: false
  });

  useEffect(() => {
    const isSupported = 'Notification' in window;
    setPermissionState({
      permission: isSupported ? Notification.permission : 'unsupported',
      isSupported
    });
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!permissionState.isSupported) {
      toast.error('Push notifications are not supported in this browser');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      setPermissionState(prev => ({ ...prev, permission }));
      
      if (permission === 'granted') {
        toast.success('Notifications enabled! You\'ll receive medication reminders.');
        return true;
      } else if (permission === 'denied') {
        toast.error('Notifications blocked. Please enable them in your browser settings.');
        return false;
      }
      return false;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      toast.error('Failed to enable notifications');
      return false;
    }
  }, [permissionState.isSupported]);

  const sendNotification = useCallback((title: string, options?: NotificationOptions): void => {
    if (!permissionState.isSupported || permissionState.permission !== 'granted') {
      return;
    }

    try {
      new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...options
      });
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }, [permissionState]);

  const scheduleMedicationReminder = useCallback((
    medicationName: string,
    scheduledTime: Date,
    dosage: string
  ): NodeJS.Timeout | null => {
    if (!permissionState.isSupported || permissionState.permission !== 'granted') {
      return null;
    }

    const now = new Date();
    const delay = scheduledTime.getTime() - now.getTime();

    if (delay <= 0) {
      return null; // Time has already passed
    }

    // Schedule notification
    const timeoutId = setTimeout(() => {
      sendNotification(`Time to take ${medicationName}`, {
        body: `Dosage: ${dosage}`,
        tag: `medication-${medicationName}-${scheduledTime.getTime()}`,
        requireInteraction: true
      });
    }, delay);

    return timeoutId;
  }, [permissionState, sendNotification]);

  return {
    permission: permissionState.permission,
    isSupported: permissionState.isSupported,
    isGranted: permissionState.permission === 'granted',
    requestPermission,
    sendNotification,
    scheduleMedicationReminder
  };
}
