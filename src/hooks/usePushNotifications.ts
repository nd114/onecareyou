import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

interface NotificationPermissionState {
  permission: NotificationPermission | 'unsupported';
  isSupported: boolean;
  browserInfo: {
    name: string;
    canUseNotifications: boolean;
    limitations?: string;
  };
}

// Detect browser for notification support info
function detectBrowser(): { name: string; canUseNotifications: boolean; limitations?: string } {
  const ua = navigator.userAgent;
  
  // iOS Safari doesn't support web push at all
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  if (isIOS) {
    // Check if it's iOS 16.4+ which added limited support
    const match = ua.match(/OS (\d+)_/);
    const version = match ? parseInt(match[1], 10) : 0;
    if (version >= 16) {
      return { 
        name: 'Safari (iOS)', 
        canUseNotifications: true,
        limitations: 'Requires adding to Home Screen (PWA mode) for notifications to work'
      };
    }
    return { 
      name: 'Safari (iOS)', 
      canUseNotifications: false,
      limitations: 'iOS 15 and below do not support web notifications. Please update to iOS 16.4+'
    };
  }
  
  // macOS Safari
  if (/^((?!chrome|android).)*safari/i.test(ua)) {
    return { 
      name: 'Safari (macOS)', 
      canUseNotifications: true,
      limitations: 'Notifications work, but may require allowing in Safari preferences'
    };
  }
  
  // Chrome
  if (/Chrome/.test(ua) && !/Edg/.test(ua)) {
    return { name: 'Chrome', canUseNotifications: true };
  }
  
  // Firefox
  if (/Firefox/.test(ua)) {
    return { name: 'Firefox', canUseNotifications: true };
  }
  
  // Edge
  if (/Edg/.test(ua)) {
    return { name: 'Edge', canUseNotifications: true };
  }
  
  return { name: 'Unknown', canUseNotifications: true };
}

export function usePushNotifications() {
  const [permissionState, setPermissionState] = useState<NotificationPermissionState>({
    permission: 'default',
    isSupported: false,
    browserInfo: { name: 'Unknown', canUseNotifications: false },
  });

  useEffect(() => {
    const isSupported = 'Notification' in window;
    const browserInfo = detectBrowser();
    
    setPermissionState({
      permission: isSupported ? Notification.permission : 'unsupported',
      isSupported: isSupported && browserInfo.canUseNotifications,
      browserInfo,
    });
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const { browserInfo } = permissionState;
    
    if (!permissionState.isSupported) {
      if (browserInfo.limitations) {
        toast.error(`Notifications not supported`, {
          description: browserInfo.limitations,
          duration: 8000,
        });
      } else {
        toast.error('Notifications not supported', {
          description: 'Your browser does not support push notifications. Try using Chrome, Firefox, or Edge.',
        });
      }
      return false;
    }

    // If already granted, just return true
    if (permissionState.permission === 'granted') {
      return true;
    }

    // If previously denied, guide user to browser settings
    if (permissionState.permission === 'denied') {
      toast.error('Notifications previously blocked', {
        description: 'To enable notifications, click the lock/info icon in your browser\'s address bar, then allow notifications',
        duration: 8000,
      });
      return false;
    }

    // Permission is 'default' - request it
    try {
      const permission = await Notification.requestPermission();
      setPermissionState(prev => ({ ...prev, permission }));
      
      if (permission === 'granted') {
        toast.success('Notifications enabled!', {
          description: 'You\'ll receive medication reminders before each scheduled dose.',
        });
        return true;
      } else if (permission === 'denied') {
        // User just clicked "Block" on the prompt
        toast.error('Notifications blocked', {
          description: 'You blocked notifications. To enable them later, click the lock icon in your browser\'s address bar.',
          duration: 6000,
        });
        return false;
      } else {
        // User dismissed the prompt without choosing
        toast.info('Permission required', {
          description: 'Please allow notifications when prompted to receive medication reminders.',
        });
        return false;
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      toast.error('Something went wrong', {
        description: 'Could not request notification permission. Please try again.',
      });
      return false;
    }
  }, [permissionState]);

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
    browserInfo: permissionState.browserInfo,
    requestPermission,
    sendNotification,
    scheduleMedicationReminder
  };
}
