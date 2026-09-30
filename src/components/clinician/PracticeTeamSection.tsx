import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { usePractice, PracticeMember, PracticeRole } from '@/hooks/usePractice';
import { useLeavePractice, useOffboardingImpact } from '@/hooks/useOffboarding';
import { CreatePracticeDialog } from './CreatePracticeDialog';
import { InviteTeamMemberDialog } from './InviteTeamMemberDialog';
import { OffboardingImpactList } from './OffboardingImpactList';
import { isClinicalRole } from '@/lib/staff-roles';
import { Building2, UserPlus, Users, MoreVertical, Crown, Shield, Stethoscope, User, Loader2, Mail, Search, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';

const PAGE_SIZE = 10;

/**
 * Roles an owner or admin can move somebody to. Ownership is deliberately not
 * here: handing over a hospital is not a menu item, and the database treats it
 * as its own step.
 */
const ASSIGNABLE_ROLES: PracticeRole[] = [
  'admin',
  'sub_admin',
  'provider',
  'clinician',
  'nurse',
  'front_desk',
  'billing',
  'read_only',
  'staff',
];

const ROLE_ICONS: Record<PracticeRole, React.ReactNode> = {
  owner: <Crown className="h-4 w-4 text-amber-500" />,
  admin: <Shield className="h-4 w-4 text-blue-500" />,
  sub_admin: <Shield className="h-4 w-4 text-blue-500" />,
  provider: <Stethoscope className="h-4 w-4 text-green-500" />,
  clinician: <Stethoscope className="h-4 w-4 text-green-500" />,
  nurse: <Stethoscope className="h-4 w-4 text-green-500" />,
  front_desk: <User className="h-4 w-4 text-gray-500" />,
  billing: <User className="h-4 w-4 text-gray-500" />,
  read_only: <User className="h-4 w-4 text-gray-500" />,
  staff: <User className="h-4 w-4 text-gray-500" />,
};

const ROLE_COLORS: Record<PracticeRole, string> = {
  owner: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  sub_admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  provider: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  clinician: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  nurse: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  front_desk: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400',
  billing: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400',
  read_only: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400',
  staff: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400',
};

export function PracticeTeamSection() {
  const { 
    currentPractice, 
    currentMembership,
    usePracticeMembers,
    usePracticeInvitations,
    removeMember,
    updateMember,
    canManagePractice,
    isOwner,
    hasPractice,
    isLoading,
  } = usePractice();
  const leavePractice = useLeavePractice();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<PracticeMember | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [roleChange, setRoleChange] = useState<{ member: PracticeMember; role: PracticeRole } | null>(null);
  // The same query the lists below render; read here to hold the button while
  // the account is loading, and to keep it held when ending would be refused.
  const removeImpact = useOffboardingImpact(currentPractice?.id, memberToRemove?.user_id);
  const leaveImpact = useOffboardingImpact(
    leaving ? currentPractice?.id : null,
    leaving ? currentMembership?.user_id : null,
  );
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data: members = [], isLoading: loadingMembers } = usePracticeMembers(currentPractice?.id || '');
  const { data: invitations = [] } = usePracticeInvitations(currentPractice?.id || '');
  const filteredMembers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((member) => {
      const clinicianName = `${member.clinician_profile?.first_name ?? ''} ${member.clinician_profile?.last_name ?? ''}`;
      return [clinicianName, member.profile?.name, member.profile?.email, member.clinician_profile?.specialty, member.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [members, search]);
  const pageCount = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
  const visibleMembers = filteredMembers.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // No practice yet - show creation CTA
  if (!hasPractice) {
    return (
      <>
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Create Your Practice</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Set up a practice to invite colleagues, share patient care responsibilities, 
              and manage your team under one subscription.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Building2 className="h-4 w-4 mr-2" />
              Create Practice
            </Button>
          </CardContent>
        </Card>

        <CreatePracticeDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
      </>
    );
  }

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;
    await removeMember.mutateAsync(memberToRemove);
    setMemberToRemove(null);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {currentPractice?.name}
            </CardTitle>
            <CardDescription>
              {members.length} team member{members.length !== 1 ? 's' : ''} • 
              {currentPractice?.patient_limit} patient limit
            </CardDescription>
          </div>
          {canManagePractice && (
            <Button onClick={() => setShowInviteDialog(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Invite
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Search personnel"
              className="pl-9"
            />
          </div>
          {/* Pending Invitations */}
          {invitations.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Pending Invitations</h4>
              {invitations.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Mail className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{inv.name || inv.email}</p>
                      <p className="text-sm text-muted-foreground">{inv.email}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {inv.role}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {/* Team Members */}
          {loadingMembers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {visibleMembers.map((member) => (
                <div 
                  key={member.id} 
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={member.profile?.avatar_url || undefined} />
                      <AvatarFallback>
                        {member.clinician_profile?.first_name?.[0] || member.profile?.name?.[0] || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">
                          {member.clinician_profile 
                            ? `${member.clinician_profile.title || ''} ${member.clinician_profile.first_name || ''} ${member.clinician_profile.last_name || ''}`.trim()
                            : member.profile?.name || 'Unknown'}
                        </p>
                        {member.user_id === currentMembership?.user_id && (
                          <Badge variant="secondary" className="text-xs">You</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {member.clinician_profile?.specialty || member.profile?.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge className={`flex items-center gap-1 ${ROLE_COLORS[member.role]}`}>
                      {ROLE_ICONS[member.role]}
                      <span className="capitalize">{member.role}</span>
                    </Badge>

                    {canManagePractice && member.role !== 'owner' && member.user_id !== currentMembership?.user_id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel>Change role</DropdownMenuLabel>
                          {ASSIGNABLE_ROLES.map((role) => (
                            <DropdownMenuItem
                              key={role}
                              disabled={role === member.role || updateMember.isPending}
                              onClick={() =>
                                // Off the clinical side hands their clinical work over, so
                                // it is confirmed with what it leaves behind first.
                                isClinicalRole(member.role) && !isClinicalRole(role)
                                  ? setRoleChange({ member, role })
                                  : updateMember.mutate({ member, updates: { role } })
                              }
                            >
                              <span className="flex items-center gap-2 capitalize">
                                {ROLE_ICONS[role]}
                                {role.replace(/_/g, ' ')}
                              </span>
                              {role === member.role && (
                                <span className="ml-auto text-xs text-muted-foreground">Current</span>
                              )}
                            </DropdownMenuItem>
                          ))}
                          {/* Ownership is its own step, and only an owner can
                              give it. It is also how an owner who wants to
                              leave appoints the successor the practice needs. */}
                          {isOwner && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={updateMember.isPending}
                                onClick={() => updateMember.mutate({ member, updates: { role: 'owner' } })}
                              >
                                <span className="flex items-center gap-2">
                                  {ROLE_ICONS.owner}
                                  Make co-owner
                                </span>
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setMemberToRemove(member)}
                          >
                            End their access
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              ))}
              {filteredMembers.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">No personnel match this search.</p>
              )}
              {pageCount > 1 && (
                <div className="flex items-center justify-between pt-3">
                  <p className="text-sm text-muted-foreground">Page {Math.min(page, pageCount)} of {pageCount}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Previous personnel page">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} aria-label="Next personnel page">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {currentMembership && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="text-xs text-muted-foreground max-w-md">
                Leaving ends your access to this practice's patients and records. Your own private
                patients are not affected.
              </p>
              <Button variant="outline" size="sm" onClick={() => setLeaving(true)}>
                <LogOut className="h-4 w-4 mr-2" />
                Leave this practice
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <InviteTeamMemberDialog 
        open={showInviteDialog} 
        onOpenChange={setShowInviteDialog}
        practiceId={currentPractice?.id || ''}
      />

      {/* Remove Member Confirmation */}
      <AlertDialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this person's access?</AlertDialogTitle>
            <AlertDialogDescription>
              Their membership ends now and is kept in the practice's history. They can be invited
              again later. Before you confirm, this is what it leaves behind:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <OffboardingImpactList practiceId={currentPractice?.id} userId={memberToRemove?.user_id} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              disabled={removeImpact.isLoading || !!removeImpact.data?.blockedReason || removeMember.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeMember.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'End access'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Moving someone off the clinical side */}
      <AlertDialog open={!!roleChange} onOpenChange={(open) => !open && setRoleChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Move this person to {roleChange?.role.replace(/_/g, ' ')}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This role does not see patients, so their clinical work here is handed over as it
              would be if they left. Before you confirm, this is what it leaves behind:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <OffboardingImpactList
            practiceId={roleChange ? currentPractice?.id : null}
            userId={roleChange?.member.user_id}
            change="non_clinical"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={updateMember.isPending}
              onClick={() => {
                if (roleChange) updateMember.mutate({ member: roleChange.member, updates: { role: roleChange.role } });
                setRoleChange(null);
              }}
            >
              Change role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leaving of one's own accord */}
      <AlertDialog open={leaving} onOpenChange={setLeaving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave {currentPractice?.name ?? 'this practice'}?</AlertDialogTitle>
            <AlertDialogDescription>
              You cannot undo this yourself; to come back, you would need to be invited again. This
              is what leaving means:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <OffboardingImpactList
            practiceId={leaving ? currentPractice?.id : null}
            userId={leaving ? currentMembership?.user_id : null}
            self
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              disabled={leaveImpact.isLoading || !!leaveImpact.data?.blockedReason || leavePractice.isPending}
              onClick={async () => {
                if (!currentPractice) return;
                try {
                  await leavePractice.mutateAsync({ practiceId: currentPractice.id });
                  setLeaving(false);
                } catch {
                  /* the hook shows the server's words */
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {leavePractice.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Leave'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
