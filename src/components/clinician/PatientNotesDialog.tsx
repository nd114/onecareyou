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
import { Loader2, Save } from 'lucide-react';

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

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes, open]);

  const handleSave = async () => {
    await onSave(notes);
    onOpenChange(false);
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
        <DialogFooter>
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
