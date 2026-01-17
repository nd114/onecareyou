import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { VitalType, VITAL_CONFIG } from '@/types/health';
import { TrendingUp, TrendingDown, Minus, LucideIcon } from 'lucide-react';
import { VitalRecord } from '@/hooks/useVitals';

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

export function VitalStatsCard({ type, latestVital, stats, icon: Icon, colorClass }: VitalStatsCardProps) {
  const config = VITAL_CONFIG[type];

  const getStatus = (value: number): 'normal' | 'high' | 'low' => {
    if (value < config.normalMin) return 'low';
    if (value > config.normalMax) return 'high';
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
    if (!latestVital) return '—';
    if (type === 'blood_pressure' && latestVital.secondary_value) {
      return `${latestVital.value}/${latestVital.secondary_value}`;
    }
    return latestVital.value;
  };

  return (
    <Card className="hover-lift">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className={`h-5 w-5 ${colorClass}`} />
          </div>
          <Badge variant="outline" className={statusColors[status]}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {status}
          </Badge>
        </div>
        
        <p className="text-sm text-muted-foreground mb-1">{config.label}</p>
        <p className="text-2xl font-bold">
          {formatValue()}
          <span className="text-sm font-normal text-muted-foreground ml-1">
            {config.unit}
          </span>
        </p>

        {stats && stats.count > 1 && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">30-day avg</span>
              <span className="font-medium">{stats.average} {config.unit}</span>
            </div>
            {stats.trend !== 0 && (
              <div className="flex items-center justify-between text-xs mt-1">
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
