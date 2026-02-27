import { forwardRef, memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { VitalType, VITAL_CONFIG } from '@/types/health';
import { TrendingUp, TrendingDown, Minus, LucideIcon } from 'lucide-react';
import { VitalRecord } from '@/hooks/useVitals';
import { useUnitPreferences } from '@/hooks/useUnitPreferences';

interface VitalStatsCardProps {
  type: VitalType;
  latestVital: VitalRecord | undefined;
  stats: {
    average: number;
    min: number;
    max: number;
    count: number;
    trend: number;
    inRange: number;
    outOfRange: number;
  } | null;
  icon: LucideIcon;
  colorClass: string;
}

export const VitalStatsCard = memo(forwardRef<HTMLDivElement, VitalStatsCardProps>(
  function VitalStatsCard({ type, latestVital, stats, icon: Icon, colorClass }, ref) {
    const config = VITAL_CONFIG[type];
    const { convertVitalValue, getDisplayUnit, getNormalRange } = useUnitPreferences();

    const normalRange = getNormalRange(type);
    const displayUnit = getDisplayUnit(type);

    const getStatus = (value: number): 'normal' | 'high' | 'low' => {
      const converted = convertVitalValue(type, value);
      if (converted.value < normalRange.min) return 'low';
      if (converted.value > normalRange.max) return 'high';
      return 'normal';
    };

    const status = latestVital ? getStatus(latestVital.value) : 'normal';

    const statusColors = {
      normal: 'bg-status-success/10 text-status-success border-status-success/20',
      high: 'bg-severity-high/10 text-severity-high border-severity-high/20',
      low: 'bg-ocean/10 text-ocean border-ocean/20',
    };

    const statusIcons = {
      normal: Minus,
      high: TrendingUp,
      low: TrendingDown,
    };

    const StatusIcon = statusIcons[status];

    const formatValue = () => {
      if (!latestVital) return '-';
      if (type === 'blood_pressure' && latestVital.secondary_value) {
        return `${Math.round(latestVital.value * 10) / 10}/${Math.round(latestVital.secondary_value * 10) / 10}`;
      }
      const converted = convertVitalValue(type, latestVital.value);
      return Math.round(converted.value * 10) / 10;
    };

    const formatAverage = () => {
      if (!stats) return null;
      const converted = convertVitalValue(type, stats.average);
      return Math.round(converted.value * 10) / 10;
    };

    return (
      <Card ref={ref} className="hover-lift h-full">
        <CardContent className="p-3 sm:p-4 md:p-6">
          <div className="flex items-start justify-between mb-2 sm:mb-4 gap-2">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${colorClass}`} />
            </div>
            <Badge variant="outline" className={`${statusColors[status]} text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5`}>
              <StatusIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
              {status}
            </Badge>
          </div>
          
          <p className="text-xs sm:text-sm text-muted-foreground mb-0.5 sm:mb-1 truncate">{config.label}</p>
          <p className="text-lg sm:text-xl md:text-2xl font-bold leading-tight">
            {formatValue()}
            <span className="text-[10px] sm:text-xs md:text-sm font-normal text-muted-foreground ml-0.5 sm:ml-1">
              {displayUnit}
            </span>
          </p>

          {stats && stats.count > 1 && (
            <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-border/50 space-y-0.5 sm:space-y-1">
              <div className="flex items-center justify-between text-[10px] sm:text-xs gap-1">
                <span className="text-muted-foreground whitespace-nowrap">30-day avg</span>
                <span className="font-medium truncate">{formatAverage()} {displayUnit}</span>
              </div>
              {stats.trend !== 0 && (
                <div className="flex items-center justify-between text-[10px] sm:text-xs">
                  <span className="text-muted-foreground">Trend</span>
                  <span className={stats.trend > 0 ? 'text-severity-high' : 'text-ocean'}>
                    {stats.trend > 0 ? '+' : ''}{stats.trend}%
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
));
