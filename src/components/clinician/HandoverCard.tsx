import { useState } from 'react';
import { format } from 'date-fns';
import { Archive, CalendarClock, ClipboardList, FileSignature, FileX, Loader2, Pill, UserX } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isClinicalRole, type PracticeRole } from '@/lib/staff-roles';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  usePracticeHandoverQueue,
  useReassignHandoverItem,
  useResolveDepartedDraft,
  useWithdrawDepartedProposal,
  type DepartedDraftAction,
  type HandoverItem,
  type HandoverKind,
} from '@/hooks/useOffboarding';

/**
 * What people who have left this practice left open, and who has to decide.
 *
 * Nothing here is deleted and nothing moves on its own. A patient whose
 * clinician left is listed until someone is assigned; an unsigned note stays
 * exactly as its author left it until a lead signs it off, marks it entered in
 * error, or archives it; tasks, appointments and proposals are listed for
 * someone to pick up. The list is computed from the rows themselves, so it
 * empties as the work is done.
 */

const GROUPS: Array<{ kind: HandoverKind; title: string; blurb: string; icon: typeof UserX }> = [
  {
    kind: 'patient',
    title: 'Patients needing cover',
    blurb: 'Their clinician left and nobody is assigned now. Assign someone from the Patients tab; the patient is then told who has taken over.',
    icon: UserX,
  },
  {
    kind: 'draft',
    title: 'Unsigned — author departed',
    blurb: 'Notes left unsigned. They stay as written. Sign off (an addendum under your name; the note stays its author’s), mark entered in error, or archive.',
    icon: FileSignature,
  },
  {
    kind: 'dictation',
    title: 'Unfiled dictations — author departed',
    blurb: 'Write one up as a draft note under your own name, mark it entered in error, or archive it.',
    icon: FileSignature,
  },
  { kind: 'task', title: 'Open tasks', blurb: 'Assigned to someone who has left. Hand each one to a colleague.', icon: ClipboardList },
  {
    kind: 'appointment',
    title: 'Future appointments',
    blurb: 'Still booked with someone who has left. Hand each one to a colleague, or rebook it with the patient.',
    icon: CalendarClock,
  },
  {
    kind: 'proposal',
    title: 'Medication proposals waiting for the patient',
    blurb: 'Made by someone who has left. Withdraw them, or propose again yourself.',
    icon: Pill,
  },
];

const ACTION_WORDS: Record<DepartedDraftAction, { title: string; confirm: string }> = {
  cosign: { title: 'Sign this off?', confirm: 'Sign off' },
  entered_in_error: { title: 'Mark as entered in error?', confirm: 'Mark entered in error' },
  archive: { title: 'Archive this?', confirm: 'Archive' },
};

export interface HandoverStaff {
  user_id: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
}

/**
 * isManager: the caller is an owner or admin, who can reassign tasks and
 * appointments and withdraw proposals. staff: who work can be handed to.
 */
