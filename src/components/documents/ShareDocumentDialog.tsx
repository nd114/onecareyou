import { useState, useEffect } from 'react';
import { Share2, Loader2, UserCircle, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useProviderShares } from '@/hooks/useProviderShares';
import { useDocumentShares } from '@/hooks/useDocumentShares';
import { toast } from 'sonner';

interface ShareDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentTitle: string;
}

export function ShareDocumentDialog({
  open,
  onOpenChange,
  documentId,
  documentTitle,
}: ShareDocumentDialogProps) {
  const { shares: providerShares, isLoading: loadingShares } = useProviderShares();
  const { shares: docShares, shareDocument, revokeShare, isLoading: loadingDocShares } = useDocumentShares(documentId);
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());

  const activeProviderShares = providerShares.filter(s => s.is_active);

  const isSharedWith = (providerShareId: string) => {
    return docShares.some(ds => ds.provider_share_id === providerShareId && ds.is_active);
  };

  const handleToggle = async (providerShareId: string, providerName: string) => {
    setPendingActions(prev => new Set(prev).add(providerShareId));
    try {
      if (isSharedWith(providerShareId)) {
        await revokeShare.mutateAsync({ documentId, providerShareId });
        toast.success(`Stopped sharing with ${providerName}`);
      } else {
        await shareDocument.mutateAsync({ documentId, providerShareId });
        toast.success(`Shared with ${providerName}`);
      }
    } finally {
      setPendingActions(prev => {
        const next = new Set(prev);
        next.delete(providerShareId);
        return next;
      });
    }
  };

  const isLoading = loadingShares || loadingDocShares;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            Share Document
          </DialogTitle>
          <DialogDescription>
            Choose which clinicians can view "{documentTitle}". You can revoke access at any time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeProviderShares.length === 0 ? (
            <div className="text-center py-8">
              <UserCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No clinician connections yet. Share your health data with a clinician first from your Care Circle.
              </p>
            </div>
          ) : (
            activeProviderShares.map((ps) => {
              const shared = isSharedWith(ps.id);
              const pending = pendingActions.has(ps.id);
              return (
                <button
                  key={ps.id}
                  onClick={() => handleToggle(ps.id, ps.provider_name)}
                  disabled={pending}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
                >
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-primary">
                      {ps.provider_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ps.provider_name}</p>
                    {ps.provider_email && (
                      <p className="text-xs text-muted-foreground truncate">{ps.provider_email}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : shared ? (
                      <Badge variant="default" className="text-xs gap-1">
                        <Check className="h-3 w-3" />
                        Shared
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        Not shared
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
