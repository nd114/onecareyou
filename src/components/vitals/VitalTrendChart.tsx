import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VitalType, VITAL_CONFIG } from '@/types/health';
import { VitalRecord } from '@/hooks/useVitals';
import { format } from 'date-fns';

interface VitalTrendChartProps {
  type: VitalType;
  data: VitalRecord[];
  title?: string;
}

export function VitalTrendChart({ type, data, title }: VitalTrendChartProps) {
  const config = VITAL_CONFIG[type];

  const chartData = useMemo(() => {
    return data.map(v => ({
      date: format(new Date(v.recorded_at), 'MMM d'),
      value: v.value,
      secondaryValue: v.secondary_value,
      fullDate: format(new Date(v.recorded_at), 'MMM d, yyyy h:mm a'),
    }));
  }, [data]);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title || config.label}</CardTitle>
        </CardHeader>
        <CardContent className="h-[200px] flex items-center justify-center text-muted-foreground">
          No data recorded yet
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title || config.label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                className="text-xs fill-muted-foreground"
                tick={{ fontSize: 11 }}
              />
              <YAxis 
                className="text-xs fill-muted-foreground"
                tick={{ fontSize: 11 }}
                domain={['auto', 'auto']}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                labelFormatter={(_, payload) => payload[0]?.payload?.fullDate || ''}
                formatter={(value: number) => [`${value} ${config.unit}`, config.label]}
              />
              <ReferenceLine 
                y={config.normalMax} 
                stroke="hsl(var(--severity-high))" 
                strokeDasharray="5 5" 
                label={{ value: 'High', position: 'right', fontSize: 10, fill: 'hsl(var(--severity-high))' }}
              />
              <ReferenceLine 
                y={config.normalMin} 
                stroke="hsl(var(--ocean))" 
                strokeDasharray="5 5" 
                label={{ value: 'Low', position: 'right', fontSize: 10, fill: 'hsl(var(--ocean))' }}
              />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6, stroke: 'hsl(var(--background))', strokeWidth: 2 }}
              />
              {type === 'blood_pressure' && (
                <Line 
                  type="monotone" 
                  dataKey="secondaryValue" 
                  stroke="hsl(var(--ocean))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--ocean))', strokeWidth: 0, r: 4 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
          <span>Normal range: {config.normalMin}–{config.normalMax} {config.unit}</span>
        </div>
      </CardContent>
    </Card>
  );
}
