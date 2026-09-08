import { useState } from 'react';
import { Loader2, Send, Undo2 } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useProposeChange, describeProposal,
  type ProposalKind, type ProposalPayload,
} from '@/hooks/useChangeProposals';

interface Medication {
  id: string;
  name: string;
  dosage?: string | null;
  frequency?: string | null;
  instructions?: string | null;
}

interface Props {
  patientUserId: string | undefined;
  /** Omitted for a proposed new medication. */
  medication?: Medication;
  kind: ProposalKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * A clinician asks; the patient decides.
 *
 * The submit button says "Send to patient" rather than "Save", because nothing
 * is saved — a proposal sits until it is answered, and a clinician who thinks
 * they changed the dose will not follow up when the patient never accepts.
 *
 * Fields start empty rather than pre-filled with the current values. A form
 * pre-filled with everything invites editing the whole row, and a proposal is
 * a diff: only what is typed here is proposed, and the patient sees only what
 * is actually changing.
 */
export function ProposeMedicationChange({ patientUserId, medication, kind, open, onOpenChange }: Props) {
  const { propose } = useProposeChange(patientUserId);
  const [payload, setPayload] = useState<ProposalPayload>({});
  const [rationale, setRationale] = useState('');

  const set = (k: keyof ProposalPayload, v: string) =>
    setPayload((p) => ({ ...p, [k]: v.trim() ? v : undefined }));

  const isStop = kind === 'medication_stop';
  const isStart = kind === 'medication_start';
  const canSend = isStop || Object.values(payload).some((v) => v !== undefined && v !== '');

  const submit = () => {
    propose.mutate(
      { kind, medicationId: medication?.id ?? null, payload, rationale },
      {
        onSuccess: () => {
          setPayload({});
          setRationale('');
          onOpenChange(false);
        },
      },
    );
  };

  const title = isStart
    ? 'Suggest a new medication'
    : isStop
      ? `Suggest stopping ${medication?.name ?? 'this medication'}`
      : `Suggest a change to ${medication?.name ?? 'this medication'}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            This goes to the patient to accept. Their record does not change until they do.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isStop && (
            <>
              {isStart && (
                <div className="space-y-1.5">
                  <Label htmlFor="prop-name">Medication</Label>
                  <Input
                    id="prop-name"
                    value={payload.name ?? ''}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="e.g. Gliclazide"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="prop-dosage">Dose</Label>
                <Input
                  id="prop-dosage"
                  value={payload.dosage ?? ''}
                  onChange={(e) => set('dosage', e.target.value)}
                  placeholder={medication?.dosage ? `Currently ${medication.dosage}` : 'e.g. 80 mg'}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prop-frequency">Frequency</Label>
                <Input
                  id="prop-frequency"
                  value={payload.frequency ?? ''}
                  onChange={(e) => set('frequency', e.target.value)}
                  placeholder={medication?.frequency ? `Currently ${medication.frequency}` : 'e.g. once daily'}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prop-instructions">Instructions</Label>
                <Input
                  id="prop-instructions"
                  value={payload.instructions ?? ''}
                  onChange={(e) => set('instructions', e.target.value)}
                  placeholder="e.g. with breakfast"
                />
              </div>

              {!isStart && (
                <p className="text-xs text-muted-foreground">
                  Leave a field blank to keep it as it is.
                </p>
              )}
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="prop-why">Why</Label>
            <Textarea
              id="prop-why"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="The patient sees this. Say what the change is for."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={propose.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSend || propose.isPending}>
            {propose.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send to patient
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * What this clinician has asked for and has not been answered on.
 *
 * Shown to the clinician so a proposal does not vanish the moment it is sent.
 * Without it the only evidence a suggestion was ever made is the patient's
 * screen, and a clinician with no way to see an unanswered request will make
 * the same one again.
 */
export function ProposalsAwaitingPatient({
  patientUserId,
  medications,
}: {
  patientUserId: string | undefined;
  medications: Medication[];
}) {
  const { proposalsMade, withdraw } = useProposeChange(patientUserId);
  const open = proposalsMade.filter((p) => p.status === 'pending');
  const answered = proposalsMade.filter((p) => p.status === 'accepted' || p.status === 'declined');

  if (open.length === 0 && answered.length === 0) return null;

  const nameFor = (id: string | null) =>
    id ? medications.find((m) => m.id === id)?.name : undefined;

  return (
    <div className="mb-4 space-y-2">
      {open.map((p) => {
        const { title, detail } = describeProposal(p, nameFor(p.medication_id));
        return (
          <div key={p.id} className="flex items-start gap-3 rounded-lg border border-dashed p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{title}</p>
              {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
              <p className="text-xs text-muted-foreground mt-1">Waiting for the patient to accept</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => withdraw.mutate({ id: p.id })}
              disabled={withdraw.isPending}
            >
              <Undo2 className="h-3.5 w-3.5 mr-1.5" />
              Withdraw
            </Button>
          </div>
        );
      })}

      {answered.slice(0, 3).map((p) => {
        const { title } = describeProposal(p, nameFor(p.medication_id));
        return (
          <div key={p.id} className="flex items-center gap-2 px-3 text-xs text-muted-foreground">
            <Badge variant={p.status === 'accepted' ? 'secondary' : 'outline'} className="text-[10px]">
              {p.status === 'accepted' ? 'Accepted' : 'Declined'}
            </Badge>
            <span className="truncate">{title}</span>
            {p.response_note && <span className="truncate italic">— “{p.response_note}”</span>}
          </div>
        );
      })}
    </div>
  );
}
