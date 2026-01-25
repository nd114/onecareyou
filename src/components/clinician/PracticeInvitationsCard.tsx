import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePractice } from '@/hooks/usePractice';
import { Building2, Check, X, Loader2 } from 'lucide-react';

export function PracticeInvitationsCard() {
  const { myInvitations, acceptInvitation, declineInvitation, loadingInvitations } = usePractice();

  if (loadingInvitations || myInvitations.length === 0) {
    return null;
  }

  return (
    <Card className="border-primary/50 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Building2 className="h-5 w-5 text-primary" />
          Practice Invitations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {myInvitations.map((invitation) => (
          <div 
            key={invitation.id}
            className="flex items-center justify-between p-4 bg-background rounded-lg border"
          >
            <div className="space-y-1">
              <p className="font-medium">You've been invited to join a practice</p>
              <p className="text-sm text-muted-foreground">
                Role: <Badge variant="outline" className="ml-1 capitalize">{invitation.role}</Badge>
              </p>
              {invitation.expires_at && (
                <p className="text-xs text-muted-foreground">
                  Expires: {new Date(invitation.expires_at).toLocaleDateString()}
                </p>
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
        ))}
      </CardContent>
    </Card>
  );
}
