import { useState, useEffect, useCallback } from 'react';

interface ServiceWorkerState {
  isSupported: boolean;
  isRegistered: boolean;
  registration: ServiceWorkerRegistration | null;
  error: Error | null;
}

export function useServiceWorker() {
  const [state, setState] = useState<ServiceWorkerState>({
    isSupported: false,
    isRegistered: false,
    registration: null,
    error: null,
  });

  useEffect(() => {
    const isSupported = 'serviceWorker' in navigator;
    
    if (!isSupported) {
      setState(prev => ({ ...prev, isSupported: false }));
      return;
    }

    setState(prev => ({ ...prev, isSupported: true }));

    // Register service worker
    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });

        console.log('Service Worker registered:', registration);

        setState(prev => ({
          ...prev,
          isRegistered: true,
          registration,
        }));

        // Check for updates
        registration.addEventListener('updatefound', () => {
          console.log('Service Worker update found');
        });
      } catch (error) {
        console.error('Service Worker registration failed:', error);
        setState(prev => ({
          ...prev,
          error: error as Error,
        }));
      }
    };

    registerServiceWorker();

    // Listen for controller change
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('Service Worker controller changed');
    });
  }, []);

  // Schedule a notification via the service worker
  const scheduleNotification = useCallback(
    async (
      title: string,
      body: string,
      scheduledTime: Date,
      tag: string,
      data?: Record<string, unknown>
    ) => {
      if (!state.registration?.active) {
        console.warn('No active service worker');
        return false;
      }

      state.registration.active.postMessage({
        type: 'SCHEDULE_NOTIFICATION',
        payload: {
          title,
          body,
          scheduledTime: scheduledTime.toISOString(),
          tag,
          data,
        },
      });

      return true;
    },
    [state.registration]
  );

  // Cancel a scheduled notification
  const cancelNotification = useCallback(
    (tag: string) => {
      if (!state.registration?.active) {
        return;
      }

      state.registration.active.postMessage({
        type: 'CANCEL_NOTIFICATION',
        payload: { tag },
      });
    },
    [state.registration]
  );

  // Show an immediate notification
  const showNotification = useCallback(
    async (title: string, options?: NotificationOptions) => {
      if (!state.registration) {
        console.warn('No service worker registration');
        return false;
      }

      try {
        await state.registration.showNotification(title, {
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          ...options,
        });
        return true;
      } catch (error) {
        console.error('Failed to show notification:', error);
        return false;
      }
    },
    [state.registration]
  );

  return {
    ...state,
    scheduleNotification,
    cancelNotification,
    showNotification,
  };
}
