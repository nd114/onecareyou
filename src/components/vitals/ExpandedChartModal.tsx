import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { VitalType, VITAL_CONFIG } from '@/types/health';
import { VitalRecord } from '@/hooks/useVitals';
import { useUnitPreferences } from '@/hooks/useUnitPreferences';
import { format } from 'date-fns';
import { Maximize2 } from 'lucide-react';

interface ExpandedChartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: VitalType;
  data: VitalRecord[];
  title?: string;
}

export function ExpandedChartModal({ open, onOpenChange, type, data, title }: ExpandedChartModalProps) {
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
        notes: v.notes,
      };
    });
  }, [data, type, convertVitalValue]);

  const isBloodPressure = type === 'blood_pressure';

  // Calculate statistics
  const stats = useMemo(() => {
    if (data.length === 0) return null;
    
    const values = data.map(v => convertVitalValue(type, v.value).value);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const inRange = values.filter(v => v >= normalRange.min && v <= normalRange.max).length;
    
    return {
      average: Math.round(avg * 10) / 10,
      min: Math.round(min * 10) / 10,
      max: Math.round(max * 10) / 10,
      count: values.length,
      inRange,
      outOfRange: values.length - inRange,
    };
  }, [data, type, convertVitalValue, normalRange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Maximize2 className="h-5 w-5 text-primary" />
            {title || config.label} - Detailed View
          </DialogTitle>
        </DialogHeader>
        
        {data.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            No data recorded yet
          </div>
        ) : (
          <div className="space-y-6">
            {/* Statistics Summary */}
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{stats.average}</p>
                  <p className="text-xs text-muted-foreground">Average {displayUnit}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{stats.min} - {stats.max}</p>
                  <p className="text-xs text-muted-foreground">Range {displayUnit}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-status-success">{stats.inRange}</p>
                  <p className="text-xs text-muted-foreground">In Normal Range</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{stats.count}</p>
                  <p className="text-xs text-muted-foreground">Total Readings</p>
                </div>
              </div>
            )}

            {/* Large Chart */}
            <div className="h-[350px] sm:h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    className="text-xs fill-muted-foreground"
                    tick={{ fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    className="text-xs fill-muted-foreground"
                    tick={{ fontSize: 11 }}
                    domain={['auto', 'auto']}
                    width={45}
                    tickFormatter={(value) => `${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                      padding: '12px'
                    }}
                    labelFormatter={(_, payload) => payload[0]?.payload?.fullDate || ''}
                    formatter={(value: number, name: string) => {
                      if (isBloodPressure) {
                        const label = name === 'value' ? 'Systolic' : 'Diastolic';
                        return [`${value} ${displayUnit}`, label];
                      }
                      return [`${value} ${displayUnit}`, config.label];
                    }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0]?.payload;
                      return (
                        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
                          <p className="font-medium text-sm mb-1">{data?.fullDate}</p>
                          {payload.map((entry: { name: string; value: number; color: string }, idx: number) => (
                            <p key={idx} className="text-sm" style={{ color: entry.color }}>
                              {isBloodPressure 
                                ? (entry.name === 'value' ? 'Systolic' : 'Diastolic')
                                : config.label
                              }: {entry.value} {displayUnit}
                            </p>
                          ))}
                          {data?.notes && (
                            <p className="text-xs text-muted-foreground mt-2 border-t pt-2 max-w-[200px]">
                              Note: {data.notes}
                            </p>
                          )}
                        </div>
                      );
                    }}
                  />
                  {isBloodPressure && (
                    <Legend 
                      verticalAlign="top" 
                      height={36}
                      wrapperStyle={{ fontSize: '12px' }}
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
                    label={{ value: `High (${normalRange.max})`, position: 'right', fontSize: 11, fill: 'hsl(var(--severity-high))' }}
                  />
                  <ReferenceLine 
                    y={normalRange.min} 
                    stroke="hsl(var(--ocean))" 
                    strokeDasharray="5 5" 
                    label={{ value: `Low (${normalRange.min})`, position: 'right', fontSize: 11, fill: 'hsl(var(--ocean))' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2.5}
                    dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 4 }}
                    activeDot={{ r: 6, stroke: 'hsl(var(--background))', strokeWidth: 2 }}
                    name="value"
                  />
                  {isBloodPressure && (
                    <Line 
                      type="monotone" 
                      dataKey="secondaryValue" 
                      stroke="hsl(var(--ocean))" 
                      strokeWidth={2.5}
                      dot={{ fill: 'hsl(var(--ocean))', strokeWidth: 0, r: 4 }}
                      name="secondaryValue"
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Normal Range Info */}
            <div className="flex items-center justify-center text-sm text-muted-foreground bg-muted/30 rounded-lg py-3">
              {isBloodPressure ? (
                <span>Normal Range: Systolic 90–120 {displayUnit}, Diastolic 60–80 {displayUnit}</span>
              ) : (
                <span>Normal Range: {normalRange.min}–{normalRange.max} {displayUnit}</span>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
