import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Minus, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { roleProfile } from '@/lib/staff-roles';
import { MATRIX_CAPABILITIES, MATRIX_ROLES, matrixCell } from '@/lib/role-capability-matrix';
import {
  useSetClinicalSeat,
  type AccountMember,
  type PracticeAccountOverview,
} from '@/hooks/usePracticeAccount';
import { formatLimit } from './shared';

const runsPractice = (role: string) => role === 'owner' || role === 'admin';

/** Why this person does or does not see clinical records, in a phrase. */
export function clinicalAccessReason(member: AccountMember): string {
  if (runsPractice(member.role)) {
    return member.clinical_seat
      ? 'Takes a clinician seat'
      : 'Runs the practice; no clinician seat, so no clinical records';
  }
  return roleProfile(member.role).clinical ? 'Clinical role' : 'Non-clinical role';
}

export function AccountPeopleTab({ overview }: { overview: PracticeAccountOverview }) {
  const practiceId = overview.practice.id;
  const setSeat = useSetClinicalSeat(practiceId);
  const [confirming, setConfirming] = useState<AccountMember | null>(null);
  const { clinician, staff } = overview.seats;
  const seatsFull = clinician.limit !== null && clinician.used >= clinician.limit;

  const toggle = (member: AccountMember, on: boolean) => {
    // Turning it off removes access to records straight away, so it is asked
    // about. Turning it on only spends a seat, and the server refuses when none is free.
    if (!on) setConfirming(member);
    else setSeat.mutate({ userId: member.user_id, on: true });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">People and access</CardTitle>
            <CardDescription>
              Clinician seats {clinician.used} of {formatLimit(clinician.limit)} · Staff seats {staff.used} of{' '}
              {staff.purchased}
            </CardDescription>
          </div>
          <Button asChild size="sm" variant="outline" className="self-start">
            <Link to="/clinician/practice/people">
              <UserPlus className="mr-2 h-4 w-4" />
              Invite or manage people
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {seatsFull && (
            <p className="text-sm text-muted-foreground" data-testid="seats-full-note">
              All clinician seats are in use. Add one under Add-ons before giving someone else clinical access.
            </p>
          )}
          {overview.members.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Clinical access</TableHead>
                    <TableHead className="min-w-[220px]">Also practise clinically</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.members.map((m) => (
                    <TableRow key={m.user_id} data-testid={`member-${m.user_id}`}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell>{roleProfile(m.role).label}</TableCell>
                      <TableCell>
                        <Badge variant={m.is_clinical ? 'default' : 'secondary'}>{m.is_clinical ? 'Yes' : 'No'}</Badge>
                        <p className="mt-1 text-xs text-muted-foreground">{clinicalAccessReason(m)}</p>
                      </TableCell>
                      <TableCell>
                        {runsPractice(m.role) ? (
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Switch
                              checked={m.clinical_seat}
                              disabled={setSeat.isPending}
                              onCheckedChange={(on) => toggle(m, on)}
                              aria-label={`Also practise clinically (uses a clinician seat): ${m.name}`}
                            />
                            <span>Uses a clinician seat</span>
                          </label>
                        ) : (
                          <span className="text-xs text-muted-foreground">Set by role</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <RoleMatrix />

      <AlertDialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off clinical access for {confirming?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to clinical records immediately. They stay in the practice and keep running
              it, and the clinician seat they were using is freed. You can turn it back on while a seat is
              free.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep access</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming) setSeat.mutate({ userId: confirming.user_id, on: false });
                setConfirming(null);
              }}
            >
              Turn off clinical access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Read-only. Editing a role's rights is not offered here. */
function RoleMatrix() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">What each role can do</CardTitle>
        <CardDescription>
          The defaults for each role, for reference. Owners and admins run the practice and do not see
          clinical records unless they take a clinical seat.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table data-testid="role-matrix">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 min-w-[170px] bg-card">Capability</TableHead>
                {MATRIX_ROLES.map((r) => (
                  <TableHead key={r.key} className="px-2 text-center text-xs">
                    {r.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {MATRIX_CAPABILITIES.map((cap) => (
                <TableRow key={cap.key}>
                  <TableCell className="sticky left-0 bg-card text-sm" title={cap.detail}>
                    {cap.label}
                  </TableCell>
                  {MATRIX_ROLES.map((r) => {
                    const cell = matrixCell(r.key, cap.key);
                    return (
                      <TableCell key={r.key} className="px-2 text-center" data-cell={`${cap.key}:${r.key}:${cell}`}>
                        {cell === 'yes' && <Check className="mx-auto h-4 w-4 text-primary" aria-label="Yes" />}
                        {cell === 'no' && <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" aria-label="No" />}
                        {cell === 'seat' && (
                          <span className="text-[10px] font-medium leading-tight text-muted-foreground">
                            With a clinician seat
                          </span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
