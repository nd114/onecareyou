import { useState } from 'react';
import { 
  Link2, 
  Plus, 
  RefreshCw, 
  Trash2, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  ExternalLink,
  Settings,
  Loader2,
  Settings2,
  History,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
} from '@/components/ui/alert-dialog';
import { useEHRConnections, EHRConnection } from '@/hooks/useEHRConnections';
import { EHRConfigDialog } from './EHRConfigDialog';
import { EHRSyncHistoryDialog } from './EHRSyncHistoryDialog';
import { formatDistanceToNow } from 'date-fns';
import { useClinicianSubscription } from '@/hooks/useClinicianSubscription';
import { useNavigate } from 'react-router-dom';

export function EHRConnectionsSection() {
  const navigate = useNavigate();
  const { connections, isLoading, createConnection, deleteConnection, updateConnection, providers } = useEHRConnections();
  const { tier } = useClinicianSubscription();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [configConnection, setConfigConnection] = useState<EHRConnection | null>(null);
  const [historyConnection, setHistoryConnection] = useState<EHRConnection | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const isEnterprise = tier === 'enterprise';

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle className="h-3 w-3 mr-1" />Connected</Badge>;
      case 'syncing':
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20"><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Syncing</Badge>;
      case 'error':
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Error</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending Setup</Badge>;
    }
  };

  const handleAddConnection = async (providerType: string, providerName: string) => {
    await createConnection.mutateAsync({ providerType, providerName });
    setShowAddDialog(false);
  };

  const handleDeleteConnection = async (connectionId: string) => {
    await deleteConnection.mutateAsync(connectionId);
    setDeleteConfirm(null);
  };

  // Filter providers based on tier - Enterprise gets FHIR integrations
  const availableProviders = providers.map(p => ({
    ...p,
    available: p.id === 'manual_import' || (isEnterprise && p.id !== 'manual_import'),
  }));

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              EHR Integrations
            </CardTitle>
            <CardDescription>
              Connect external EHR systems for bidirectional data sync
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Connection
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : connections.length === 0 ? (
          <div className="text-center py-8">
            <Link2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">No EHR Connections</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Connect your practice's EHR system to sync patient data automatically
            </p>
            <Button 
              onClick={() => setShowAddDialog(true)}
              className="gradient-primary border-0"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Connection
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {connections.map((connection) => (
              <div
                key={connection.id}
                className="p-4 rounded-lg border hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{connection.provider_name}</p>
                      {getStatusBadge(connection.sync_status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {providers.find(p => p.id === connection.provider_type)?.description || connection.provider_type}
                    </p>
                    {connection.fhir_base_url && (
                      <p className="text-xs text-muted-foreground font-mono truncate max-w-md">
                        {connection.fhir_base_url}
                      </p>
                    )}
                    {connection.last_sync_at && (
                      <p className="text-xs text-muted-foreground">
                        Last synced {formatDistanceToNow(new Date(connection.last_sync_at))} ago
                      </p>
                    )}
                    {connection.error_message && (
                      <p className="text-xs text-destructive">{connection.error_message}</p>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Configure Button - for FHIR connections */}
                    {connection.provider_type !== 'manual_import' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConfigConnection(connection)}
                        title="Configure connection"
                      >
                        <Settings2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                    
                    {/* Sync History Button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setHistoryConnection(connection)}
                      title="View sync history"
                    >
                      <History className="h-4 w-4 text-muted-foreground" />
                    </Button>

                    {/* Active Toggle */}
                    <Switch
                      checked={connection.is_active}
                      onCheckedChange={(checked) => 
                        updateConnection.mutate({ 
                          connectionId: connection.id, 
                          updates: { is_active: checked } 
                        })
                      }
                    />
                    
                    {/* Delete Button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteConfirm(connection.id)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Enterprise Notice - show if not enterprise */}
        {!isEnterprise && (
          <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-start gap-3">
              <Settings className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Full EHR Integration Available</p>
                <p className="text-xs text-muted-foreground mt-1">
                  FHIR-based integrations with Veradigm, HealthBridge, and other EHR systems 
                  are available for Enterprise subscribers with a signed BAA.
                </p>
                <Button 
                  variant="link" 
                  size="sm" 
                  className="h-auto p-0 mt-2 text-xs"
                  onClick={() => navigate('/clinician/pricing')}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Upgrade to Enterprise
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      {/* Add Connection Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add EHR Connection</DialogTitle>
            <DialogDescription>
              Choose an EHR provider to connect with your OneCare account
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 py-4">
            {availableProviders.map((provider) => (
              <button
                key={provider.id}
                className={`w-full p-4 rounded-lg border text-left transition-colors ${
                  provider.available 
                    ? 'hover:border-primary hover:bg-primary/5 cursor-pointer' 
                    : 'opacity-50 cursor-not-allowed'
                }`}
                onClick={() => provider.available && handleAddConnection(provider.id, provider.name)}
                disabled={!provider.available || createConnection.isPending}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{provider.name}</p>
                    <p className="text-sm text-muted-foreground">{provider.description}</p>
                  </div>
                  {!provider.available && (
                    <Badge variant="secondary">Enterprise</Badge>
                  )}
                  {provider.available && createConnection.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {provider.available && !createConnection.isPending && (
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Config Dialog */}
      <EHRConfigDialog
        open={!!configConnection}
        onOpenChange={(open) => !open && setConfigConnection(null)}
        connection={configConnection}
        onConnectionUpdated={() => {}}
      />

      {/* Sync History Dialog */}
      <EHRSyncHistoryDialog
        open={!!historyConnection}
        onOpenChange={(open) => !open && setHistoryConnection(null)}
        connection={historyConnection}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete EHR Connection?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the EHR connection and all sync history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && handleDeleteConnection(deleteConfirm)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Connection
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
