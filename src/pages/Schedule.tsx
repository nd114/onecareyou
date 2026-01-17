import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Clock, Check, Calendar, ChevronLeft, ChevronRight, Bell } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/Header';
import { mockMedications, mockScheduleEntries } from '@/lib/mock-data';
import { MEDICATION_TYPE_COLORS } from '@/types/health';
import { useState } from 'react';
import { toast } from 'sonner';

const Schedule = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [scheduleEntries, setScheduleEntries] = useState(mockScheduleEntries);

  const todaySchedule = scheduleEntries.map(entry => ({
    ...entry,
    medication: mockMedications.find(m => m.id === entry.medicationId)
  }));

  // Group by time
  const groupedSchedule = todaySchedule.reduce((acc, entry) => {
    const time = entry.scheduledTime;
    if (!acc[time]) acc[time] = [];
    acc[time].push(entry);
    return acc;
  }, {} as Record<string, typeof todaySchedule>);

  const sortedTimes = Object.keys(groupedSchedule).sort();

  const toggleTaken = (entryId: string) => {
    setScheduleEntries(prev => prev.map(entry => {
      if (entry.id === entryId) {
        const newStatus = entry.status === 'taken' ? 'pending' : 'taken';
        toast.success(newStatus === 'taken' ? 'Marked as taken!' : 'Unmarked');
        return {
          ...entry,
          status: newStatus,
          takenAt: newStatus === 'taken' ? new Date().toISOString() : undefined,
        };
      }
      return entry;
    }));
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    setSelectedDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
      return newDate;
    });
  };

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  const completedCount = scheduleEntries.filter(e => e.status === 'taken').length;
  const totalCount = scheduleEntries.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

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
                      {selectedDate.toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </span>
                    {isToday && (
                      <Badge variant="secondary" className="bg-primary/10 text-primary">
                        Today
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {completedCount}/{totalCount} doses completed • {progressPercent}% adherence
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
                  animate={{ width: `${progressPercent}%` }}
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
              <div className="space-y-6">
                {sortedTimes.map((time, timeIndex) => {
                  const entries = groupedSchedule[time];
                  const allTaken = entries.every(e => e.status === 'taken');
                  
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
                          {entries.map((entry) => (
                            <div
                              key={entry.id}
                              onClick={() => toggleTaken(entry.id)}
                              className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md ${
                                entry.status === 'taken'
                                  ? 'bg-emerald-light border-primary/20'
                                  : 'bg-card border-border hover:border-primary/50'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                                    entry.status === 'taken'
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-muted'
                                  }`}>
                                    {entry.status === 'taken' ? (
                                      <Check className="h-5 w-5" />
                                    ) : (
                                      <Clock className="h-5 w-5 text-muted-foreground" />
                                    )}
                                  </div>
                                  <div>
                                    <p className="font-medium">{entry.medication?.name}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <Badge 
                                        variant="secondary" 
                                        className={`text-xs ${MEDICATION_TYPE_COLORS[entry.medication?.type || 'prescription']}`}
                                      >
                                        {entry.medication?.type}
                                      </Badge>
                                      <span className="text-sm text-muted-foreground">
                                        {entry.medication?.dosage}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  {entry.status === 'taken' ? (
                                    <span className="text-sm text-primary font-medium">
                                      ✓ Taken
                                    </span>
                                  ) : (
                                    <Button size="sm" variant="ghost" className="text-primary">
                                      Mark Taken
                                    </Button>
                                  )}
                                </div>
                              </div>
                              {entry.medication?.notes && (
                                <p className="text-sm text-muted-foreground mt-2 pl-13">
                                  💊 {entry.medication.notes}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Reminder CTA */}
              <div className="mt-8 p-4 rounded-xl bg-muted/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Get notified when it's time to take your medications
                  </span>
                </div>
                <Button variant="outline" size="sm">
                  Enable Reminders
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
};

export default Schedule;
