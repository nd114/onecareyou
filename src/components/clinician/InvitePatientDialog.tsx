import { useState } from 'react';
import { UserPlus, Mail, Loader2, Send, AlertTriangle, ArrowUpRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePatientInvitations } from '@/hooks/usePatientInvitations';
import { useNavigate } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface InvitePatientDialogProps {
  trigger?: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}

export function InvitePatientDialog({ trigger, disabled, disabledReason }: InvitePatientDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const navigate = useNavigate();
  const { sendInvitation } = usePatientInvitations();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) return;

    await sendInvitation.mutateAsync({ email: email.trim(), name: name.trim() || undefined });
    setEmail('');
    setName('');
    setOpen(false);
  };

  // If disabled, show tooltip on hover
  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            {trigger || (
              <Button className="gradient-primary border-0 opacity-50 cursor-not-allowed" disabled>
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Patient
              </Button>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Patient Limit Reached</p>
              <p className="text-xs text-muted-foreground mt-1">
                {disabledReason || 'Upgrade your plan to invite more patients.'}
              </p>
              <Button 
                size="sm" 
                variant="link" 
                className="h-auto p-0 mt-1 text-xs"
                onClick={() => navigate('/clinician/pricing')}
              >
                <ArrowUpRight className="h-3 w-3 mr-1" />
                Upgrade Plan
              </Button>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gradient-primary border-0">
            <UserPlus className="h-4 w-4 mr-2" />
            Invite Patient
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Invite a Patient
            </DialogTitle>
            <DialogDescription>
              Send an invitation to a patient to connect with you on OneCare. They'll receive access to share their health data with you.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-6">
            <div className="space-y-2">
              <Label htmlFor="patient-email">Patient Email *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="patient-email"
                  type="email"
                  placeholder="patient@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="patient-name">Patient Name (Optional)</Label>
              <Input
                id="patient-name"
                placeholder="John Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Helps you identify the patient before they accept
              </p>
            </div>

            <div className="rounded-lg bg-muted/50 p-4 text-sm">
              <p className="font-medium mb-2">What happens next?</p>
              <ol className="space-y-1 text-muted-foreground list-decimal list-inside">
                <li>Patient receives an invitation notification</li>
                <li>They create an account or log in</li>
                <li>They accept and choose what to share</li>
                <li>Their data appears in your dashboard</li>
              </ol>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={!email.trim() || sendInvitation.isPending}
              className="gradient-primary border-0"
            >
              {sendInvitation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Invitation
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
