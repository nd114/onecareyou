import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Save, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface PatientNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientName: string;
  initialNotes: string;
  onSave: (notes: string) => Promise<void>;
  isSaving?: boolean;
}

export function PatientNotesDialog({
  open,
  onOpenChange,
  patientName,
  initialNotes,
  onSave,
  isSaving = false,
}: PatientNotesDialogProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const isDirty = notes !== initialNotes;

  useEffect(() => {
    setNotes(initialNotes);
    setLastSavedAt(null);
  }, [initialNotes, open]);

  const handleSave = async () => {
    await onSave(notes);
    setLastSavedAt(new Date());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Patient Notes</DialogTitle>
          <DialogDescription>
            Private notes about {patientName}. Only visible to you.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="notes">Clinical Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add private notes about this patient's care, observations, or follow-up items..."
              rows={8}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              These notes are encrypted and only visible to you. They are not shared with the patient.
            </p>
          </div>
        </div>
        <DialogFooter className="sm:justify-between gap-2 flex-col-reverse sm:flex-row">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 min-h-[20px]">
            {isSaving ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
            ) : lastSavedAt ? (
              <><CheckCircle2 className="h-3 w-3 text-primary" /> Saved {formatDistanceToNow(lastSavedAt, { addSuffix: true })}</>
            ) : isDirty ? (
              <span className="text-amber-600 dark:text-amber-400">Unsaved changes</span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="gradient-primary border-0">
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Notes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
