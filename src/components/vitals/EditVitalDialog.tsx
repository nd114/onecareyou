import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { VitalType, VITAL_CONFIG } from '@/types/health';
import { VitalRecord } from '@/hooks/useVitals';
import { useUnitPreferences } from '@/hooks/useUnitPreferences';

interface EditVitalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vital: VitalRecord | null;
  onSave: (
    id: string,
    updates: {
      value?: number;
      secondaryValue?: number;
      notes?: string;
      recordedAt?: Date;
    }
  ) => Promise<boolean>;
}

export function EditVitalDialog({ open, onOpenChange, vital, onSave }: EditVitalDialogProps) {
  const { getDisplayUnit, getNormalRange, convertVitalValue, convertToBaseUnit } = useUnitPreferences();
  
  const [value, setValue] = useState('');
  const [secondaryValue, setSecondaryValue] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (vital) {
      // Convert stored base unit value to user's preferred unit for display
      const converted = convertVitalValue(vital.type, vital.value);
      setValue(converted.value.toString());
      
      if (vital.secondary_value) {
        const convertedSecondary = convertVitalValue(vital.type, vital.secondary_value);
        setSecondaryValue(convertedSecondary.value.toString());
      } else {
        setSecondaryValue('');
      }
      
      setNotes(vital.notes || '');
      const recordedDate = new Date(vital.recorded_at);
      setSelectedDate(recordedDate);
      setSelectedTime(format(recordedDate, 'HH:mm'));
    }
  }, [vital, convertVitalValue]);

  const config = VITAL_CONFIG[vital.type];
  const hasBPSecondary = vital.type === 'blood_pressure';
  const displayUnit = getDisplayUnit(vital.type);
  const normalRange = getNormalRange(vital.type);

  const getRecordedDateTime = () => {
    const [hours, minutes] = selectedTime.split(':').map(Number);
    const dateTime = new Date(selectedDate);
    dateTime.setHours(hours, minutes, 0, 0);
    return dateTime;
  };

  const handleSave = async () => {
    setSaving(true);
    
    try {
      // Convert from user's preferred unit back to base unit before saving
      const baseValue = convertToBaseUnit(vital!.type, parseFloat(value));
      const baseSecondaryValue = secondaryValue 
        ? convertToBaseUnit(vital!.type, parseFloat(secondaryValue)) 
        : undefined;
      
      const success = await onSave(vital!.id, {
        value: baseValue,
        secondaryValue: baseSecondaryValue,
        notes: notes || undefined,
        recordedAt: getRecordedDateTime(),
      });
      
      if (success) {
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const isValid = value && !isNaN(parseFloat(value));

  if (!vital) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {config.label}</DialogTitle>
          <DialogDescription>
            Update the recorded value and details
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {/* Date & Time Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "MMM d, yyyy") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editTime">Time</Label>
              <Input
                id="editTime"
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="w-full"
              />
            </div>
          </div>

          {/* Value Input */}
          <div className="space-y-2">
            <Label htmlFor="editValue">
              {config.label}
              <span className="text-muted-foreground ml-1">({displayUnit})</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="editValue"
                type="number"
                step="0.1"
                placeholder={hasBPSecondary ? "Systolic (e.g., 120)" : `e.g., ${normalRange.min}-${normalRange.max}`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="flex-1"
              />
              {hasBPSecondary && (
                <Input
                  type="number"
                  placeholder="Diastolic (e.g., 80)"
                  value={secondaryValue}
                  onChange={(e) => setSecondaryValue(e.target.value)}
                  className="flex-1"
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Normal range: {normalRange.min}–{normalRange.max} {normalRange.unit}
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="editNotes">Notes (optional)</Label>
            <Textarea
              id="editNotes"
              placeholder="Any relevant context or observations..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* System logged timestamp */}
          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
            <p><strong>Originally logged:</strong> {format(new Date(vital.created_at), "MMM d, yyyy 'at' h:mm a")}</p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button 
              variant="outline" 
              className="flex-1" 
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button 
              className="flex-1 gradient-primary border-0" 
              onClick={handleSave}
              disabled={!isValid || saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
