import { useMemo } from 'react';
import { format, subDays, differenceInDays } from 'date-fns';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Calendar,
  Pill,
  AlertCircle,
  Clock,
  BarChart3
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface Vital {
  id: string;
  type: string;
  value: number;
  secondary_value?: number;
  unit: string;
  recorded_at: string;
}

interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
}

interface PatientInsightsCardProps {
  vitals: Vital[];
  medications?: Medication[];
  adherenceRate?: number;
  patientName: string;
  sharedSince?: string;
}

export function PatientInsightsCard({ 
  vitals, 
  medications = [], 
  adherenceRate,
  patientName,
  sharedSince 
}: PatientInsightsCardProps) {
  const insights = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = subDays(now, 7);
    const thirtyDaysAgo = subDays(now, 30);
    
    // Recent vitals (7 days)
    const recentVitals = vitals.filter(v => new Date(v.recorded_at) >= sevenDaysAgo);
    const monthlyVitals = vitals.filter(v => new Date(v.recorded_at) >= thirtyDaysAgo);
    
    // Calculate reading frequency
    const uniqueDays = new Set(
      recentVitals.map(v => format(new Date(v.recorded_at), 'yyyy-MM-dd'))
    ).size;
    
    // Group by type for trend analysis
    const byType: Record<string, Vital[]> = {};
    vitals.forEach(v => {
      if (!byType[v.type]) byType[v.type] = [];
      byType[v.type].push(v);
    });
    
    // Find concerning trends
    const trends: { type: string; direction: 'up' | 'down'; change: number }[] = [];
    
    Object.entries(byType).forEach(([type, readings]) => {
      if (readings.length < 2) return;
      
      const sorted = [...readings].sort(
        (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
      );
      
      const recent = sorted.slice(-5);
      if (recent.length < 2) return;
      
      const avgOld = recent.slice(0, Math.floor(recent.length / 2)).reduce((s, v) => s + v.value, 0) / Math.floor(recent.length / 2);
      const avgNew = recent.slice(Math.floor(recent.length / 2)).reduce((s, v) => s + v.value, 0) / (recent.length - Math.floor(recent.length / 2));
      
      const changePercent = ((avgNew - avgOld) / avgOld) * 100;
      
      if (Math.abs(changePercent) > 10) {
        trends.push({
          type,
          direction: changePercent > 0 ? 'up' : 'down',
          change: Math.abs(changePercent),
        });
      }
    });
    
    // Last reading date
    const lastReading = vitals.length > 0 
      ? new Date(Math.max(...vitals.map(v => new Date(v.recorded_at).getTime())))
      : null;
    
    const daysSinceLastReading = lastReading 
      ? differenceInDays(now, lastReading)
      : null;
    
    return {
      totalReadings: vitals.length,
      recentReadings: recentVitals.length,
      monthlyReadings: monthlyVitals.length,
      vitalTypes: Object.keys(byType).length,
      uniqueDaysRecording: uniqueDays,
      trends,
      lastReading,
      daysSinceLastReading,
      medicationCount: medications.length,
    };
  }, [vitals, medications]);

  const getEngagementLevel = () => {
    if (insights.uniqueDaysRecording >= 5) return { label: 'Highly Engaged', color: 'text-status-success' };
    if (insights.uniqueDaysRecording >= 3) return { label: 'Moderately Engaged', color: 'text-amber-500' };
    if (insights.uniqueDaysRecording >= 1) return { label: 'Low Engagement', color: 'text-orange-500' };
    return { label: 'Inactive', color: 'text-muted-foreground' };
  };

  const engagement = getEngagementLevel();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Patient Insights
          </CardTitle>
          <Badge variant="outline" className={cn('text-xs', engagement.color)}>
            {engagement.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">7-Day Activity</span>
            </div>
            <p className="text-lg font-bold">{insights.recentReadings}</p>
            <p className="text-xs text-muted-foreground">readings</p>
          </div>
          
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Active Days</span>
            </div>
            <p className="text-lg font-bold">{insights.uniqueDaysRecording}/7</p>
            <Progress 
              value={(insights.uniqueDaysRecording / 7) * 100} 
              className="h-1.5 mt-1"
            />
          </div>
          
          {adherenceRate !== undefined && (
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-1">
                <Pill className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Adherence</span>
              </div>
              <p className={cn(
                'text-lg font-bold',
                adherenceRate >= 80 ? 'text-status-success' :
                adherenceRate >= 50 ? 'text-amber-500' : 'text-severity-high'
              )}>
                {adherenceRate}%
              </p>
              <Progress 
                value={adherenceRate} 
                className={cn(
                  'h-1.5 mt-1',
                  adherenceRate >= 80 ? '[&>div]:bg-status-success' :
                  adherenceRate >= 50 ? '[&>div]:bg-amber-500' : '[&>div]:bg-severity-high'
                )}
              />
            </div>
          )}
          
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Last Reading</span>
            </div>
            {insights.lastReading ? (
              <>
                <p className="text-sm font-medium">
                  {format(insights.lastReading, 'MMM d')}
                </p>
                <p className={cn(
                  'text-xs',
                  insights.daysSinceLastReading && insights.daysSinceLastReading > 7 
                    ? 'text-amber-500' 
                    : 'text-muted-foreground'
                )}>
                  {insights.daysSinceLastReading === 0 
                    ? 'Today' 
                    : `${insights.daysSinceLastReading} day${insights.daysSinceLastReading !== 1 ? 's' : ''} ago`}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </div>
        </div>

        {/* Notable Trends */}
        {insights.trends.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Notable Trends
            </p>
            <div className="space-y-1.5">
              {insights.trends.slice(0, 3).map((trend, i) => (
                <div 
                  key={i}
                  className="flex items-center gap-2 text-sm p-2 rounded-lg bg-muted/30"
                >
                  {trend.direction === 'up' ? (
                    <TrendingUp className="h-4 w-4 text-amber-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-blue-500" />
                  )}
                  <span className="capitalize">{trend.type.replace('_', ' ')}</span>
                  <Badge variant="secondary" className="text-xs ml-auto">
                    {trend.direction === 'up' ? '+' : '-'}{trend.change.toFixed(0)}%
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary Footer */}
        <div className="pt-2 border-t text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Total: {insights.totalReadings} readings across {insights.vitalTypes} vital types</span>
            {sharedSince && (
              <span>Shared since {format(new Date(sharedSince), 'MMM d, yyyy')}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
