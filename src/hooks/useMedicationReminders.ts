import { useEffect, useCallback, useRef } from 'react';
import { useServiceWorker } from './useServiceWorker';
import { usePushNotifications } from './usePushNotifications';
import { useNotificationPreferences } from './useNotificationPreferences';
import { useMedications, Medication } from './useMedications';
import { useScheduleEntries } from './useScheduleEntries';
import { format, isToday, addDays, setHours, setMinutes, parseISO } from 'date-fns';

interface ReminderConfig {
  reminderMinutesBefore: number; // Minutes before scheduled time to send reminder
  enableSnooze: boolean;
  snoozeMinutes: number;
}

const DEFAULT_CONFIG: ReminderConfig = {
  reminderMinutesBefore: 5,
  enableSnooze: true,
  snoozeMinutes: 10,
};

export function useMedicationReminders(config: Partial<ReminderConfig> = {}) {
  const { isRegistered, scheduleNotification, showNotification } = useServiceWorker();
  const { isGranted } = usePushNotifications();
  // Two different switches, and only one was being read. `isGranted` is the
  // BROWSER's permission; the preference is what the person chose in OneCare's
  // own Settings. Reminders fired on the browser permission alone, so switching
  // notifications off in Settings changed nothing — the control said off and
  // the phone kept buzzing.
  const { isEnabled } = useNotificationPreferences('patient');
  const wantsReminders = isGranted && isEnabled('medication_reminders', 'push');
  const { medications } = useMedications();
  const { entries: todayEntries } = useScheduleEntries(new Date());
  
  const scheduledIds = useRef<Set<string>>(new Set());
  const reminderConfig = { ...DEFAULT_CONFIG, ...config };

  // Schedule reminders for today's medications
  const scheduleRemindersForToday = useCallback(async () => {
    if (!isRegistered || !wantsReminders) {
      console.log('Cannot schedule reminders: SW not registered or notifications not granted');
      return;
    }

    const now = new Date();
    
    // Get pending entries for today
    const pendingEntries = todayEntries.filter(entry => entry.status === 'pending');

    for (const entry of pendingEntries) {
      // Skip if already scheduled
      if (scheduledIds.current.has(entry.id)) continue;

      const scheduledTime = new Date(entry.scheduled_time);
      
      // Skip if time has passed
      if (scheduledTime < now) continue;

      // Calculate reminder time (X minutes before)
      const reminderTime = new Date(scheduledTime.getTime() - reminderConfig.reminderMinutesBefore * 60 * 1000);
      
      // Only schedule if reminder time is in the future
      if (reminderTime > now) {
        const medicationName = entry.medication?.name || 'Medication';
        const dosage = entry.medication?.dosage || '';
        const timeStr = format(scheduledTime, 'h:mm a');

        await scheduleNotification(
          `⏰ Time to take ${medicationName}`,
          `${dosage} scheduled for ${timeStr}`,
          reminderTime,
          `med-reminder-${entry.id}`,
          {
            url: '/schedule',
            entryId: entry.id,
            medicationId: entry.medication_id,
            type: 'medication_reminder',
          }
        );

        scheduledIds.current.add(entry.id);
        console.log(`Scheduled reminder for ${medicationName} at ${reminderTime.toLocaleTimeString()}`);
      }
    }
  }, [isRegistered, wantsReminders, todayEntries, scheduleNotification, reminderConfig.reminderMinutesBefore]);

  // Schedule reminders for the next 7 days based on medication schedules
  const scheduleUpcomingReminders = useCallback(async () => {
    if (!isRegistered || !wantsReminders) return;

    const now = new Date();
    const activeMedications = medications.filter(m => m.is_active);

    for (const medication of activeMedications) {
      const timesOfDay = medication.times_of_day as string[] | null;
      if (!timesOfDay || timesOfDay.length === 0) continue;

      // Schedule for next 7 days
      for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
        const targetDate = addDays(now, dayOffset);
        
        for (const timeStr of timesOfDay) {
          const [hours, minutes] = timeStr.split(':').map(Number);
          let scheduledTime = setMinutes(setHours(targetDate, hours), minutes);
          
          // Skip if time has passed
          if (scheduledTime <= now) continue;

          const reminderTime = new Date(scheduledTime.getTime() - reminderConfig.reminderMinutesBefore * 60 * 1000);
          
          if (reminderTime > now) {
            const uniqueId = `${medication.id}-${format(scheduledTime, 'yyyy-MM-dd-HH-mm')}`;
            
            // Skip if already scheduled
            if (scheduledIds.current.has(uniqueId)) continue;

            await scheduleNotification(
              `⏰ Time to take ${medication.name}`,
              `${medication.dosage} - ${format(scheduledTime, 'h:mm a')}`,
              reminderTime,
              `med-reminder-${uniqueId}`,
              {
                url: '/schedule',
                medicationId: medication.id,
                type: 'medication_reminder',
              }
            );

            scheduledIds.current.add(uniqueId);
          }
        }
      }
    }
  }, [isRegistered, wantsReminders, medications, scheduleNotification, reminderConfig.reminderMinutesBefore]);

  // Send an immediate test notification
  const sendTestReminder = useCallback(async (medicationName: string = 'Test Medication') => {
    if (!isRegistered || !wantsReminders) {
      console.warn('Cannot send test: notifications not enabled');
      return false;
    }

    return await showNotification(`⏰ Time to take ${medicationName}`, {
      body: 'This is a test reminder notification',
      tag: 'test-reminder',
      requireInteraction: true,
      data: { type: 'test', url: '/schedule' },
    });
  }, [isRegistered, wantsReminders, showNotification]);

  // Auto-schedule reminders when component mounts or medications change
  useEffect(() => {
    if (wantsReminders && isRegistered) {
      scheduleRemindersForToday();
    }
  }, [wantsReminders, isRegistered, scheduleRemindersForToday]);

  // Clear scheduled IDs at midnight
  useEffect(() => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    const timeout = setTimeout(() => {
      scheduledIds.current.clear();
      scheduleRemindersForToday();
    }, msUntilMidnight);

    return () => clearTimeout(timeout);
  }, [scheduleRemindersForToday]);

  return {
    scheduleRemindersForToday,
    scheduleUpcomingReminders,
    sendTestReminder,
    isEnabled: wantsReminders && isRegistered,
    scheduledCount: scheduledIds.current.size,
  };
}
