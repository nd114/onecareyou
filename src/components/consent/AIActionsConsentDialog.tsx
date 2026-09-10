import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AIActionsConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConsent: () => Promise<void>;
}

/**
 * The second consent.
 *
 * Agreeing to *use* the assistant is not agreeing to let it *change* your
 * record. This is the separate answer, asked once, and revocable in Settings.
 * Nothing is ever written without an Approve tap either — this only decides
 * whether the assistant may prepare a change at all.
 */
export function AIActionsConsentDialog({ open, onOpenChange, onConsent }: AIActionsConsentDialogProps) {
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleConsent = async () => {
    if (!accepted) return;
    setSaving(true);
    try {
      await onConsent();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-lg">Let the assistant prepare changes?</DialogTitle>
              <DialogDescription>You still approve every single one</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ul className="text-sm text-muted-foreground space-y-2">
          <li>• You can say "my blood pressure was 115 over 70" and it will prepare the entry for you.</li>
          <li>• Nothing is saved until you tap <strong>Approve</strong> on the request it shows you.</li>
          <li>• It can prepare readings, medicines, reminder times and marking a dose as taken.</li>
          <li>• It never changes a dose or prescribes anything, and you can turn this off in Settings.</li>
        </ul>

        <div className={cn(
          'flex items-start gap-3 p-3 rounded-lg border-2 transition-colors',
          accepted ? 'border-primary bg-primary/5' : 'border-border',
        )}>
          <Checkbox
            id="ai-actions-consent"
            checked={accepted}
            onCheckedChange={(checked) => setAccepted(checked as boolean)}
            className="mt-0.5"
          />
          <label htmlFor="ai-actions-consent" className="text-sm cursor-pointer select-none">
            I agree that the assistant may prepare changes to my record for me to approve.
          </label>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button className="flex-1" disabled={!accepted || saving} onClick={handleConsent}>
            {saving ? 'Saving…' : 'Turn it on'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
