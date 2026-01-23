import { 
  History, 
  CheckCircle, 
  AlertCircle, 
  AlertTriangle,
  FileText,
  Loader2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEHRConnections, EHRConnection } from '@/hooks/useEHRConnections';
import { format } from 'date-fns';

interface EHRSyncHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: EHRConnection | null;
}

export function EHRSyncHistoryDialog({ open, onOpenChange, connection }: EHRSyncHistoryDialogProps) {
  const { useSyncLogs } = useEHRConnections();
  const { data: logs = [], isLoading } = useSyncLogs(connection?.id || '');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle className="h-3 w-3 mr-1" />Success</Badge>;
      case 'partial':
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20"><AlertTriangle className="h-3 w-3 mr-1" />Partial</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (!connection) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Sync History
          </DialogTitle>
          <DialogDescription>
            Recent synchronization activity for {connection.provider_name}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No sync history yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Sync operations will appear here once configured
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-lg border"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm capitalize">
                          {log.sync_type}
                        </span>
                        {getStatusBadge(log.status)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {log.resource_type} • {log.record_count} record{log.record_count !== 1 ? 's' : ''}
                      </p>
                      {log.error_details?.message && (
                        <p className="text-xs text-destructive">
                          {log.error_details.message}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.created_at), 'MMM d, HH:mm')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
