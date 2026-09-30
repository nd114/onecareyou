import { useCallback } from 'react';
import { HealthDocument, useHealthDocuments } from '@/hooks/useHealthDocuments';
import { FileViewerDialog } from '@/components/documents/FileViewer';

/**
 * A Vault document (including care records) in the shared viewer. The signed
 * URL is requested when the dialog opens, not when the card renders.
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
  const { getPreviewUrl } = useHealthDocuments();
  const loadSource = useCallback(async () => {
    const url = await getPreviewUrl(doc.file_path);
    return url ? { url, fileName: doc.file_name, mimeType: doc.mime_type } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.file_path, doc.file_name, doc.mime_type]);

  return (
    <FileViewerDialog
      open={open}
      onOpenChange={onOpenChange}
      title={doc.title || doc.file_name}
      fileName={doc.file_name}
      mimeType={doc.mime_type}
      loadSource={loadSource}
    />
  );
}