export function HandoverCard({
  practiceId,
  isManager = false,
  staff = [],
}: {
  practiceId: string | null | undefined;
  isManager?: boolean;
  staff?: readonly HandoverStaff[];
}) {
  const { items, isLoading, error } = usePracticeHandoverQueue(practiceId);
  const resolve = useResolveDepartedDraft();
  const withdraw = useWithdrawDepartedProposal();
  const reassign = useReassignHandoverItem();
  const [reassignTo, setReassignTo] = useState<Record<string, string>>({});
  const clinicians = staff.filter((s) => s.status === 'active' && isClinicalRole(s.role as PracticeRole));
  const [pending, setPending] = useState<{ item: HandoverItem; action: DepartedDraftAction } | null>(null);
  const [note, setNote] = useState('');

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  // A lead with nothing in scope, or someone the server refuses, sees nothing
  // rather than an error about a list that is not theirs.
  if (error || items.length === 0) return null;

  const confirm = async () => {
    if (!pending) return;
    try {
      await resolve.mutateAsync({
        kind: pending.item.kind === 'draft' ? 'encounter' : 'dictation',
        id: pending.item.itemId,
        action: pending.action,
        note: note.trim() || null,
      });
      setPending(null);
      setNote('');
    } catch {
      /* the hook shows the server's words */
    }
  };

  return (
    <>
      <Card className="border-amber-300/60">
        <CardHeader>
          <CardTitle className="text-base">Handover from staff who have left</CardTitle>
          <CardDescription>
            Nothing here has been deleted or reassigned automatically. Each item stays until someone
            picks it up.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {GROUPS.map((group) => {
            const found = items.filter((i) => i.kind === group.kind);
            if (found.length === 0) return null;
            const Icon = group.icon;
            return (
              <section key={group.kind} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-amber-600 shrink-0" />
                  <h3 className="text-sm font-medium">{group.title}</h3>
                  <Badge variant="secondary" className="text-[10px]">{found.length}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{group.blurb}</p>
                <ul className="rounded-lg border divide-y">
                  {found.map((item) => (
                    <li key={`${item.kind}-${item.itemId}`} className="px-3 py-2 space-y-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <span className="text-sm font-medium min-w-0 break-words">
                          {item.patientName ?? 'Patient'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {item.departedName ? `${item.departedName}` : ''}
                          {item.since ? ` · ${format(new Date(item.since), 'd MMM yyyy')}` : ''}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{item.detail}</p>
                      {(item.kind === 'draft' || item.kind === 'dictation') && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button size="sm" variant="outline" onClick={() => setPending({ item, action: 'cosign' })}>
                            <FileSignature className="h-3.5 w-3.5 mr-1.5" />
                            {item.kind === 'draft' ? 'Sign off' : 'Write up under my name'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setPending({ item, action: 'entered_in_error' })}>
                            <FileX className="h-3.5 w-3.5 mr-1.5" />
                            Entered in error
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setPending({ item, action: 'archive' })}>
                            <Archive className="h-3.5 w-3.5 mr-1.5" />
                            Archive
                          </Button>
                        </div>
                      )}
                      {(item.kind === 'task' || item.kind === 'appointment') && isManager && clinicians.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Select
                            value={reassignTo[item.itemId] ?? ''}
                            onValueChange={(v) => setReassignTo((prev) => ({ ...prev, [item.itemId]: v }))}
                          >
                            <SelectTrigger className="h-8 w-56 text-xs">
                              <SelectValue placeholder="Hand to…" />
                            </SelectTrigger>
                            <SelectContent>
                              {clinicians.map((c) => (
                                <SelectItem key={c.user_id} value={c.user_id}>
                                  {c.name || c.email || 'Colleague'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!reassignTo[item.itemId] || reassign.isPending}
                            onClick={() =>
                              reassign.mutate({
                                kind: item.kind as 'task' | 'appointment',
                                id: item.itemId,
                                toUserId: reassignTo[item.itemId],
                              })
                            }
                          >
                            Reassign
                          </Button>
                        </div>
                      )}
                      {item.kind === 'proposal' && isManager && (
                        <div className="pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={withdraw.isPending}
                            onClick={() => withdraw.mutate(item.itemId)}
                          >
                            Withdraw proposal
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </CardContent>
      </Card>

      <AlertDialog open={!!pending} onOpenChange={(open) => { if (!open) { setPending(null); setNote(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending ? ACTION_WORDS[pending.action].title : ''}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.action === 'cosign' && pending.item.kind === 'draft'
                ? `The note is signed off now, with an addendum under your name. It stays ${pending.item.departedName ?? 'its author'}’s note, word for word, and is not shared with the patient.`
                : pending?.action === 'cosign'
                  ? 'A new draft note is started under your name from this dictation. Review it and sign it from the patient’s record. The dictation stays its author’s.'
                  : pending?.action === 'entered_in_error'
                    ? 'It is kept and marked entered in error. Nothing is deleted.'
                    : 'It is kept and moved out of the working view. Nothing is deleted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for the record"
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm} disabled={resolve.isPending}>
              {resolve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : pending ? ACTION_WORDS[pending.action].confirm : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
