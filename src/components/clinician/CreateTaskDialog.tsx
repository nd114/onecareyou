// Phase 1.5 — Lightweight dialog for creating a practice task from the
// Today inbox or a patient detail context.

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePracticeTasks, type TaskPriority } from "@/hooks/usePracticeTasks";
import { useClinicianCapabilities } from "@/hooks/useClinicianCapabilities";

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientUserId?: string | null;
  defaultTitle?: string;
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  patientUserId = null,
  defaultTitle = "",
}: CreateTaskDialogProps) {
  const { create } = usePracticeTasks();
  const { practiceId } = useClinicianCapabilities();
  const [title, setTitle] = useState(defaultTitle);
  const [notes, setNotes] = useState("");
  const [dueAt, setDueAt] = useState<string>("");
  const [priority, setPriority] = useState<TaskPriority>("normal");

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
      setNotes("");
      setDueAt("");
      setPriority("normal");
    }
  }, [open, defaultTitle]);

  const canSubmit = title.trim().length > 0 && !!practiceId && !create.isPending;

  const handleSubmit = async () => {
    if (!practiceId) return;
    await create.mutateAsync({
      practice_id: practiceId,
      patient_user_id: patientUserId ?? null,
      title: title.trim(),
      notes: notes.trim() || null,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      priority,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            {practiceId
              ? "Add a follow-up to your Today inbox."
              : "Join or create a practice to use tasks."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Call patient about BP reading"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="task-notes">Notes (optional)</Label>
            <Textarea
              id="task-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="task-due">Due</Label>
              <Input
                id="task-due"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="task-priority">Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as TaskPriority)}
              >
                <SelectTrigger id="task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {create.isPending ? "Saving..." : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
