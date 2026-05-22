import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Clock, Check, Calendar, ChevronLeft, ChevronRight, Bell, Loader2, X, MessageSquare, BellRing, TestTube } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/Header';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { useScheduleEntries } from '@/hooks/useScheduleEntries';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useMedicationReminders } from '@/hooks/useMedicationReminders';
// useServiceWorker removed: legacy SW retired; no-op shim no longer needed here.
import { MEDICATION_TYPE_COLORS, MedicationType } from '@/types/health';
import { useState, useEffect, useRef } from 'react';
import { format, addDays, subDays, isToday as checkIsToday } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const Schedule = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { 
    entries, 
    pending, 
    taken, 
    total, 
    adherenceRate, 
    isLoading, 
    markAsTaken,
    markAsSkipped 
  } = useScheduleEntries(selectedDate);
  
  const { isSupported, isGranted, requestPermission, scheduleMedicationReminder } = usePushNotifications();
  const { isEnabled: remindersEnabled, sendTestReminder, scheduledCount } = useMedicationReminders();
  
  // Service worker intentionally not registered here — see public/sw.js.
  
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [skipEntryId, setSkipEntryId] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [testingReminder, setTestingReminder] = useState(false);
  const scheduledReminders = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Schedule push notifications for pending entries when on today's date
  useEffect(() => {
    if (!isGranted || !checkIsToday(selectedDate)) return;

    // Clear old scheduled reminders
    scheduledReminders.current.forEach((timeout) => clearTimeout(timeout));
    scheduledReminders.current.clear();

    // Schedule reminders for pending entries
    pending.forEach((entry) => {
      if (entry.medication) {
        const scheduledTime = new Date(entry.scheduled_time);
        const timeoutId = scheduleMedicationReminder(
          entry.medication.name,
          scheduledTime,
          entry.medication.dosage
        );
        if (timeoutId) {
          scheduledReminders.current.set(entry.id, timeoutId);
        }
      }
    });

    // Cleanup on unmount
    return () => {
      scheduledReminders.current.forEach((timeout) => clearTimeout(timeout));
    };
  }, [pending, isGranted, selectedDate, scheduleMedicationReminder]);

  // Group by time
  const groupedSchedule = entries.reduce((acc, entry) => {
    const time = format(new Date(entry.scheduled_time), 'HH:mm');
    if (!acc[time]) acc[time] = [];
    acc[time].push(entry);
    return acc;
  }, {} as Record<string, typeof entries>);

  const sortedTimes = Object.keys(groupedSchedule).sort();

  const handleMarkTaken = async (entryId: string) => {
    await markAsTaken.mutateAsync(entryId);
  };

  const handleOpenSkipDialog = (entryId: string) => {
    setSkipEntryId(entryId);
    setSkipReason('');
    setSkipDialogOpen(true);
  };

  const handleConfirmSkip = async () => {
    if (skipEntryId) {
      await markAsSkipped.mutateAsync({ entryId: skipEntryId, reason: skipReason });
      setSkipDialogOpen(false);
      setSkipEntryId(null);
    }
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    setSelectedDate(prev => direction === 'next' ? addDays(prev, 1) : subDays(prev, 1));
  };

  const isToday = checkIsToday(selectedDate);

  const handleEnableReminders = async () => {
    await requestPermission();
  };

  const handleTestReminder = async () => {
    // If not enabled, prompt to enable first
    if (!remindersEnabled) {
      const granted = await requestPermission();
      if (!granted) return;
    }
    
    setTestingReminder(true);
    try {
      const success = await sendTestReminder('Your Medication');
      if (success) {
        toast.success('Test notification sent! Check your notifications.');
      } else {
        toast.error('Failed to send test notification. Please try again.');
      }
    } finally {
      setTestingReminder(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      <SectionTabs section=\"today\" variant=\"patient\" />
      
      <main className="container py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="font-display text-3xl font-bold mb-2">
            Daily Schedule
          </h1>
          <p className="text-muted-foreground">
            Track your medication doses throughout the day
          </p>
        </motion.div>

        {/* Date Navigator */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="icon" onClick={() => navigateDate('prev')}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Calendar className="h-5 w-5 text-primary" />
                    <span className="font-semibold text-lg">
                      {format(selectedDate, 'EEEE, MMMM d')}
                    </span>
                    {isToday && (
                      <Badge variant="secondary" className="bg-primary/10 text-primary">
                        Today
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {taken.length}/{total} doses completed • {adherenceRate}% adherence
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => navigateDate('next')}>
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>

              {/* Progress Bar */}
              <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${adherenceRate}%` }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="h-full gradient-primary rounded-full"
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Notification Reminders Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-8"
        >
          <Card className={remindersEnabled ? 'border-status-success/30 bg-status-success/5' : ''}>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                    remindersEnabled 
                      ? 'bg-status-success/20 text-status-success' 
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    <BellRing className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {remindersEnabled ? 'Reminders Active' : 'Enable Medication Reminders'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {remindersEnabled 
                        ? `${scheduledCount} reminder${scheduledCount !== 1 ? 's' : ''} scheduled for upcoming doses`
                        : 'Get notified 5 minutes before each scheduled dose'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {remindersEnabled ? (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleTestReminder}
                      disabled={testingReminder}
                    >
                      {testingReminder ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <TestTube className="h-4 w-4 mr-2" />
                      )}
                      Test Reminder
                    </Button>
                  ) : (
                    <Button 
                      onClick={handleEnableReminders}
                      className="gradient-primary border-0"
                      size="sm"
                    >
                      <Bell className="h-4 w-4 mr-2" />
                      Enable Reminders
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Schedule Timeline
              </CardTitle>
              <CardDescription>
                Click on medications to mark them as taken
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : entries.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">No doses scheduled</h3>
                  <p className="text-muted-foreground mb-6">
                    {isToday 
                      ? "You don't have any medications scheduled for today"
                      : `No medications scheduled for ${format(selectedDate, 'MMMM d')}`
                    }
                  </p>
                  <Button asChild className="gradient-primary border-0">
                    <Link to="/medications/add">Add Medication</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {sortedTimes.map((time, timeIndex) => {
                    const timeEntries = groupedSchedule[time];
                    const allTaken = timeEntries.every(e => e.status === 'taken');
                    
                    return (
                      <motion.div
                        key={time}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 + timeIndex * 0.1 }}
                        className="relative"
                      >
                        {/* Time Marker */}
                        <div className="flex items-start gap-4">
                          <div className="flex flex-col items-center">
                            <div className={`h-12 w-12 rounded-xl flex items-center justify-center font-semibold ${
                              allTaken 
                                ? 'bg-status-success text-primary-foreground' 
                                : 'bg-primary/10 text-primary'
                            }`}>
                              {time}
                            </div>
                            {timeIndex < sortedTimes.length - 1 && (
                              <div className="w-0.5 h-16 bg-border mt-2" />
                            )}
                          </div>

                          {/* Medication Cards */}
                          <div className="flex-1 space-y-3">
                            {timeEntries.map((entry) => (
                              <div
                                key={entry.id}
                                className={`p-3 sm:p-4 rounded-xl border transition-all ${
                                  entry.status === 'taken'
                                    ? 'bg-emerald-light border-primary/20'
                                    : entry.status === 'skipped'
                                    ? 'bg-muted/50 border-border opacity-60'
                                    : 'bg-card border-border hover:border-primary/50'
                                }`}
                              >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                    <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                      entry.status === 'taken'
                                        ? 'bg-primary text-primary-foreground'
                                        : entry.status === 'skipped'
                                        ? 'bg-muted text-muted-foreground'
                                        : 'bg-muted'
                                    }`}>
                                      {entry.status === 'taken' ? (
                                        <Check className="h-4 w-4 sm:h-5 sm:w-5" />
                                      ) : entry.status === 'skipped' ? (
                                        <X className="h-4 w-4 sm:h-5 sm:w-5" />
                                      ) : (
                                        <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="font-medium text-sm sm:text-base truncate">{entry.medication?.name || 'Unknown Medication'}</p>
                                      <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 flex-wrap">
                                        {entry.medication && (
                                          <>
                                            <Badge 
                                              variant="secondary" 
                                              className={`text-[10px] sm:text-xs ${MEDICATION_TYPE_COLORS[entry.medication.type as MedicationType] || ''}`}
                                            >
                                              {entry.medication.type}
                                            </Badge>
                                            <span className="text-xs sm:text-sm text-muted-foreground truncate">
                                              {entry.medication.dosage}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                                    {entry.status === 'taken' ? (
                                      <span className="text-xs sm:text-sm text-primary font-medium flex items-center gap-1">
                                        <Check className="h-3 w-3 sm:h-4 sm:w-4" />
                                        Taken
                                      </span>
                                    ) : entry.status === 'skipped' ? (
                                      <div className="text-right">
                                        <span className="text-xs sm:text-sm text-muted-foreground">Skipped</span>
                                        {entry.skipped_reason && (
                                          <p className="text-[10px] sm:text-xs text-muted-foreground max-w-[120px] truncate">{entry.skipped_reason}</p>
                                        )}
                                      </div>
                                    ) : (
                                      <>
                                        <Button 
                                          size="sm" 
                                          variant="ghost" 
                                          className="text-muted-foreground h-8 px-2 sm:px-3 text-xs sm:text-sm"
                                          onClick={() => handleOpenSkipDialog(entry.id)}
                                          disabled={markAsSkipped.isPending}
                                        >
                                          Skip
                                        </Button>
                                        <Button 
                                          size="sm" 
                                          className="gradient-primary border-0 h-8 px-2 sm:px-3 text-xs sm:text-sm"
                                          onClick={() => handleMarkTaken(entry.id)}
                                          disabled={markAsTaken.isPending}
                                        >
                                          {markAsTaken.isPending ? (
                                            <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                                          ) : (
                                            <>
                                              <Check className="h-3 w-3 sm:hidden" />
                                              <span className="hidden sm:inline">Mark Taken</span>
                                            </>
                                          )}
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                                {entry.notes && (
                                  <div className="mt-2 pl-10 sm:pl-13 flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                                    <MessageSquare className="h-3 w-3 flex-shrink-0" />
                                    <span className="truncate">{entry.notes}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {/* Reminder Status */}
              {isGranted && entries.length > 0 && isToday && (
                <div className="mt-8 p-4 rounded-xl bg-status-success/10 border border-status-success/20 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <BellRing className="h-5 w-5 text-status-success" />
                    <span className="text-sm text-status-success font-medium">
                      Reminders active for {pending.length} pending dose{pending.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <Badge variant="outline" className="bg-status-success/10 text-status-success border-status-success/30">
                    Notifications On
                  </Badge>
                </div>
              )}

              {/* Reminder CTA */}
              {!isGranted && entries.length > 0 && (
                <div className="mt-8 p-4 rounded-xl bg-muted/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Get notified when it's time to take your medications
                    </span>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleEnableReminders}>
                    Enable Reminders
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>

      {/* Skip Dialog */}
      <Dialog open={skipDialogOpen} onOpenChange={setSkipDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skip Medication</DialogTitle>
            <DialogDescription>
              Optionally provide a reason for skipping this dose.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for skipping (optional)..."
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            className="min-h-[80px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSkipDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmSkip}
              disabled={markAsSkipped.isPending}
            >
              {markAsSkipped.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Skip Dose
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Schedule;