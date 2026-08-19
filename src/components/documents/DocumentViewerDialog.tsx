import { useEffect, useState } from 'react';
import { Download, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HealthDocument, useHealthDocuments } from '@/hooks/useHealthDocuments';

/**
 * Reads a vault document in the platform, rather than pushing the person into a
 * browser download to find out what a file even is. Images render directly;
 * PDFs, HTML and text render in a sandboxed frame from a short-lived signed URL.
 */
export function DocumentViewerDialog({
  document: doc,
  open,
  onOpenChange,
}: {
  document: HealthDocument;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { getDownloadUrl } = useHealthDocuments();
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const mime = doc.mime_type || '';
  const isImage = mime.startsWith('image/');
  const isHtml = mime === 'text/html' || /\.html?$/i.test(doc.file_name || '');
  const isPlainText = !isHtml && (mime.startsWith('text/') || mime === 'application/json');
  const isPdf = mime === 'application/pdf';
  const canPreview = isImage || isPdf || isHtml || isPlainText;

  useEffect(() => {
    if (!open) {
      setUrl(null);
      setText(null);
      setFailed(false);
      return;
    }
    let active = true;
    getDownloadUrl(doc.file_path)
      .then(async (signed) => {
        if (!active) return;
        if (!signed) {
          setFailed(true);
          return;
        }
        setUrl(signed);
        // Storage may hand text back with a generic content type, which makes a
        // plain iframe show the markup as source. Read it and render it instead.
        if (isHtml || isPlainText) {
          try {
            const body = await fetch(signed).then((r) => r.text());
            if (active) setText(body);
          } catch {
            if (active) setText('');
          }
        }
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
    // getDownloadUrl is stable enough for this one-shot fetch per open document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc.file_path]);

  const awaitingContent = !url || ((isHtml || isPlainText) && text === null);


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b pr-12">
          <DialogTitle className="truncate text-base">{doc.title || doc.file_name}</DialogTitle>
        </DialogHeader>

        <div className="bg-muted/30 h-[70vh] flex items-center justify-center overflow-auto">
          {failed ? (
            <p className="text-sm text-muted-foreground px-6 text-center">
              This document could not be opened just now. Try downloading it instead.
            </p>
          ) : !url ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : !canPreview ? (
            <div className="text-center px-6 space-y-3">
              <p className="text-sm text-muted-foreground">
                This file type can't be shown here. You can open or download it instead.
              </p>
              <Button variant="outline" size="sm" onClick={() => window.open(url, '_blank')}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in a new tab
              </Button>
            </div>
          ) : isImage ? (
            <img
              src={url}
              alt={doc.title || doc.file_name}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <iframe
              src={url}
              title={doc.title || doc.file_name}
              className="w-full h-full bg-background"
              sandbox=""
            />
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t">
          {url && (
            <>
              <Button variant="outline" size="sm" onClick={() => window.open(url, '_blank')}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in new tab
              </Button>
              <Button size="sm" asChild>
                <a href={url} download={doc.file_name}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </a>
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
