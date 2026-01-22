import { useMemo } from 'react';
import { AlertTriangle, CheckCircle, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Vital {
  id: string;
  type: string;
  value: number;
  secondary_value?: number;
  unit: string;
  recorded_at: string;
}

interface PatientRiskIndicatorProps {
  vitals: Vital[];
  adherenceRate?: number;
  className?: string;
  showDetails?: boolean;
}

interface RiskFactor {
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
}

// Normal ranges for vital sign assessment
const VITAL_RANGES: Record<string, { low: number; high: number; critical_low?: number; critical_high?: number }> = {
  blood_pressure: { low: 90, high: 140, critical_low: 80, critical_high: 180 },
  heart_rate: { low: 60, high: 100, critical_low: 40, critical_high: 150 },
  glucose: { low: 70, high: 140, critical_low: 54, critical_high: 250 },
  blood_glucose: { low: 70, high: 140, critical_low: 54, critical_high: 250 },
  oxygen_saturation: { low: 95, high: 100, critical_low: 90 },
  temperature: { low: 36.1, high: 37.2, critical_low: 35, critical_high: 39 },
  hba1c: { low: 4, high: 5.7, critical_high: 9 },
};

export function PatientRiskIndicator({ vitals, adherenceRate, className, showDetails = false }: PatientRiskIndicatorProps) {
  const riskAssessment = useMemo(() => {
    const factors: RiskFactor[] = [];
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Group vitals by type and get latest
    const latestByType: Record<string, Vital> = {};
    const recentByType: Record<string, Vital[]> = {};
    
    vitals.forEach(vital => {
      const vitalDate = new Date(vital.recorded_at);
      
      // Track latest
      if (!latestByType[vital.type] || vitalDate > new Date(latestByType[vital.type].recorded_at)) {
        latestByType[vital.type] = vital;
      }
      
      // Track recent (last 7 days)
      if (vitalDate >= sevenDaysAgo) {
        if (!recentByType[vital.type]) recentByType[vital.type] = [];
        recentByType[vital.type].push(vital);
      }
    });

    // Check each vital type for abnormalities
    Object.entries(latestByType).forEach(([type, vital]) => {
      const range = VITAL_RANGES[type];
      if (!range) return;

      const value = vital.value;
      
      // Critical values
      if (range.critical_low && value < range.critical_low) {
        factors.push({
          type,
          severity: 'high',
          message: `Critical low ${type.replace('_', ' ')}: ${value} ${vital.unit}`,
        });
      } else if (range.critical_high && value > range.critical_high) {
        factors.push({
          type,
          severity: 'high',
          message: `Critical high ${type.replace('_', ' ')}: ${value} ${vital.unit}`,
        });
      }
      // Out of normal range
      else if (value < range.low) {
        factors.push({
          type,
          severity: 'medium',
          message: `Low ${type.replace('_', ' ')}: ${value} ${vital.unit}`,
        });
      } else if (value > range.high) {
        factors.push({
          type,
          severity: 'medium',
          message: `High ${type.replace('_', ' ')}: ${value} ${vital.unit}`,
        });
      }
    });

    // Check for declining trends (compare recent readings)
    Object.entries(recentByType).forEach(([type, readings]) => {
      if (readings.length < 3) return;
      
      const sorted = [...readings].sort(
        (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
      );
      
      // Simple linear trend detection
      const first = sorted.slice(0, Math.floor(sorted.length / 2));
      const second = sorted.slice(Math.floor(sorted.length / 2));
      
      const avgFirst = first.reduce((sum, v) => sum + v.value, 0) / first.length;
      const avgSecond = second.reduce((sum, v) => sum + v.value, 0) / second.length;
      
      const changePercent = ((avgSecond - avgFirst) / avgFirst) * 100;
      
      // Flag significant trends
      if (Math.abs(changePercent) > 15) {
        factors.push({
          type,
          severity: 'low',
          message: `${type.replace('_', ' ')} ${changePercent > 0 ? 'increasing' : 'decreasing'} trend (${Math.abs(changePercent).toFixed(0)}%)`,
        });
      }
    });

    // Check medication adherence
    if (adherenceRate !== undefined) {
      if (adherenceRate < 50) {
        factors.push({
          type: 'adherence',
          severity: 'high',
          message: `Very low medication adherence: ${adherenceRate}%`,
        });
      } else if (adherenceRate < 80) {
        factors.push({
          type: 'adherence',
          severity: 'medium',
          message: `Low medication adherence: ${adherenceRate}%`,
        });
      }
    }

    // Check for stale data
    const latestReading = Object.values(latestByType).sort(
      (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
    )[0];
    
    if (latestReading) {
      const daysSinceLastReading = Math.floor(
        (now.getTime() - new Date(latestReading.recorded_at).getTime()) / (24 * 60 * 60 * 1000)
      );
      
      if (daysSinceLastReading > 14) {
        factors.push({
          type: 'data_freshness',
          severity: 'medium',
          message: `No readings in ${daysSinceLastReading} days`,
        });
      } else if (daysSinceLastReading > 7) {
        factors.push({
          type: 'data_freshness',
          severity: 'low',
          message: `Last reading ${daysSinceLastReading} days ago`,
        });
      }
    }

    // Calculate overall risk level
    const highCount = factors.filter(f => f.severity === 'high').length;
    const mediumCount = factors.filter(f => f.severity === 'medium').length;
    
    let overallRisk: 'low' | 'medium' | 'high' = 'low';
    if (highCount > 0) overallRisk = 'high';
    else if (mediumCount >= 2) overallRisk = 'high';
    else if (mediumCount > 0) overallRisk = 'medium';

    return {
      level: overallRisk,
      factors,
      highCount,
      mediumCount,
    };
  }, [vitals, adherenceRate]);

  const getStatusColor = (level: 'low' | 'medium' | 'high') => {
    switch (level) {
      case 'high':
        return 'bg-severity-high/10 text-severity-high border-severity-high/20';
      case 'medium':
        return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      default:
        return 'bg-status-success/10 text-status-success border-status-success/20';
    }
  };

  const getStatusIcon = (level: 'low' | 'medium' | 'high') => {
    switch (level) {
      case 'high':
        return <AlertTriangle className="h-3.5 w-3.5" />;
      case 'medium':
        return <AlertCircle className="h-3.5 w-3.5" />;
      default:
        return <CheckCircle className="h-3.5 w-3.5" />;
    }
  };

  const getStatusLabel = (level: 'low' | 'medium' | 'high') => {
    switch (level) {
      case 'high':
        return 'High Risk';
      case 'medium':
        return 'Moderate';
      default:
        return 'Stable';
    }
  };

  if (!showDetails) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Badge 
                variant="outline" 
                className={cn(
                  'gap-1 font-medium cursor-help',
                  getStatusColor(riskAssessment.level),
                  className
                )}
              >
                {getStatusIcon(riskAssessment.level)}
                {getStatusLabel(riskAssessment.level)}
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            {riskAssessment.factors.length === 0 ? (
              <p className="text-sm">All vitals within normal range</p>
            ) : (
              <div className="space-y-1">
                {riskAssessment.factors.slice(0, 3).map((factor, i) => (
                  <p key={i} className="text-sm flex items-center gap-1.5">
                    <span className={cn(
                      'h-2 w-2 rounded-full',
                      factor.severity === 'high' ? 'bg-severity-high' :
                      factor.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-500'
                    )} />
                    {factor.message}
                  </p>
                ))}
                {riskAssessment.factors.length > 3 && (
                  <p className="text-xs text-muted-foreground">
                    +{riskAssessment.factors.length - 3} more factors
                  </p>
                )}
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Detailed view
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <Badge 
          variant="outline" 
          className={cn('gap-1 font-medium', getStatusColor(riskAssessment.level))}
        >
          {getStatusIcon(riskAssessment.level)}
          {getStatusLabel(riskAssessment.level)}
        </Badge>
        {riskAssessment.factors.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {riskAssessment.factors.length} factor{riskAssessment.factors.length !== 1 ? 's' : ''} detected
          </span>
        )}
      </div>
      
      {riskAssessment.factors.length > 0 && (
        <div className="space-y-2">
          {riskAssessment.factors.map((factor, i) => (
            <div 
              key={i}
              className={cn(
                'p-2 rounded-lg border text-sm flex items-center gap-2',
                factor.severity === 'high' ? 'border-severity-high/30 bg-severity-high/5' :
                factor.severity === 'medium' ? 'border-amber-500/30 bg-amber-500/5' :
                'border-border bg-muted/30'
              )}
            >
              <span className={cn(
                'h-2 w-2 rounded-full flex-shrink-0',
                factor.severity === 'high' ? 'bg-severity-high' :
                factor.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-500'
              )} />
              <span>{factor.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
