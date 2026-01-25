import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { usePractice, PracticeMember, PracticeRole } from '@/hooks/usePractice';
import { CreatePracticeDialog } from './CreatePracticeDialog';
import { InviteTeamMemberDialog } from './InviteTeamMemberDialog';
import { Building2, UserPlus, Users, MoreVertical, Crown, Shield, Stethoscope, User, Loader2, Mail } from 'lucide-react';

const ROLE_ICONS: Record<PracticeRole, React.ReactNode> = {
  owner: <Crown className="h-4 w-4 text-amber-500" />,
  admin: <Shield className="h-4 w-4 text-blue-500" />,
  provider: <Stethoscope className="h-4 w-4 text-green-500" />,
  staff: <User className="h-4 w-4 text-gray-500" />,
};

const ROLE_COLORS: Record<PracticeRole, string> = {
  owner: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  provider: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  staff: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400',
};

export function PracticeTeamSection() {
  const { 
    currentPractice, 
    currentMembership,
    usePracticeMembers,
    usePracticeInvitations,
    removeMember,
    canManagePractice,
    hasPractice,
    isLoading,
  } = usePractice();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<PracticeMember | null>(null);

  const { data: members = [], isLoading: loadingMembers } = usePracticeMembers(currentPractice?.id || '');
  const { data: invitations = [] } = usePracticeInvitations(currentPractice?.id || '');

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
    await removeMember.mutateAsync(memberToRemove.id);
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
              {members.map((member) => (
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
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => setMemberToRemove(member)}
                          >
                            Remove from practice
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              ))}
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
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this person's access to the practice and all shared patients.
              They can be re-invited later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRemoveMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeMember.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Remove'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
