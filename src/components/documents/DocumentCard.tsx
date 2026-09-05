import { useState } from 'react';
import { format } from 'date-fns';
import { CARE_RECORD_SOURCE } from '@/hooks/useCareRecordSnapshot';
import { FileText, Download, Archive, ArchiveRestore, Sparkles, Calendar, Tag, Upload, Loader2, Share2, Users, HeartHandshake, Lock, Eye, FolderInput, Folder, Check, Stethoscope } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { HealthDocument, DOCUMENT_CATEGORIES, useHealthDocuments } from '@/hooks/useHealthDocuments';
import { useAIConsent } from '@/hooks/useAIConsent';
import { AIConsentDialog } from '@/components/consent/AIConsentDialog';
import { ShareDocumentDialog } from '@/components/documents/ShareDocumentDialog';
import { DocumentViewerDialog } from '@/components/documents/DocumentViewerDialog';
import { useDocumentShares } from '@/hooks/useDocumentShares';


interface DocumentCardProps {
  document: HealthDocument;
  isPremium?: boolean;
  /**
   * Folder names that exist but hold nothing yet. Folders are derived from the
   * documents in them, so a freshly named one is invisible here — and then the
   * only way to fill it is missing from this menu.
   */
  extraFolders?: string[];
}

export function DocumentCard({ document: doc, isPremium = false, extraFolders = [] }: DocumentCardProps) {
  const { archiveDocument, restoreDocument, getDownloadUrl, triggerSummarize, folders: usedFolders, moveToFolder } =
    useHealthDocuments();
  const folders = [...usedFolders, ...extraFolders.filter((f) => !usedFolders.includes(f))].sort(
    (a, b) => a.localeCompare(b),
  );
  // The page decides whether archived documents are shown at all; the card
  // only has to offer the right action.
  const isArchived = Boolean(doc.archived_at);
  // Care records are legal artefacts: preserved, never deletable by either party.
  const isCareRecord = doc.source_context === CARE_RECORD_SOURCE || doc.category === 'care_record';
  const { hasConsent, checkConsentRequired, grantConsent } = useAIConsent();
  const { allShareCounts } = useDocumentShares();
  const [downloading, setDownloading] = useState(false);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showViewer, setShowViewer] = useState(false);

  const shareCount = allShareCounts[doc.id] || 0;

  const categoryInfo = DOCUMENT_CATEGORIES.find((c) => c.value === doc.category) || DOCUMENT_CATEGORIES[DOCUMENT_CATEGORIES.length - 1];

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const url = await getDownloadUrl(doc.file_path, doc.file_name);
      if (url) {
        // A real download rather than window.open: the signed URL now carries
        // Content-Disposition: attachment, so the file is saved under its own
        // name instead of being rendered in a tab.
        const link = window.document.createElement('a');
        link.href = url;
        link.download = doc.file_name;
        window.document.body.appendChild(link);
        link.click();
        window.document.body.removeChild(link);
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleSummarize = () => {
    if (checkConsentRequired()) {
      setShowConsentDialog(true);
      return;
    }
    triggerSummarize.mutate(doc.id);
  };

  const handleConsentGranted = async () => {
    await grantConsent();
    setShowConsentDialog(false);
    triggerSummarize.mutate(doc.id);
  };

  return (
    <>
      <Card className="group hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setShowViewer(true)}
                    className="text-left w-full"
                    title="View this document"
                  >
                    <h3 className="font-medium text-sm truncate hover:text-primary transition-colors">
                      {doc.title || doc.file_name}
                    </h3>
                  </button>

                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="secondary" className={`text-xs ${categoryInfo.color}`}>
                      {categoryInfo.label}
                    </Badge>
                    {isCareRecord && (
                      <Badge variant="outline" className="text-[10px] h-5 gap-1">
                        <Lock className="h-2.5 w-2.5" />
                        Permanent record
                      </Badge>
                    )}
                    {doc.folder && (
                      <Badge variant="outline" className="text-[10px] h-5 gap-1">
                        <Folder className="h-2.5 w-2.5" />
                        {doc.folder}
                      </Badge>
                    )}
                    {doc.source_context === 'vitals_upload' && (
                      <Badge variant="outline" className="text-[10px] h-5 gap-1">
                        <Upload className="h-2.5 w-2.5" />
                        From Vitals
                      </Badge>
                    )}
                    {/* A document you did not upload yourself needs to say so.
                        Finding an unexplained file in your own Vault is worse
                        than not having it. */}
                    {doc.source_context === 'clinician_upload' && (
                      <Badge variant="outline" className="text-[10px] h-5 gap-1">
                        <Stethoscope className="h-2.5 w-2.5" />
                        From your clinician
                      </Badge>
                    )}
                    {/* Two different dates, and conflating them loses the one
                        that matters clinically. The document's own date is when
                        the test was taken or the letter written; the upload date
                        is when it reached the Vault. A result from March filed
                        in August is a normal thing that should not look like a
                        result from August. */}
                    {doc.document_date && (
                      <span
                        className="text-xs text-muted-foreground flex items-center gap-1"
                        title="Date on the document"
                      >
                        <Calendar className="h-3 w-3" />
                        {format(new Date(doc.document_date), 'MMM d, yyyy')}
                      </span>
                    )}
                    {doc.created_at &&
                      (!doc.document_date ||
                        new Date(doc.created_at).toDateString() !==
                          new Date(doc.document_date).toDateString()) && (
                        <span
                          className="text-xs text-muted-foreground flex items-center gap-1"
                          title="When this was added to your Health Vault"
                        >
                          <Upload className="h-3 w-3" />
                          Added {format(new Date(doc.created_at), 'MMM d, yyyy')}
                        </span>
                      )}
                    {/* Shared badge */}
                    {shareCount > 0 && (
                      <button onClick={() => setShowShareDialog(true)}>
                        <Badge variant="outline" className="text-[10px] h-5 gap-1 cursor-pointer hover:bg-muted">
                          <Users className="h-2.5 w-2.5" />
                          Shared with {shareCount}
                        </Badge>
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowViewer(true)} title="View">
                    <Eye className="h-4 w-4" />
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Move to folder">
                        <FolderInput className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Move to folder</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => moveToFolder.mutate({ ids: [doc.id], folder: null })}
                        className="gap-2"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Unfiled
                        {!doc.folder && <Check className="h-3.5 w-3.5 ml-auto" />}
                      </DropdownMenuItem>
                      {folders.map((f) => (
                        <DropdownMenuItem
                          key={f}
                          onClick={() => moveToFolder.mutate({ ids: [doc.id], folder: f })}
                          className="gap-2"
                        >
                          <Folder className="h-3.5 w-3.5" />
                          <span className="truncate">{f}</span>
                          {doc.folder === f && <Check className="h-3.5 w-3.5 ml-auto" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowShareDialog(true)} title="Share">
                    <Share2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownload} disabled={downloading}>
                    <Download className="h-4 w-4" />
                  </Button>
                  {isCareRecord ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      disabled
                      title="Care records are preserved permanently"
                    >
                      <Lock className="h-4 w-4" />
                    </Button>
                  ) : isArchived ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Restore to your Vault"
                      onClick={() => restoreDocument.mutate(doc)}
                      disabled={restoreDocument.isPending}
                    >
                      <ArchiveRestore className="h-4 w-4" />
                    </Button>
                  ) : (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Archive">
                          <Archive className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Archive this document?</AlertDialogTitle>
                          {/* Nothing is destroyed, so the copy should not imply it is.
                              What actually changes is who can see it. */}
                          <AlertDialogDescription>
                            "{doc.title || doc.file_name}" moves out of your Vault and stops being
                            included when you share your whole Vault with a clinic. Nothing is
                            deleted, and you can restore it at any time.
                            {shareCount > 0 && (
                              <>
                                {' '}
                                It stays visible to the {shareCount === 1 ? 'person' : 'people'} you
                                shared this exact document with — to change that, remove the share.
                              </>
                            )}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => archiveDocument.mutate({ doc })}>
                            Archive
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>

              {/* AI Summary */}
              {doc.ai_summary && (
                <div className="mt-2 p-2 rounded-md bg-muted/50 border border-border/50">
                  <div className="flex items-center gap-1 mb-1">
                    <Sparkles className="h-3 w-3 text-primary" />
                    <span className="text-xs font-medium text-primary">AI Summary</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                    {doc.ai_summary}
                  </p>
                </div>
              )}

              {/* Patient-friendly plain-language explanation */}
              {(doc as any).patient_friendly_explanation && (
                <div className="mt-2 p-2 rounded-md bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-1 mb-1">
                    <HeartHandshake className="h-3 w-3 text-primary" />
                    <span className="text-xs font-medium text-primary">What this means for you</span>
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed">
                    {(doc as any).patient_friendly_explanation}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1.5 italic">
                    General information only — not medical advice. Talk to your clinician about next steps.
                  </p>
                </div>
              )}

              {/* Summarize with AI button for docs without summary */}
              {!doc.ai_summary && isPremium && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 h-7 text-xs gap-1"
                  onClick={handleSummarize}
                  disabled={triggerSummarize.isPending}
                >
                  {triggerSummarize.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Summarize with AI
                </Button>
              )}

              {/* AI Tags */}
              {doc.ai_tags && doc.ai_tags.length > 0 && (
                <div className="mt-2 flex items-center gap-1 flex-wrap">
                  <Tag className="h-3 w-3 text-muted-foreground" />
                  {doc.ai_tags.slice(0, 5).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[10px] h-5">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {doc.notes && (
                <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{doc.notes}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <AIConsentDialog
        open={showConsentDialog}
        onOpenChange={setShowConsentDialog}
        onConsent={handleConsentGranted}
        onDecline={() => setShowConsentDialog(false)}
      />

      <ShareDocumentDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        documentId={doc.id}
        documentTitle={doc.title || doc.file_name}
      />

      <DocumentViewerDialog
        document={doc}
        open={showViewer}
        onOpenChange={setShowViewer}
      />

    </>
  );
}
