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
  Loader2
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
import { useEHRConnections, EHR_PROVIDERS } from '@/hooks/useEHRConnections';
import { formatDistanceToNow } from 'date-fns';

export function EHRConnectionsSection() {
  const { connections, isLoading, createConnection, deleteConnection, updateConnection, providers } = useEHRConnections();
  const [showAddDialog, setShowAddDialog] = useState(false);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle className="h-3 w-3 mr-1" />Connected</Badge>;
      case 'syncing':
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20"><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Syncing</Badge>;
      case 'error':
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Error</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  const handleAddConnection = async (providerType: string, providerName: string) => {
    await createConnection.mutateAsync({ providerType, providerName });
    setShowAddDialog(false);
  };

  return (
    <Card>
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
                    <Switch
                      checked={connection.is_active}
                      onCheckedChange={(checked) => 
                        updateConnection.mutate({ 
                          connectionId: connection.id, 
                          updates: { is_active: checked } 
                        })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteConnection.mutate(connection.id)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Coming Soon Notice */}
        <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-dashed">
          <div className="flex items-start gap-3">
            <Settings className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium text-sm">EHR Integration Coming Soon</p>
              <p className="text-xs text-muted-foreground mt-1">
                Full FHIR-based integrations with Veradigm, HealthBridge, and other EHR systems are in development. 
                Currently, you can use manual import for patient data.
              </p>
            </div>
          </div>
        </div>
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
            {providers.map((provider) => (
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
                    <Badge variant="secondary">Coming Soon</Badge>
                  )}
                  {provider.available && (
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
    </Card>
  );
}
