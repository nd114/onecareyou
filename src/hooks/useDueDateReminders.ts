import { useEffect, useCallback } from 'react';
import { useServiceWorker } from './useServiceWorker';
import { usePushNotifications } from './usePushNotifications';

interface GuidanceItem {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
}

export function useDueDateReminders(guidanceItems: GuidanceItem[]) {
  const { isRegistered, scheduleNotification } = useServiceWorker();
  const { isGranted } = usePushNotifications();

  // Schedule reminders for upcoming due dates
  const scheduleReminders = useCallback(async () => {
    if (!isRegistered || !isGranted) {
      return;
    }

    const now = new Date();
    const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    for (const item of guidanceItems) {
      // Skip if no due date or already completed
      if (!item.due_date || item.status === 'completed') {
        continue;
      }

      const dueDate = new Date(item.due_date);
      
      // Skip if due date has passed
      if (dueDate < now) {
        continue;
      }

      // Schedule reminder for 24 hours before due date
      const reminderTime = new Date(dueDate.getTime() - 24 * 60 * 60 * 1000);
      
      // Only schedule if reminder time is in the future but within the next week
      if (reminderTime > now && reminderTime < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) {
        await scheduleNotification(
          'Healthcare Instruction Due Soon',
          `"${item.title}" is due tomorrow`,
          reminderTime,
          `due-date-reminder-${item.id}`,
          { url: '/guidance', guidanceId: item.id }
        );
      }

      // Schedule reminder for same day (morning)
      if (dueDate.toDateString() === now.toDateString() || 
          dueDate.toDateString() === oneDayFromNow.toDateString()) {
        const morningReminder = new Date(dueDate);
        morningReminder.setHours(9, 0, 0, 0);
        
        if (morningReminder > now) {
          await scheduleNotification(
            'Healthcare Instruction Due Today',
            `Don't forget: "${item.title}" is due today`,
            morningReminder,
            `due-date-today-${item.id}`,
            { url: '/guidance', guidanceId: item.id }
          );
        }
      }
    }
  }, [isRegistered, isGranted, guidanceItems, scheduleNotification]);

  // Schedule reminders when items change
  useEffect(() => {
    if (guidanceItems.length > 0) {
      scheduleReminders();
    }
  }, [guidanceItems, scheduleReminders]);

  return {
    scheduleReminders,
  };
}
