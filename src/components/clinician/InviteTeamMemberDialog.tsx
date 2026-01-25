import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePractice, PracticeRole } from '@/hooks/usePractice';
import { UserPlus, Loader2 } from 'lucide-react';

interface InviteTeamMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  practiceId: string;
}

const ROLE_DESCRIPTIONS: Record<PracticeRole, string> = {
  owner: 'Full control over practice settings, billing, and members',
  admin: 'Can manage members, settings, and all patients',
  provider: 'Can view and manage assigned patients',
  staff: 'Limited access to patient data and scheduling',
};

export function InviteTeamMemberDialog({ open, onOpenChange, practiceId }: InviteTeamMemberDialogProps) {
  const { inviteMember, isOwner } = usePractice();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<PracticeRole>('provider');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await inviteMember.mutateAsync({
        practiceId,
        email,
        name: name || undefined,
        role,
      });
      onOpenChange(false);
      setEmail('');
      setName('');
      setRole('provider');
    } catch (error) {
      // Error handled by mutation
    }
  };

  // Roles that can be assigned (owners can assign admins)
  const availableRoles: PracticeRole[] = isOwner 
    ? ['admin', 'provider', 'staff']
    : ['provider', 'staff'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Invite Team Member
          </DialogTitle>
          <DialogDescription>
            Send an invitation to join your practice. They'll receive an email with instructions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Full Name (optional)</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dr. Jane Smith"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={(value: PracticeRole) => setRole(value)}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((r) => (
                  <SelectItem key={r} value={r}>
                    <div className="flex flex-col">
                      <span className="font-medium capitalize">{r}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {ROLE_DESCRIPTIONS[role]}
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={inviteMember.isPending || !email.trim()}>
              {inviteMember.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Invitation'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
