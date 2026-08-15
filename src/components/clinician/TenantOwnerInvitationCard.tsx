import { useNavigate } from 'react-router-dom';
import { Building2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenantOwnerInvitations } from '@/hooks/useTenantOwnerInvitations';

/** Prompts a clinician invited by OneCare to take ownership of their institution. */
export function TenantOwnerInvitationCard() {
  const { invitations, accept, isAccepting } = useTenantOwnerInvitations();
  const navigate = useNavigate();

  if (invitations.length === 0) return null;

  return (
    <div className="space-y-3">
      {invitations.map((inv) => (
        <Card key={inv.id} className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Take ownership of {inv.practice_name}
            </CardTitle>
            <CardDescription>
              OneCare set up this {inv.tenant_type === 'hospital' ? 'hospital' : 'practice'} for
              you. Accepting makes you the owner, so you can invite your team and manage settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={async () => {
                await accept(inv.id);
                // An owner is an administrative account, not a patient one.
                navigate('/practice');
              }} disabled={isAccepting}>
              {isAccepting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Accept ownership
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
