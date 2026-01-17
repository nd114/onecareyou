import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const DISCONTINUE_REASONS = [
  { value: 'doctor_order', label: "Doctor's orders" },
  { value: 'side_effects', label: 'Side effects' },
  { value: 'treatment_complete', label: 'Treatment completed' },
  { value: 'no_longer_needed', label: 'No longer needed' },
  { value: 'switched_medication', label: 'Switched to different medication' },
  { value: 'cost', label: 'Cost/insurance issues' },
  { value: 'other', label: 'Other reason' },
];

interface DiscontinueMedicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medicationName: string;
  onConfirm: (reason: string) => Promise<void>;
  isPending?: boolean;
}

export function DiscontinueMedicationDialog({
  open,
  onOpenChange,
  medicationName,
  onConfirm,
  isPending = false,
}: DiscontinueMedicationDialogProps) {
  const [reasonType, setReasonType] = useState<string>('');
  const [customReason, setCustomReason] = useState('');

  const handleConfirm = async () => {
    const reasonLabel = DISCONTINUE_REASONS.find(r => r.value === reasonType)?.label || '';
    const fullReason = reasonType === 'other' 
      ? customReason 
      : customReason 
        ? `${reasonLabel}: ${customReason}`
        : reasonLabel;
    
    await onConfirm(fullReason);
    setReasonType('');
    setCustomReason('');
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setReasonType('');
      setCustomReason('');
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Discontinue Medication
          </DialogTitle>
          <DialogDescription>
            You're about to discontinue <strong>{medicationName}</strong>. This medication will no longer appear in your schedule, but your history will be preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Reason for discontinuing (optional)</Label>
            <Select value={reasonType} onValueChange={setReasonType}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {DISCONTINUE_REASONS.map((reason) => (
                  <SelectItem key={reason.value} value={reason.value}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">
              {reasonType === 'other' ? 'Please specify' : 'Additional notes (optional)'}
            </Label>
            <Textarea
              id="notes"
              placeholder={reasonType === 'other' ? 'Enter your reason...' : 'Any additional details...'}
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              rows={3}
            />
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">What happens next:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>The medication will be marked as discontinued</li>
              <li>It will no longer appear in your daily schedule</li>
              <li>Your past adherence history will be preserved</li>
              <li>You can view discontinued medications in your medication list</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button 
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Discontinuing...
              </>
            ) : (
              'Discontinue Medication'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
