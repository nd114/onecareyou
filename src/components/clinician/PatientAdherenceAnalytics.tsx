import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Download, 
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  BarChart3,
  PieChart
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line
} from 'recharts';
import { format, eachDayOfInterval, subDays, startOfDay, getHours } from 'date-fns';
import { toast } from 'sonner';

interface ScheduleEntry {
  id: string;
  medication_id: string;
  scheduled_time: string;
  status: string;
  taken_at?: string;
  medication?: {
    id: string;
    name: string;
    dosage: string;
  };
}

interface PatientAdherenceAnalyticsProps {
  scheduleEntries: ScheduleEntry[];
  medications: Array<{ id: string; name: string; dosage: string }>;
  patientName: string;
  patientId: string;
  isLoading?: boolean;
}

export const PatientAdherenceAnalytics = ({
  scheduleEntries,
  medications,
  patientName,
  patientId,
  isLoading = false
}: PatientAdherenceAnalyticsProps) => {
  // Calculate overall stats
  const overallStats = useMemo(() => {
    const total = scheduleEntries.length;
    const taken = scheduleEntries.filter(e => e.status === 'taken').length;
    const skipped = scheduleEntries.filter(e => e.status === 'skipped').length;
    const pending = scheduleEntries.filter(e => e.status === 'pending').length;
    
    // Consider past pending as missed
    const now = new Date();
    const missed = scheduleEntries.filter(e => 
      e.status === 'pending' && new Date(e.scheduled_time) < now
    ).length;

    const adherenceRate = total > 0 ? Math.round((taken / (total - pending + missed)) * 100) : 0;

    return { total, taken, skipped, missed, pending, adherenceRate };
  }, [scheduleEntries]);

  // Calculate per-medication adherence
  const medicationStats = useMemo(() => {
    return medications.map(med => {
      const medEntries = scheduleEntries.filter(e => e.medication_id === med.id);
      const total = medEntries.length;
      const taken = medEntries.filter(e => e.status === 'taken').length;
      const skipped = medEntries.filter(e => e.status === 'skipped').length;
      const now = new Date();
      const missed = medEntries.filter(e => 
        e.status === 'pending' && new Date(e.scheduled_time) < now
      ).length;

      const adherenceRate = total > 0 ? Math.round((taken / total) * 100) : 0;

      return {
        ...med,
        total,
        taken,
        skipped,
        missed,
        adherenceRate
      };
    }).filter(m => m.total > 0).sort((a, b) => b.total - a.total);
  }, [medications, scheduleEntries]);

  // Daily adherence trend (last 30 days)
  const dailyTrend = useMemo(() => {
    const endDate = new Date();
    const startDate = subDays(endDate, 29);
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    return days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayEntries = scheduleEntries.filter(e => 
        format(new Date(e.scheduled_time), 'yyyy-MM-dd') === dateStr
      );
      
      const total = dayEntries.length;
      const taken = dayEntries.filter(e => e.status === 'taken').length;
      const adherenceRate = total > 0 ? Math.round((taken / total) * 100) : null;

      return {
        date: format(day, 'MMM d'),
        fullDate: dateStr,
        adherence: adherenceRate,
        taken,
        total
      };
    });
  }, [scheduleEntries]);

  // Time-of-day analysis
  const timeOfDayStats = useMemo(() => {
    const timeSlots = [
      { label: 'Morning (6-12)', start: 6, end: 12 },
      { label: 'Afternoon (12-18)', start: 12, end: 18 },
      { label: 'Evening (18-22)', start: 18, end: 22 },
      { label: 'Night (22-6)', start: 22, end: 6 }
    ];

    return timeSlots.map(slot => {
      const slotEntries = scheduleEntries.filter(e => {
        const hour = getHours(new Date(e.scheduled_time));
        if (slot.start < slot.end) {
          return hour >= slot.start && hour < slot.end;
        }
        // Handle overnight slot
        return hour >= slot.start || hour < slot.end;
      });

      const total = slotEntries.length;
      const taken = slotEntries.filter(e => e.status === 'taken').length;
      const adherenceRate = total > 0 ? Math.round((taken / total) * 100) : 0;

      return {
        name: slot.label,
        adherence: adherenceRate,
        taken,
        total
      };
    });
  }, [scheduleEntries]);

  // Pie chart data
  const pieData = [
    { name: 'Taken', value: overallStats.taken, color: 'hsl(var(--status-success))' },
    { name: 'Skipped', value: overallStats.skipped, color: 'hsl(var(--status-warning))' },
    { name: 'Missed', value: overallStats.missed, color: 'hsl(var(--destructive))' },
  ].filter(d => d.value > 0);

  // Generate FHIR export
  const handleExportFHIR = () => {
    const fhirBundle = {
      resourceType: 'Bundle',
      type: 'collection',
      timestamp: new Date().toISOString(),
      entry: [
        {
          resource: {
            resourceType: 'Observation',
            id: `adherence-${patientId}-${Date.now()}`,
            status: 'final',
            category: [{
              coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'social-history',
                display: 'Social History'
              }]
            }],
            code: {
              coding: [{
                system: 'http://loinc.org',
                code: '71942-6',
                display: 'Medication adherence'
              }]
            },
            valueQuantity: {
              value: overallStats.adherenceRate,
              unit: '%',
              system: 'http://unitsofmeasure.org',
              code: '%'
            },
            effectivePeriod: {
              start: subDays(new Date(), 30).toISOString(),
              end: new Date().toISOString()
            },
            component: medicationStats.map(med => ({
              code: {
                text: med.name
              },
              valueQuantity: {
                value: med.adherenceRate,
                unit: '%'
              }
            }))
          }
        }
      ]
    };

    const blob = new Blob([JSON.stringify(fhirBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adherence-${patientName.replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}.fhir.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Adherence data exported as FHIR bundle');
  };

  const getAdherenceColor = (rate: number) => {
    if (rate >= 80) return 'text-status-success';
    if (rate >= 60) return 'text-amber-500';
    return 'text-destructive';
  };

  const getAdherenceBg = (rate: number) => {
    if (rate >= 80) return 'bg-status-success';
    if (rate >= 60) return 'bg-amber-500';
    return 'bg-destructive';
  };

  if (scheduleEntries.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">No adherence data available yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Data will appear once the patient logs medication doses
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Export */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Adherence Analytics</h3>
          <p className="text-sm text-muted-foreground">30-day medication compliance analysis</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportFHIR} className="gap-2">
          <Download className="h-4 w-4" />
          Export FHIR
        </Button>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-3xl font-bold ${getAdherenceColor(overallStats.adherenceRate)}`}>
                  {overallStats.adherenceRate}%
                </p>
                <p className="text-xs text-muted-foreground">Overall Adherence</p>
              </div>
              {overallStats.adherenceRate >= 80 ? (
                <CheckCircle className="h-8 w-8 text-status-success opacity-50" />
              ) : overallStats.adherenceRate >= 60 ? (
                <AlertTriangle className="h-8 w-8 text-amber-500 opacity-50" />
              ) : (
                <XCircle className="h-8 w-8 text-destructive opacity-50" />
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-status-success">{overallStats.taken}</p>
                <p className="text-xs text-muted-foreground">Doses Taken</p>
              </div>
              <CheckCircle className="h-8 w-8 text-status-success opacity-30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-amber-500">{overallStats.skipped}</p>
                <p className="text-xs text-muted-foreground">Doses Skipped</p>
              </div>
              <Minus className="h-8 w-8 text-amber-500 opacity-30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-destructive">{overallStats.missed}</p>
                <p className="text-xs text-muted-foreground">Doses Missed</p>
              </div>
              <XCircle className="h-8 w-8 text-destructive opacity-30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* 30-Day Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">30-Day Adherence Trend</CardTitle>
            <CardDescription>Daily compliance percentage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                    className="text-muted-foreground"
                  />
                  <YAxis 
                    domain={[0, 100]} 
                    tick={{ fontSize: 10 }}
                    className="text-muted-foreground"
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: any) => [`${value}%`, 'Adherence']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="adherence" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Dose Distribution Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Dose Distribution</CardTitle>
            <CardDescription>Breakdown of all scheduled doses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPie>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RechartsPie>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Time of Day Analysis */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Time-of-Day Patterns
          </CardTitle>
          <CardDescription>Adherence by time slot - identify problematic periods</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeOfDayStats} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                  formatter={(value: any, name: any) => [`${value}%`, 'Adherence']}
                />
                <Bar 
                  dataKey="adherence" 
                  fill="hsl(var(--primary))"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Per-Medication Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Per-Medication Compliance</CardTitle>
          <CardDescription>Individual medication adherence rates</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {medicationStats.map((med, index) => (
              <motion.div
                key={med.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{med.name}</span>
                    <span className="text-muted-foreground text-sm ml-2">{med.dosage}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {med.taken}/{med.total} doses
                    </span>
                    <Badge 
                      variant={med.adherenceRate >= 80 ? 'default' : med.adherenceRate >= 60 ? 'secondary' : 'destructive'}
                      className="min-w-[50px] justify-center"
                    >
                      {med.adherenceRate}%
                    </Badge>
                  </div>
                </div>
                <Progress value={med.adherenceRate} className="h-2" />
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Clinical Insights */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Clinical Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {overallStats.adherenceRate < 80 && (
              <li className="flex items-start gap-2">
                <span className="text-amber-500">•</span>
                <span>Overall adherence ({overallStats.adherenceRate}%) is below the 80% clinical threshold. Consider discussing barriers with patient.</span>
              </li>
            )}
            {timeOfDayStats.some(t => t.adherence < 70 && t.total > 0) && (
              <li className="flex items-start gap-2">
                <span className="text-amber-500">•</span>
                <span>
                  {timeOfDayStats.find(t => t.adherence < 70 && t.total > 0)?.name} shows lower adherence. 
                  Consider adjusting dosing schedule if clinically appropriate.
                </span>
              </li>
            )}
            {medicationStats.some(m => m.adherenceRate < 60) && (
              <li className="flex items-start gap-2">
                <span className="text-amber-500">•</span>
                <span>
                  {medicationStats.filter(m => m.adherenceRate < 60).map(m => m.name).join(', ')} 
                  {medicationStats.filter(m => m.adherenceRate < 60).length === 1 ? ' has' : ' have'} particularly low adherence. 
                  May indicate side effects or patient concerns.
                </span>
              </li>
            )}
            {overallStats.adherenceRate >= 80 && (
              <li className="flex items-start gap-2">
                <span className="text-status-success">•</span>
                <span>Patient maintains good overall adherence. Continue current support approach.</span>
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};
