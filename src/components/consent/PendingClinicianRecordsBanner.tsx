import { useEffect, useState } from 'react';
import { usePendingClinicianRecords, type PendingClinicianRecord } from '@/hooks/usePendingClinicianRecords';
import { ClinicianDataConsentDialog } from '@/components/consent/ClinicianDataConsentDialog';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Renders consent dialogs for any pending clinician-imported records
 * matched to the current patient's email. Place this in authenticated layouts.
 */
export function PendingClinicianRecordsBanner() {
  const { user } = useAuth();
  const { data: pendingRecords = [] } = usePendingClinicianRecords();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Filter out dismissed records
  const activePending = pendingRecords.filter(r => !dismissed.has(r.id));
  const currentRecord = activePending[0] || null;

  const handleOpenChange = (open: boolean) => {
    if (!open && currentRecord) {
      setDismissed(prev => new Set(prev).add(currentRecord.id));
    }
  };

  if (!user || !currentRecord) return null;

  return (
    <ClinicianDataConsentDialog
      record={currentRecord}
      open={true}
      onOpenChange={handleOpenChange}
    />
  );
}
