import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VitalType, VITAL_CONFIG } from '@/types/health';
import { VitalRecord } from '@/hooks/useVitals';
import { useUnitPreferences } from '@/hooks/useUnitPreferences';
import { format } from 'date-fns';

interface VitalTrendChartProps {
  type: VitalType;
  data: VitalRecord[];
  title?: string;
}

export function VitalTrendChart({ type, data, title }: VitalTrendChartProps) {
  const config = VITAL_CONFIG[type];
  const { convertVitalValue, getDisplayUnit, getNormalRange } = useUnitPreferences();

  const displayUnit = getDisplayUnit(type);
  const normalRange = getNormalRange(type);

  const chartData = useMemo(() => {
    return data.map(v => {
      const converted = convertVitalValue(type, v.value);
      const secondaryConverted = v.secondary_value ? convertVitalValue(type, v.secondary_value) : null;
      
      return {
        date: format(new Date(v.recorded_at), 'MMM d'),
        value: converted.value,
        secondaryValue: secondaryConverted?.value ?? v.secondary_value,
        fullDate: format(new Date(v.recorded_at), 'MMM d, yyyy h:mm a'),
      };
    });
  }, [data, type, convertVitalValue]);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2 sm:pb-4">
          <CardTitle className="text-base sm:text-lg">{title || config.label}</CardTitle>
        </CardHeader>
        <CardContent className="h-[150px] sm:h-[200px] flex items-center justify-center text-muted-foreground text-sm">
          No data recorded yet
        </CardContent>
      </Card>
    );
  }

  // Special handling for blood pressure to show systolic/diastolic labels
  const isBloodPressure = type === 'blood_pressure';

  return (
    <Card>
      <CardHeader className="pb-1 sm:pb-2">
        <CardTitle className="text-base sm:text-lg">{title || config.label}</CardTitle>
        {isBloodPressure && (
          <p className="text-[10px] sm:text-xs text-muted-foreground">
            Systolic (top) / Diastolic (bottom)
          </p>
        )}
      </CardHeader>
      <CardContent className="p-2 sm:p-4 md:p-6 pt-0 sm:pt-0">
        <div className="h-[150px] sm:h-[180px] md:h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                className="text-xs fill-muted-foreground"
                tick={{ fontSize: 9 }}
                interval="preserveStartEnd"
              />
              <YAxis 
                className="text-xs fill-muted-foreground"
                tick={{ fontSize: 9 }}
                domain={['auto', 'auto']}
                width={35}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '11px',
                  padding: '8px'
                }}
                labelFormatter={(_, payload) => payload[0]?.payload?.fullDate || ''}
                formatter={(value: number, name: string) => {
                  if (isBloodPressure) {
                    const label = name === 'value' ? 'Systolic' : 'Diastolic';
                    return [`${value} ${displayUnit}`, label];
                  }
                  return [`${value} ${displayUnit}`, config.label];
                }}
              />
              {isBloodPressure && (
                <Legend 
                  verticalAlign="top" 
                  height={28}
                  wrapperStyle={{ fontSize: '10px' }}
                  formatter={(value) => {
                    if (value === 'value') return 'Systolic (SYS)';
                    if (value === 'secondaryValue') return 'Diastolic (DIA)';
                    return value;
                  }}
                />
              )}
              <ReferenceLine 
                y={normalRange.max} 
                stroke="hsl(var(--severity-high))" 
                strokeDasharray="5 5" 
                label={{ value: 'High', position: 'right', fontSize: 9, fill: 'hsl(var(--severity-high))' }}
              />
              <ReferenceLine 
                y={normalRange.min} 
                stroke="hsl(var(--ocean))" 
                strokeDasharray="5 5" 
                label={{ value: 'Low', position: 'right', fontSize: 9, fill: 'hsl(var(--ocean))' }}
              />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, stroke: 'hsl(var(--background))', strokeWidth: 2 }}
                name="value"
              />
              {isBloodPressure && (
                <Line 
                  type="monotone" 
                  dataKey="secondaryValue" 
                  stroke="hsl(var(--ocean))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--ocean))', strokeWidth: 0, r: 3 }}
                  name="secondaryValue"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center mt-1 sm:mt-2 text-[10px] sm:text-xs text-muted-foreground text-center px-2">
          {isBloodPressure ? (
            <span>Normal: SYS 90–120, DIA 60–80 {displayUnit}</span>
          ) : (
            <span>Normal: {normalRange.min}–{normalRange.max} {displayUnit}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
