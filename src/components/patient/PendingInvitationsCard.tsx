import { UserPlus, Check, X, Clock, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePatientInvitations } from '@/hooks/usePatientInvitations';
import { formatDistanceToNow } from 'date-fns';

export function PendingInvitationsCard() {
  const { receivedInvitations, isLoading, acceptInvitation, declineInvitation } = usePatientInvitations();

  if (isLoading) {
    return null;
  }

  if (receivedInvitations.length === 0) {
    return null;
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <UserPlus className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Provider Invitations</CardTitle>
            <CardDescription className="text-xs">
              Healthcare providers want to connect with you
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {receivedInvitations.map((invitation) => (
          <div
            key={invitation.id}
            className="p-4 rounded-lg bg-background border"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="font-medium">
                  {invitation.patient_name ? `Dr. requests to connect` : 'A healthcare provider wants to connect'}
                </p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>Sent {formatDistanceToNow(new Date(invitation.created_at))} ago</span>
                </div>
                {invitation.expires_at && (
                  <Badge variant="outline" className="text-xs">
                    Expires {formatDistanceToNow(new Date(invitation.expires_at))}
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => declineInvitation.mutate(invitation.id)}
                  disabled={declineInvitation.isPending}
                >
                  {declineInvitation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <X className="h-4 w-4 mr-1" />
                      Decline
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  className="gradient-primary border-0"
                  onClick={() => acceptInvitation.mutate(invitation.id)}
                  disabled={acceptInvitation.isPending}
                >
                  {acceptInvitation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Accept
                    </>
                  )}
                </Button>
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground mt-3">
              Accepting will share your vitals, medications, and adherence data with this provider.
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
