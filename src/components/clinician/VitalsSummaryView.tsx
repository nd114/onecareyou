import { useMemo, useState } from 'react';
import { format, subDays, isAfter, isSameMinute, parseISO } from 'date-fns';
import { 
  Heart, 
  Activity, 
  Droplets, 
  Scale, 
  Thermometer,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Clock,
  Filter,
  StickyNote
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Vital {
  id: string;
  type: string;
  value: number;
  secondary_value?: number;
  unit: string;
  recorded_at: string;
  notes?: string;
}

interface VitalsSummaryViewProps {
  vitals: Vital[];
}

// Normal ranges for vitals (for visual indicators)
const VITAL_RANGES = {
  blood_pressure: { systolic: { low: 90, high: 140 }, diastolic: { low: 60, high: 90 } },
  heart_rate: { low: 60, high: 100 },
  blood_glucose: { low: 70, high: 140 }, // fasting
  weight: { low: 0, high: 999 }, // no normal range
  temperature: { low: 36.1, high: 37.2 },
  oxygen_saturation: { low: 95, high: 100 },
};

const VITAL_CONFIG = {
  blood_pressure: { label: 'Blood Pressure', icon: Heart, color: 'text-red-500', bgColor: 'bg-red-500/10' },
  heart_rate: { label: 'Heart Rate', icon: Activity, color: 'text-pink-500', bgColor: 'bg-pink-500/10' },
  blood_glucose: { label: 'Blood Glucose', icon: Droplets, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  weight: { label: 'Weight', icon: Scale, color: 'text-green-500', bgColor: 'bg-green-500/10' },
  temperature: { label: 'Temperature', icon: Thermometer, color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
  oxygen_saturation: { label: 'Oxygen Saturation', icon: Activity, color: 'text-cyan-500', bgColor: 'bg-cyan-500/10' },
};

export function VitalsSummaryView({ vitals }: VitalsSummaryViewProps) {
  const [timelineFilter, setTimelineFilter] = useState<string>('all');
  const [timelinePeriod, setTimelinePeriod] = useState<string>('7');

  // Group vitals by type and calculate stats
  const vitalStats = useMemo(() => {
    const grouped: Record<string, Vital[]> = {};
    
    vitals.forEach(vital => {
      if (!grouped[vital.type]) grouped[vital.type] = [];
      grouped[vital.type].push(vital);
    });

    const sevenDaysAgo = subDays(new Date(), 7);

    return Object.entries(grouped).map(([type, readings]) => {
      const sorted = [...readings].sort((a, b) => 
        new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
      );
      
      const latest = sorted[0];
      const previous = sorted[1];
      const recentReadings = sorted.filter(r => isAfter(new Date(r.recorded_at), sevenDaysAgo));
      
      // Calculate average
      const avg = recentReadings.length > 0 
        ? recentReadings.reduce((sum, r) => sum + r.value, 0) / recentReadings.length
        : latest.value;
      
      // Calculate trend
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (previous) {
        const diff = latest.value - previous.value;
        const threshold = latest.value * 0.05; // 5% change threshold
        if (diff > threshold) trend = 'up';
        else if (diff < -threshold) trend = 'down';
      }

      // Check if out of range
      const range = VITAL_RANGES[type as keyof typeof VITAL_RANGES];
      let isAbnormal = false;
      if (range) {
        if (type === 'blood_pressure') {
          const bpRange = range as { systolic: { low: number; high: number }; diastolic: { low: number; high: number } };
          isAbnormal = latest.value > bpRange.systolic.high || latest.value < bpRange.systolic.low ||
            (latest.secondary_value !== undefined && (latest.secondary_value > bpRange.diastolic.high || latest.secondary_value < bpRange.diastolic.low));
        } else {
          const numRange = range as { low: number; high: number };
          isAbnormal = latest.value > numRange.high || latest.value < numRange.low;
        }
      }

      // Get readings with notes (for clinician attention)
      const withNotes = sorted.filter(r => r.notes && r.notes.trim().length > 0).slice(0, 3);

      return {
        type,
        latest,
        previous,
        avg: Math.round(avg * 10) / 10,
        trend,
        isAbnormal,
        totalReadings: readings.length,
        recentCount: recentReadings.length,
        withNotes,
        allReadings: sorted.slice(0, 10), // Last 10 for detail view
      };
    }).sort((a, b) => {
      // Sort abnormal readings first
      if (a.isAbnormal && !b.isAbnormal) return -1;
      if (!a.isAbnormal && b.isAbnormal) return 1;
      return new Date(b.latest.recorded_at).getTime() - new Date(a.latest.recorded_at).getTime();
    });
  }, [vitals]);

  // Filter and group timeline vitals
  const timelineGroups = useMemo(() => {
    const periodDays = parseInt(timelinePeriod);
    const cutoffDate = subDays(new Date(), periodDays);
    
    let filtered = vitals.filter(v => 
      isAfter(new Date(v.recorded_at), cutoffDate)
    );

    if (timelineFilter !== 'all') {
      filtered = filtered.filter(v => v.type === timelineFilter);
    }

    // Sort by recorded_at descending
    filtered.sort((a, b) => 
      new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
    );

    // Group vitals recorded at the same time (within 1 minute)
    const groups: { timestamp: string; vitals: Vital[] }[] = [];
    
    filtered.forEach(vital => {
      const vitalTime = parseISO(vital.recorded_at);
      const existingGroup = groups.find(g => 
        isSameMinute(parseISO(g.timestamp), vitalTime)
      );

      if (existingGroup) {
        existingGroup.vitals.push(vital);
      } else {
        groups.push({ timestamp: vital.recorded_at, vitals: [vital] });
      }
    });

    return groups;
  }, [vitals, timelineFilter, timelinePeriod]);

  // Consolidated notes - group by timestamp to avoid repetition
  const consolidatedNotes = useMemo(() => {
    const notesMap = new Map<string, { timestamp: string; notes: string; vitals: Vital[] }>();
    
    vitals.forEach(vital => {
      if (vital.notes && vital.notes.trim().length > 0) {
        const vitalTime = parseISO(vital.recorded_at);
        // Use minute-precision timestamp as key
        const minuteKey = format(vitalTime, 'yyyy-MM-dd HH:mm');
        
        const existing = notesMap.get(minuteKey);
        if (existing) {
          existing.vitals.push(vital);
          // Keep the first note (they should be the same for same-time entries)
        } else {
          notesMap.set(minuteKey, {
            timestamp: vital.recorded_at,
            notes: vital.notes,
            vitals: [vital]
          });
        }
      }
    });

    return Array.from(notesMap.values()).sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [vitals]);

  const formatValue = (vital: Vital) => {
    if (vital.type === 'blood_pressure' && vital.secondary_value) {
      return `${vital.value}/${vital.secondary_value}`;
    }
    return vital.value.toString();
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-4 w-4" />;
      case 'down': return <TrendingDown className="h-4 w-4" />;
      default: return <Minus className="h-4 w-4" />;
    }
  };

  const getVitalConfig = (type: string) => {
    return VITAL_CONFIG[type as keyof typeof VITAL_CONFIG] || {
      label: type.replace('_', ' '),
      icon: Activity,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    };
  };

  const vitalTypes = useMemo(() => {
    const types = new Set(vitals.map(v => v.type));
    return Array.from(types);
  }, [vitals]);

  if (vitals.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No vitals recorded</p>
        </CardContent>
      </Card>
    );
  }

  const abnormalCount = vitalStats.filter(s => s.isAbnormal).length;

  return (
    <div className="space-y-4">
      {/* Quick Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className={abnormalCount > 0 ? 'border-amber-500/50 bg-amber-500/5' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              {abnormalCount > 0 ? (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              ) : (
                <Activity className="h-5 w-5 text-green-500" />
              )}
              <div>
                <p className="text-2xl font-bold">{abnormalCount}</p>
                <p className="text-xs text-muted-foreground">Abnormal</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{vitals.length}</p>
                <p className="text-xs text-muted-foreground">Total Readings</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{vitalStats.length}</p>
                <p className="text-xs text-muted-foreground">Vital Types</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium truncate">
                  {format(new Date(vitals[0]?.recorded_at || new Date()), 'MMM d')}
                </p>
                <p className="text-xs text-muted-foreground">Last Reading</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Vitals by Type */}
      <Tabs defaultValue="summary" className="space-y-4">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="notes">Notes ({consolidatedNotes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vitalStats.map((stat) => {
              const config = getVitalConfig(stat.type);
              const Icon = config.icon;

              return (
                <Card 
                  key={stat.type}
                  className={stat.isAbnormal ? 'border-amber-500/50 bg-amber-500/5' : ''}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`h-8 w-8 rounded-lg ${config.bgColor} flex items-center justify-center`}>
                          <Icon className={`h-4 w-4 ${config.color}`} />
                        </div>
                        <CardTitle className="text-sm font-medium capitalize">
                          {config.label}
                        </CardTitle>
                      </div>
                      {stat.isAbnormal && (
                        <Badge variant="outline" className="border-amber-500 text-amber-600 text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Check
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-2xl font-bold">
                          {formatValue(stat.latest)}
                          <span className="text-sm font-normal text-muted-foreground ml-1">
                            {stat.latest.unit}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(stat.latest.recorded_at), 'MMM d, h:mm a')}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className={`flex items-center gap-1 text-xs ${
                          stat.trend === 'up' ? 'text-amber-500' : 
                          stat.trend === 'down' ? 'text-blue-500' : 
                          'text-muted-foreground'
                        }`}>
                          {getTrendIcon(stat.trend)}
                          <span className="capitalize">{stat.trend}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {stat.recentCount} in 7d
                        </p>
                      </div>
                    </div>
                    {stat.previous && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Previous: {formatValue(stat.previous)} {stat.previous.unit}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <CardTitle className="text-base">Vital Readings Timeline</CardTitle>
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select value={timelineFilter} onValueChange={setTimelineFilter}>
                    <SelectTrigger className="w-[140px] h-8">
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      {vitalTypes.map(type => (
                        <SelectItem key={type} value={type}>
                          {getVitalConfig(type).label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={timelinePeriod} onValueChange={setTimelinePeriod}>
                    <SelectTrigger className="w-[100px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {timelineGroups.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No readings in this period</p>
                  </div>
                ) : (
                  timelineGroups.map((group, idx) => (
                    <div 
                      key={`${group.timestamp}-${idx}`}
                      className="p-3 rounded-lg border bg-card"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          {format(new Date(group.timestamp), 'MMM d, yyyy • h:mm a')}
                        </p>
                        {group.vitals.length > 1 && (
                          <Badge variant="secondary" className="text-xs">
                            {group.vitals.length} readings
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-2">
                        {group.vitals.map(vital => {
                          const config = getVitalConfig(vital.type);
                          const Icon = config.icon;

                          return (
                            <div 
                              key={vital.id}
                              className="flex items-center gap-3"
                            >
                              <div className={`h-7 w-7 rounded-lg ${config.bgColor} flex items-center justify-center flex-shrink-0`}>
                                <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                              </div>
                              <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                <p className="text-sm capitalize truncate">
                                  {config.label}
                                </p>
                                <p className="font-semibold text-sm whitespace-nowrap">
                                  {formatValue(vital)} {vital.unit}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {group.vitals.some(v => v.notes) && (
                        <div className="mt-2 pt-2 border-t flex items-start gap-2">
                          <StickyNote className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-muted-foreground">
                            {group.vitals.find(v => v.notes)?.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Patient Notes on Vitals</CardTitle>
            </CardHeader>
            <CardContent>
              {consolidatedNotes.length > 0 ? (
                <div className="space-y-3">
                  {consolidatedNotes.map((entry, idx) => (
                    <div 
                      key={`${entry.timestamp}-${idx}`}
                      className="p-3 rounded-lg border bg-muted/30"
                    >
                      <div className="flex items-start gap-3">
                        <StickyNote className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex flex-wrap gap-1">
                              {entry.vitals.map(vital => {
                                const config = getVitalConfig(vital.type);
                                return (
                                  <Badge key={vital.id} variant="secondary" className="text-xs">
                                    {config.label}: {formatValue(vital)} {vital.unit}
                                  </Badge>
                                );
                              })}
                            </div>
                            <p className="text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(entry.timestamp), 'MMM d')}
                            </p>
                          </div>
                          <p className="text-sm text-foreground">
                            "{entry.notes}"
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No notes from patient on vitals
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}