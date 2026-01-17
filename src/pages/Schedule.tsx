import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Clock, Check, Calendar, ChevronLeft, ChevronRight, Bell, Loader2, X, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/Header';
import { useScheduleEntries } from '@/hooks/useScheduleEntries';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { MEDICATION_TYPE_COLORS, MedicationType } from '@/types/health';
import { useState } from 'react';
import { format, addDays, subDays } from 'date-fns';
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
  
  const { isSupported, isGranted, requestPermission } = usePushNotifications();
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [skipEntryId, setSkipEntryId] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState('');

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

  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

  const handleEnableReminders = async () => {
    if (!isSupported) {
      toast.error('Push notifications are not supported in this browser');
      return;
    }
    await requestPermission();
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      
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
                                className={`p-4 rounded-xl border transition-all ${
                                  entry.status === 'taken'
                                    ? 'bg-emerald-light border-primary/20'
                                    : entry.status === 'skipped'
                                    ? 'bg-muted/50 border-border opacity-60'
                                    : 'bg-card border-border hover:border-primary/50'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                                      entry.status === 'taken'
                                        ? 'bg-primary text-primary-foreground'
                                        : entry.status === 'skipped'
                                        ? 'bg-muted text-muted-foreground'
                                        : 'bg-muted'
                                    }`}>
                                      {entry.status === 'taken' ? (
                                        <Check className="h-5 w-5" />
                                      ) : entry.status === 'skipped' ? (
                                        <X className="h-5 w-5" />
                                      ) : (
                                        <Clock className="h-5 w-5 text-muted-foreground" />
                                      )}
                                    </div>
                                    <div>
                                      <p className="font-medium">{entry.medication?.name || 'Unknown Medication'}</p>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        {entry.medication && (
                                          <>
                                            <Badge 
                                              variant="secondary" 
                                              className={`text-xs ${MEDICATION_TYPE_COLORS[entry.medication.type as MedicationType] || ''}`}
                                            >
                                              {entry.medication.type}
                                            </Badge>
                                            <span className="text-sm text-muted-foreground">
                                              {entry.medication.dosage}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {entry.status === 'taken' ? (
                                      <span className="text-sm text-primary font-medium">
                                        ✓ Taken
                                      </span>
                                    ) : entry.status === 'skipped' ? (
                                      <div className="text-right">
                                        <span className="text-sm text-muted-foreground">Skipped</span>
                                        {entry.skipped_reason && (
                                          <p className="text-xs text-muted-foreground">{entry.skipped_reason}</p>
                                        )}
                                      </div>
                                    ) : (
                                      <>
                                        <Button 
                                          size="sm" 
                                          variant="ghost" 
                                          className="text-muted-foreground"
                                          onClick={() => handleOpenSkipDialog(entry.id)}
                                          disabled={markAsSkipped.isPending}
                                        >
                                          Skip
                                        </Button>
                                        <Button 
                                          size="sm" 
                                          className="gradient-primary border-0"
                                          onClick={() => handleMarkTaken(entry.id)}
                                          disabled={markAsTaken.isPending}
                                        >
                                          {markAsTaken.isPending ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : (
                                            'Mark Taken'
                                          )}
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                                {entry.notes && (
                                  <div className="mt-2 pl-13 flex items-center gap-2 text-sm text-muted-foreground">
                                    <MessageSquare className="h-3 w-3" />
                                    {entry.notes}
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