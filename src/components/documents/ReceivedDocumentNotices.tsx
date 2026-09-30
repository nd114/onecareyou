import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePatientNotices } from '@/hooks/useOffboarding';

/**
 * "St Elsewhere General sent you a document: …", at the top of the Vault.
 *
 * Documents a clinic or clinician sends go straight into the Vault. Without a
 * notice the patient would find them only by scrolling, and the header bell
 * that also carries these is hidden on a phone, which is where most patients
 * open the Vault. Written by tell_patient_of_document (20261010140000).
 */
export function ReceivedDocumentNotices() {
  const { notices, markSeen } = usePatientNotices();
  const unseen = notices.filter((n) => !n.seenAt && n.noticeType === 'document_received');
  if (unseen.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      {unseen.map((notice) => (
        <div
          key={notice.id}
          role="status"
          className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3"
        >
          <div className="flex gap-2 min-w-0">
            <FileText className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-sm break-words">{notice.message}</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={markSeen.isPending}
            onClick={() => markSeen.mutate(notice.id)}
          >
            Got it
          </Button>
        </div>
      ))}
    </div>
  );
}
