// Service Worker for Push Notifications
const CACHE_NAME = 'meditracker-v1';

// Install event
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(clients.claim());
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push received');
  
  let data = {
    title: 'MediTracker Notification',
    body: 'You have a new notification',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'general',
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: data.tag || 'general',
    requireInteraction: data.requireInteraction || false,
    data: data.data || {},
    actions: data.actions || [],
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked');
  
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window/tab open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            if (event.notification.data?.url) {
              client.navigate(event.notification.data.url);
            }
            return;
          }
        }
        // If no window is open, open one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('Service Worker: Notification closed', event.notification.tag);
});

// Periodic sync for background tasks (due date reminders)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-due-dates') {
    event.waitUntil(checkDueDates());
  }
});

// Check for upcoming due dates
async function checkDueDates() {
  // This would typically fetch from the database
  // For now, we'll handle this client-side with scheduled notifications
  console.log('Service Worker: Checking due dates...');
}

// Message handler for client communication
self.addEventListener('message', (event) => {
  console.log('Service Worker: Message received', event.data);
  
  if (event.data.type === 'SCHEDULE_NOTIFICATION') {
    const { title, body, scheduledTime, tag, data } = event.data.payload;
    scheduleNotification(title, body, scheduledTime, tag, data);
  }
  
  if (event.data.type === 'CANCEL_NOTIFICATION') {
    // Handle cancellation if needed
    console.log('Cancelling notification:', event.data.payload.tag);
  }
});

// Schedule a notification
function scheduleNotification(title, body, scheduledTime, tag, data) {
  const delay = new Date(scheduledTime).getTime() - Date.now();
  
  if (delay <= 0) {
    console.log('Service Worker: Scheduled time already passed');
    return;
  }

  setTimeout(() => {
    self.registration.showNotification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag,
      requireInteraction: true,
      data,
      vibrate: [200, 100, 200],
    });
  }, delay);
}
