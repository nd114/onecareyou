import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield, Brain, Lock, FileText, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface AIConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConsent: () => Promise<void>;
  onDecline: () => void;
}

export function AIConsentDialog({ open, onOpenChange, onConsent, onDecline }: AIConsentDialogProps) {
  const [accepted, setAccepted] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleConsent = async () => {
    if (!accepted) return;
    setProcessing(true);
    try {
      await onConsent();
      onOpenChange(false);
    } finally {
      setProcessing(false);
    }
  };

  const handleDecline = () => {
    onDecline();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Brain className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">AI Data Processing Consent</DialogTitle>
              <DialogDescription>Required before using AI-powered features</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[400px] pr-4">
          <div className="space-y-6">
            {/* What we process */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                What We Process
              </h4>
              <ul className="text-sm text-muted-foreground space-y-2 ml-6">
                <li>• <strong>Lab report images</strong> you upload for vital extraction</li>
                <li>• <strong>Health metrics</strong> contained in your documents</li>
                <li>• No personal identifiers (name, email, etc.) are sent to AI</li>
              </ul>
            </div>

            {/* How we protect your data */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-status-success" />
                How We Protect Your Data
              </h4>
              <ul className="text-sm text-muted-foreground space-y-2 ml-6">
                <li>• <strong>Anonymization:</strong> All data is stripped of personal identifiers before AI processing</li>
                <li>• <strong>No storage by AI:</strong> Processed data is not retained by the AI service</li>
                <li>• <strong>Encryption:</strong> All data transfers are encrypted end-to-end</li>
                <li>• <strong>Audit logging:</strong> All consent changes are logged for your records</li>
              </ul>
            </div>

            {/* Security measures */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <Lock className="h-4 w-4 text-ocean" />
                Security Measures
              </h4>
              <ul className="text-sm text-muted-foreground space-y-2 ml-6">
                <li>• Data is processed in secure, HIPAA-compliant infrastructure</li>
                <li>• Your user ID and account details are never shared with AI</li>
                <li>• You can revoke consent at any time in your settings</li>
              </ul>
            </div>

            {/* Your rights */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber" />
                Your Rights
              </h4>
              <ul className="text-sm text-muted-foreground space-y-2 ml-6">
                <li>• You can withdraw consent at any time via Settings</li>
                <li>• Request deletion of your data under GDPR, CCPA, POPIA, or PIPEDA</li>
                <li>• Access your consent history in your profile</li>
              </ul>
            </div>

            {/* Legal links */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium">Please review our policies:</p>
              <div className="flex flex-wrap gap-3 text-sm">
                <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
                <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
                <Link to="/data-processing" className="text-primary hover:underline">Data Processing Agreement</Link>
              </div>
            </div>

            {/* Consent checkbox - prominent styling */}
            <div className={cn(
              "flex items-start gap-3 p-4 rounded-lg border-2 transition-colors",
              accepted 
                ? "border-primary bg-primary/5" 
                : "border-amber-500 bg-amber-50 dark:bg-amber-950/20"
            )}>
              <Checkbox
                id="consent"
                checked={accepted}
                onCheckedChange={(checked) => setAccepted(checked as boolean)}
                className="mt-0.5 h-5 w-5"
              />
              <label htmlFor="consent" className="text-sm cursor-pointer select-none">
                <span className={cn("font-medium", !accepted && "text-amber-700 dark:text-amber-400")}>
                  {!accepted && "☑️ Check this box to continue: "}
                </span>
                I understand and consent to the processing of my health data by AI services 
                for the purpose of extracting health metrics from my lab reports. I acknowledge 
                that I can revoke this consent at any time.
              </label>
            </div>
            
            {!accepted && (
              <p className="text-sm text-amber-600 dark:text-amber-400 text-center font-medium animate-pulse">
                ↑ Please check the box above to enable the consent button
              </p>
            )}
          </div>
        </ScrollArea>

        <div className="flex gap-3 pt-4 border-t">
          <Button variant="outline" className="flex-1" onClick={handleDecline}>
            Decline
          </Button>
          <Button 
            className={cn(
              "flex-1 border-0 transition-all",
              accepted 
                ? "gradient-primary" 
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
            onClick={handleConsent}
            disabled={!accepted || processing}
          >
            {processing ? 'Processing...' : accepted ? '✓ I Consent' : 'Check box above'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
