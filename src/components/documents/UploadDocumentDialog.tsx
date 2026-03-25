import { useState } from 'react';
import { Upload, Loader2, FileText, Sparkles, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useHealthDocuments, DOCUMENT_CATEGORIES, DocumentCategory } from '@/hooks/useHealthDocuments';
import { useAIConsent } from '@/hooks/useAIConsent';
import { AIConsentDialog } from '@/components/consent/AIConsentDialog';
import { FamilyMemberSelector } from '@/components/family/FamilyMemberSelector';

export function UploadDocumentDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('other');
  const [documentDate, setDocumentDate] = useState('');
  const [notes, setNotes] = useState('');
  const [aiSummarize, setAiSummarize] = useState(false);
  const [familyMemberId, setFamilyMemberId] = useState<string | null>(null);
  const [showAiConfirm, setShowAiConfirm] = useState(false);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const { uploadDocument } = useHealthDocuments();
  const { hasConsent, checkConsentRequired, grantConsent } = useAIConsent();

  const handleAiToggle = (checked: boolean) => {
    if (checked) {
      if (checkConsentRequired()) {
        setShowConsentDialog(true);
      } else {
        setShowAiConfirm(true);
      }
    } else {
      setAiSummarize(false);
    }
  };

  const handleConsentGranted = async () => {
    await grantConsent();
    setShowConsentDialog(false);
    setShowAiConfirm(true);
  };

  const handleUpload = async () => {
    if (!file) return;
    await uploadDocument.mutateAsync({
      file,
      title: title || file.name,
      category,
      documentDate: documentDate || undefined,
      notes: notes || undefined,
      aiSummarize,
      familyMemberId,
    });
    setOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setFile(null);
    setTitle('');
    setCategory('other');
    setDocumentDate('');
    setNotes('');
    setAiSummarize(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogTrigger asChild>
          <Button>
            <Upload className="h-4 w-4 mr-2" />
            Upload Document
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Health Document</DialogTitle>
            <DialogDescription>
              Upload a prescription, lab result, discharge summary, or any health-related document.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* File Input */}
            <div>
              <Label>File</Label>
              <div className="mt-1">
                {file ? (
                  <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/50">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm truncate flex-1">{file.name}</span>
                    <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
                      Remove
                    </Button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-md p-6 cursor-pointer hover:border-primary/50 transition-colors">
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">Click to select file</span>
                    <span className="text-xs text-muted-foreground mt-1">PDF, Images, or Documents (max 20MB)</span>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Title */}
            <div>
              <Label htmlFor="doc-title">Title</Label>
              <Input
                id="doc-title"
                placeholder="e.g. Blood Test Results - March 2026"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Category */}
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as DocumentCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Document Date */}
            <div>
              <Label htmlFor="doc-date">Document Date</Label>
              <Input
                id="doc-date"
                type="date"
                value={documentDate}
                onChange={(e) => setDocumentDate(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="doc-notes">Notes (optional)</Label>
              <Textarea
                id="doc-notes"
                placeholder="Any relevant notes about this document..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            {/* AI Summarize Toggle */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">AI categorize & summarize</p>
                  <p className="text-xs text-muted-foreground">AI reads your file to auto-tag and generate a summary</p>
                </div>
              </div>
              <Switch
                checked={aiSummarize}
                onCheckedChange={handleAiToggle}
              />
            </div>

            {aiSummarize && (
              <div className="flex items-start gap-2 p-2 rounded-md bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
                <span>Your file will be securely sent to AI for analysis. It reads the document content to generate an accurate summary, category, and tags.</span>
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleUpload}
              disabled={!file || uploadDocument.isPending}
            >
              {uploadDocument.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Confirmation Dialog */}
      <AlertDialog open={showAiConfirm} onOpenChange={setShowAiConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enable AI Summarization?</AlertDialogTitle>
            <AlertDialogDescription>
              This will securely send your document to our AI service, which reads the file content 
              to generate an accurate summary, category, and tags. Your data is processed securely and not stored by the AI provider.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setAiSummarize(true); setShowAiConfirm(false); }}>
              Enable AI Summary
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI Consent Dialog */}
      <AIConsentDialog
        open={showConsentDialog}
        onOpenChange={setShowConsentDialog}
        onConsent={handleConsentGranted}
        onDecline={() => setShowConsentDialog(false)}
      />
    </>
  );
}
