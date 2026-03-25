import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Minus, BarChart3, Activity, Heart } from 'lucide-react';

interface PatientVitalSummary {
  userId: string;
  vitals: { type: string; value: number; recorded_at: string }[];
  adherenceRate?: number;
}

interface PatientEngagementWidgetsProps {
  patients: { user_id: string; patient_name: string }[];
  vitalsSummaries: PatientVitalSummary[];
}

export function PatientEngagementWidgets({ patients, vitalsSummaries }: PatientEngagementWidgetsProps) {
  const stats = useMemo(() => {
    const totalPatients = patients.length;
    if (totalPatients === 0) return null;

    // Patients with vitals in last 7 days
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let activeReporters = 0;
    let totalAdherence = 0;
    let adherenceCount = 0;
    const riskBreakdown = { stable: 0, moderate: 0, high: 0 };

    vitalsSummaries.forEach(summary => {
      const recentVitals = summary.vitals.filter(v => new Date(v.recorded_at).getTime() > sevenDaysAgo);
      if (recentVitals.length > 0) activeReporters++;

      if (summary.adherenceRate !== undefined) {
        totalAdherence += summary.adherenceRate;
        adherenceCount++;

        if (summary.adherenceRate >= 80) riskBreakdown.stable++;
        else if (summary.adherenceRate >= 50) riskBreakdown.moderate++;
        else riskBreakdown.high++;
      } else {
        riskBreakdown.stable++;
      }
    });

    const avgAdherence = adherenceCount > 0 ? Math.round(totalAdherence / adherenceCount) : null;
    const engagementRate = totalPatients > 0 ? Math.round((activeReporters / totalPatients) * 100) : 0;

    return {
      totalPatients,
      activeReporters,
      engagementRate,
      avgAdherence,
      riskBreakdown,
    };
  }, [patients, vitalsSummaries]);

  if (!stats || stats.totalPatients === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
      {/* Engagement Rate */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Patient Engagement
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold">{stats.engagementRate}%</span>
            <span className="text-xs text-muted-foreground mb-1">
              {stats.activeReporters}/{stats.totalPatients} active this week
            </span>
          </div>
          <Progress value={stats.engagementRate} className="mt-2 h-1.5" />
        </CardContent>
      </Card>

      {/* Avg Adherence */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Avg Adherence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold">
              {stats.avgAdherence !== null ? `${stats.avgAdherence}%` : '—'}
            </span>
            {stats.avgAdherence !== null && (
              <span className="mb-1">
                {stats.avgAdherence >= 80 ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : stats.avgAdherence >= 50 ? (
                  <Minus className="h-4 w-4 text-amber-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-destructive" />
                )}
              </span>
            )}
          </div>
          {stats.avgAdherence !== null && (
            <Progress value={stats.avgAdherence} className="mt-2 h-1.5" />
          )}
        </CardContent>
      </Card>

      {/* Risk Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Heart className="h-4 w-4" />
            Risk Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-green-500/10 text-green-700 dark:text-green-400 text-xs">
              {stats.riskBreakdown.stable} Stable
            </Badge>
            <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs">
              {stats.riskBreakdown.moderate} Moderate
            </Badge>
            {stats.riskBreakdown.high > 0 && (
              <Badge variant="secondary" className="bg-red-500/10 text-red-700 dark:text-red-400 text-xs">
                {stats.riskBreakdown.high} High
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
