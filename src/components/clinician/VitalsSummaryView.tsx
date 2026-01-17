import { useMemo } from 'react';
import { format, subDays, isAfter } from 'date-fns';
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
  Clock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
          <TabsTrigger value="notes">Notes ({vitalStats.reduce((sum, s) => sum + s.withNotes.length, 0)})</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vitalStats.map((stat) => {
              const config = VITAL_CONFIG[stat.type as keyof typeof VITAL_CONFIG] || {
                label: stat.type.replace('_', ' '),
                icon: Activity,
                color: 'text-primary',
                bgColor: 'bg-primary/10',
              };
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
            <CardContent className="pt-4">
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {vitals.slice(0, 30).map((vital) => {
                  const config = VITAL_CONFIG[vital.type as keyof typeof VITAL_CONFIG] || {
                    label: vital.type.replace('_', ' '),
                    icon: Activity,
                    color: 'text-primary',
                    bgColor: 'bg-primary/10',
                  };
                  const Icon = config.icon;

                  return (
                    <div 
                      key={vital.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50"
                    >
                      <div className={`h-8 w-8 rounded-lg ${config.bgColor} flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`h-4 w-4 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm capitalize truncate">
                            {config.label}
                          </p>
                          <p className="font-semibold text-sm whitespace-nowrap">
                            {formatValue(vital)} {vital.unit}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(vital.recorded_at), 'MMM d, yyyy • h:mm a')}
                        </p>
                      </div>
                      {vital.notes && (
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          Note
                        </Badge>
                      )}
                    </div>
                  );
                })}
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
              {vitalStats.some(s => s.withNotes.length > 0) ? (
                <div className="space-y-3">
                  {vitalStats.flatMap(stat => 
                    stat.withNotes.map(vital => {
                      const config = VITAL_CONFIG[vital.type as keyof typeof VITAL_CONFIG] || {
                        label: vital.type.replace('_', ' '),
                        icon: Activity,
                        color: 'text-primary',
                        bgColor: 'bg-primary/10',
                      };
                      const Icon = config.icon;

                      return (
                        <div 
                          key={vital.id}
                          className="p-3 rounded-lg border bg-muted/30"
                        >
                          <div className="flex items-start gap-3">
                            <div className={`h-8 w-8 rounded-lg ${config.bgColor} flex items-center justify-center flex-shrink-0`}>
                              <Icon className={`h-4 w-4 ${config.color}`} />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-medium text-sm capitalize">
                                  {config.label}: {formatValue(vital)} {vital.unit}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(vital.recorded_at), 'MMM d')}
                                </p>
                              </div>
                              <p className="text-sm mt-1 text-foreground">
                                "{vital.notes}"
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
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
