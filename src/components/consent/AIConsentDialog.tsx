import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield, Brain, Lock, FileText, AlertTriangle, Eye, Smartphone } from 'lucide-react';
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

        <ScrollArea className="flex-1 max-h-[320px] pr-4">
          <div className="space-y-6">
            {/* AI Features overview */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                AI Features on OneCare
              </h4>
              <p className="text-sm text-muted-foreground">
                OneCare uses AI in several ways. By consenting below, you enable all current and future AI features:
              </p>
            </div>

            {/* Feature 1: AI Q&A Assistant */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <h4 className="font-semibold text-sm">AI Q&A Assistant</h4>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1 ml-6">
                <li>• Ask general health education questions (e.g., "What is HbA1c?")</li>
                <li>• Get help navigating the platform</li>
                <li>• <strong>No personal health data</strong> is sent — only your question text</li>
                <li>• Never provides diagnosis or treatment advice</li>
              </ul>
            </div>

            {/* Feature 2: Voice Input */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-primary" />
                <h4 className="font-semibold text-sm">Voice Input & Navigation</h4>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1 ml-6">
                <li>• Speak questions instead of typing</li>
                <li>• Voice is processed <strong>locally in your browser</strong> (Web Speech API)</li>
                <li>• Only the transcribed text is sent to AI — no audio is stored</li>
              </ul>
            </div>

            {/* Feature 3: Vitals Extraction — Anonymized */}
            <div className="rounded-lg border border-status-success/30 bg-status-success/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-status-success" />
                <h4 className="font-semibold text-sm">Vitals Extraction (Anonymized)</h4>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1 ml-6">
                <li>• Lab report images are scanned <strong>on your device</strong> using local OCR</li>
                <li>• The raw image never leaves your device</li>
                <li>• Extracted text is passed through PII-stripping filters</li>
                <li>• Only anonymized text with health values is sent to AI</li>
              </ul>
              <p className="text-xs text-muted-foreground italic ml-6">
                ⚠️ PII-stripping uses pattern matching and may not catch every identifier.
              </p>
            </div>

            {/* Feature 4: Vault — Full file */}
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <h4 className="font-semibold text-sm">Health Vault Summarization (Full Document)</h4>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1 ml-6">
                <li>• When you opt to use AI on a Health Vault document, the <strong>actual file</strong> is sent for analysis</li>
                <li>• Required for accurate summarization and categorization</li>
                <li>• No account identifiers (user ID, email) are sent alongside the file</li>
              </ul>
            </div>

            {/* How we protect your data */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-status-success" />
                How We Protect Your Data
              </h4>
              <ul className="text-sm text-muted-foreground space-y-2 ml-6">
                <li>• <strong>No storage by AI:</strong> Processed data is not retained by the AI service</li>
                <li>• <strong>Encryption:</strong> All data transfers are encrypted in transit</li>
                <li>• <strong>Audit logging:</strong> All consent changes are logged for your records</li>
                <li>• <strong>No training:</strong> Your data is never used to train AI models</li>
              </ul>
            </div>

            {/* Your Rights */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <Lock className="h-4 w-4 text-ocean" />
                Your Rights
              </h4>
              <ul className="text-sm text-muted-foreground space-y-2 ml-6">
                <li>• <strong>Revoke anytime:</strong> You can turn off AI processing at any time in Settings</li>
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
          </div>
        </ScrollArea>

        {/* Consent checkbox — OUTSIDE ScrollArea so always visible */}
        <div className="space-y-3 pt-4 border-t">
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
              I understand that AI features include the Q&A assistant, voice navigation, 
              vitals extraction, and document summarization. I consent to all AI features 
              described above and acknowledge that I can revoke this consent at any time 
              in Settings.
            </label>
          </div>
        </div>

        <div className="flex gap-3 pt-3">
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
