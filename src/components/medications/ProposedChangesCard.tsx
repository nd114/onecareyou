import { useState } from 'react';
import { Check, X, Loader2, Stethoscope } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useChangeProposals, describeProposal, type ChangeProposal } from '@/hooks/useChangeProposals';
import { useMedications } from '@/hooks/useMedications';

/**
 * Changes a clinician has asked for, waiting on the patient.
 *
 * Sits above the medication list rather than inside it, because a proposal is
 * not a medication — it is a decision about one, and burying it as a badge on
 * a row makes it something you scroll past. Answered proposals drop off this
 * card; they stay in the record, but a decision already made is not a task.
 *
 * The reason is shown, always. A proposed dose change with no explanation asks
 * somebody to consent to something they have not been told about.
 */
export function ProposedChangesCard() {
  const { pending, respond } = useChangeProposals();
  const { medications } = useMedications();
  const [declining, setDeclining] = useState<string | null>(null);
  const [note, setNote] = useState('');

  if (pending.length === 0) return null;

  const nameFor = (p: ChangeProposal) =>
    p.medication_id ? medications?.find((m) => m.id === p.medication_id)?.name : undefined;

  const answer = (id: string, accept: boolean) => {
    respond.mutate(
      { id, accept, note: accept ? undefined : note },
      { onSuccess: () => { setDeclining(null); setNote(''); } },
    );
  };

  return (
    <Card className="mb-6 border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Stethoscope className="h-4 w-4 text-primary" />
          Your clinician has suggested a change
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {pending.length} waiting
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Nothing changes in your record until you accept.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {pending.map((p) => {
          const { title, detail } = describeProposal(p, nameFor(p));
          const isDeclining = declining === p.id;
          return (
            <div key={p.id} className="rounded-lg border bg-card p-3">
              <p className="font-medium text-sm">{title}</p>
              {detail && <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>}
              {p.rationale && (
                <p className="text-xs mt-2 border-l-2 border-primary/30 pl-2 italic">
                  “{p.rationale}”
                </p>
              )}

              {isDeclining ? (
                <div className="mt-3 space-y-2">
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Tell them why, if you'd like to (optional)"
                    rows={2}
                    className="text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => answer(p.id, false)}
                      disabled={respond.isPending}
                    >
                      {respond.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm decline'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setDeclining(null); setNote(''); }}>
                      Back
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => answer(p.id, true)} disabled={respond.isPending}>
                    {respond.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDeclining(p.id)}
                    disabled={respond.isPending}
                  >
                    <X className="h-3.5 w-3.5 mr-1.5" />
                    Decline
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
