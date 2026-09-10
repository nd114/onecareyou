import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { VITAL_CONFIG, VitalType, resolveVitalConfig, hasNormalRange } from '@/types/health';
import { format } from 'date-fns';

interface RecordVitalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientUserId: string;
  patientName: string;
}

/**
 * A reading the clinician measured, written into the patient's own record.
 *
 * The row is the patient's (user_id), but it is stamped source='clinician' and
 * recorded_by_user_id, so it shows in their app with a Clinician badge and the
 * patient cannot silently rewrite what a clinician measured — the same rule the
 * dictation and scribe paths already follow.
 */
export function RecordVitalDialog({ open, onOpenChange, patientUserId, patientName }: RecordVitalDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [type, setType] = useState<VitalType>('blood_pressure');
  const [value, setValue] = useState('');
  const [secondaryValue, setSecondaryValue] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(format(new Date(), 'HH:mm'));
  const [saving, setSaving] = useState(false);

  const config = resolveVitalConfig(type);
  const isBP = type === 'blood_pressure';

  const reset = () => {
    setValue('');
    setSecondaryValue('');
    setNotes('');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setTime(format(new Date(), 'HH:mm'));
  };

  const recordedAt = () => {
    const [h, m] = time.split(':').map(Number);
    const d = new Date(`${date}T00:00:00`);
    d.setHours(h || 0, m || 0, 0, 0);
    return d.toISOString();
  };

  const isValid =
    !!value && !isNaN(parseFloat(value)) && (!isBP || (!!secondaryValue && !isNaN(parseFloat(secondaryValue))));

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('vitals').insert({
        user_id: patientUserId,
        recorded_by_user_id: user.id,
        source: 'clinician',
        type,
        value: parseFloat(value),
        secondary_value: isBP ? parseFloat(secondaryValue) : null,
        unit: config.unit,
        notes: notes || null,
        recorded_at: recordedAt(),
      });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['patient-vitals'] });
      queryClient.invalidateQueries({ queryKey: ['patient-vitals-summaries'] });
      toast.success(`${config.label} recorded for ${patientName}`);
      reset();
      onOpenChange(false);
    } catch (e: any) {
      // A refusal here is nearly always the patient not having shared readings.
      toast.error(
        e?.message?.includes('row-level security')
          ? 'You cannot add readings for this patient — they have not shared their readings with you.'
          : e?.message || 'Could not save that reading',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record a reading</DialogTitle>
          <DialogDescription>
            This goes straight into {patientName}'s record, marked as measured by you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Measurement</Label>
            <Select value={type} onValueChange={(v) => { setType(v as VitalType); setValue(''); setSecondaryValue(''); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(VITAL_CONFIG) as VitalType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {VITAL_CONFIG[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recordValue">
              Value <span className="text-muted-foreground">({config.unit})</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="recordValue"
                type="number"
                step="0.1"
                placeholder={isBP ? 'Systolic (e.g., 120)' : 'e.g., 72'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="flex-1"
              />
              {isBP && (
                <Input
                  type="number"
                  placeholder="Diastolic (e.g., 80)"
                  value={secondaryValue}
                  onChange={(e) => setSecondaryValue(e.target.value)}
                  className="flex-1"
                />
              )}
            </div>
            {hasNormalRange(type) && (
              <p className="text-xs text-muted-foreground">
                Usual range: {config.normalMin}–{config.normalMax} {config.unit}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="recordDate">Date</Label>
              <Input id="recordDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recordTime">Time</Label>
              <Input id="recordTime" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recordNotes">Notes (optional)</Label>
            <Textarea
              id="recordNotes"
              rows={2}
              placeholder="Context the patient should see, e.g. taken sitting, left arm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={!isValid || saving}>
              {saving ? 'Saving...' : 'Save reading'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
