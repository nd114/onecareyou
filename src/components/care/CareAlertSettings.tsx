import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, Mail, Plus, Trash2, Edit, Loader2, AlertTriangle, Check, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCareAlerts, CareAlertSetting } from '@/hooks/useCareAlerts';
import { format } from 'date-fns';

export function CareAlertSettings() {
  const { 
    alertSettings, 
    alertLogs,
    loadingSettings, 
    createAlertSetting, 
    updateAlertSetting, 
    deleteAlertSetting,
    toggleAlertSetting 
  } = useCareAlerts();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingSetting, setEditingSetting] = useState<CareAlertSetting | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    alert_recipient_name: '',
    alert_recipient_email: '',
    missed_dose_threshold: 2,
    notify_by_email: true,
    notify_by_push: false,
  });

  const resetForm = () => {
    setFormData({
      alert_recipient_name: '',
      alert_recipient_email: '',
      missed_dose_threshold: 2,
      notify_by_email: true,
      notify_by_push: false,
    });
  };

  const handleOpenAdd = () => {
    resetForm();
    setShowAddDialog(true);
  };

  const handleOpenEdit = (setting: CareAlertSetting) => {
    setFormData({
      alert_recipient_name: setting.alert_recipient_name,
      alert_recipient_email: setting.alert_recipient_email,
      missed_dose_threshold: setting.missed_dose_threshold,
      notify_by_email: setting.notify_by_email,
      notify_by_push: setting.notify_by_push,
    });
    setEditingSetting(setting);
  };

  const handleSave = async () => {
    if (editingSetting) {
      await updateAlertSetting.mutateAsync({
        id: editingSetting.id,
        ...formData,
      });
      setEditingSetting(null);
    } else {
      await createAlertSetting.mutateAsync({
        ...formData,
        is_active: true,
        family_member_id: null,
      });
      setShowAddDialog(false);
    }
    resetForm();
  };

  const handleDelete = async () => {
    if (deletingId) {
      await deleteAlertSetting.mutateAsync(deletingId);
      setDeletingId(null);
    }
  };

  const handleToggle = async (setting: CareAlertSetting) => {
    await toggleAlertSetting.mutateAsync({
      id: setting.id,
      isActive: !setting.is_active,
    });
  };

  const isFormValid = formData.alert_recipient_name && formData.alert_recipient_email && 
    (formData.notify_by_email || formData.notify_by_push);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                Care Alerts
              </CardTitle>
              <CardDescription>
                Notify family members when you miss multiple medication doses
              </CardDescription>
            </div>
            <Button onClick={handleOpenAdd} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Alert
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingSettings ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : alertSettings.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-2">No Care Alerts Set Up</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add family members or caregivers to receive alerts when you miss doses
              </p>
              <Button onClick={handleOpenAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Alert
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {alertSettings.map((setting) => (
                <motion.div
                  key={setting.id}
                  layout
                  className={`p-4 rounded-lg border ${
                    setting.is_active ? 'bg-card' : 'bg-muted/50 opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium truncate">{setting.alert_recipient_name}</h4>
                        {setting.is_active ? (
                          <Badge variant="default" className="text-xs">Active</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Paused</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {setting.alert_recipient_email}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          After {setting.missed_dose_threshold} missed dose{setting.missed_dose_threshold !== 1 ? 's' : ''}
                        </span>
                        {setting.notify_by_email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            Email
                          </span>
                        )}
                        {setting.notify_by_push && (
                          <span className="flex items-center gap-1">
                            <Bell className="h-3 w-3" />
                            Push
                          </span>
                        )}
                      </div>
                      {setting.last_alert_sent_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Last alert: {format(new Date(setting.last_alert_sent_at), 'MMM d, h:mm a')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={setting.is_active}
                        onCheckedChange={() => handleToggle(setting)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEdit(setting)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeletingId(setting.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Alert Log */}
      {alertLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Alerts Sent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alertLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="flex items-center justify-between text-sm p-2 rounded bg-muted/50">
                  <div>
                    <span className="font-medium">{log.recipient_email}</span>
                    <span className="text-muted-foreground ml-2">
                      ({log.missed_count} missed doses)
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(log.sent_at), 'MMM d, h:mm a')}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog 
        open={showAddDialog || !!editingSetting} 
        onOpenChange={(open) => {
          if (!open) {
            setShowAddDialog(false);
            setEditingSetting(null);
            resetForm();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingSetting ? 'Edit Care Alert' : 'Add Care Alert'}
            </DialogTitle>
            <DialogDescription>
              {editingSetting 
                ? 'Update the care alert settings'
                : 'Set up a new alert recipient to notify when you miss doses'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Recipient Name</Label>
              <Input
                id="name"
                placeholder="e.g., Mom, Dr. Smith, Caregiver"
                value={formData.alert_recipient_name}
                onChange={(e) => setFormData(prev => ({ ...prev, alert_recipient_name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Recipient Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@example.com"
                value={formData.alert_recipient_email}
                onChange={(e) => setFormData(prev => ({ ...prev, alert_recipient_email: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="threshold">Alert After Missed Doses</Label>
              <Select
                value={formData.missed_dose_threshold.toString()}
                onValueChange={(value) => setFormData(prev => ({ ...prev, missed_dose_threshold: parseInt(value) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 missed dose</SelectItem>
                  <SelectItem value="2">2 missed doses</SelectItem>
                  <SelectItem value="3">3 missed doses</SelectItem>
                  <SelectItem value="5">5 missed doses</SelectItem>
                  <SelectItem value="10">10 missed doses</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                An alert will be sent when this many doses are missed in a day
              </p>
            </div>

            <div className="space-y-3">
              <Label>Notification Method</Label>
              <div className="space-y-2">
                <label className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>Email</span>
                  </div>
                  <Switch
                    checked={formData.notify_by_email}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, notify_by_email: checked }))}
                  />
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDialog(false);
                setEditingSetting(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!isFormValid || createAlertSetting.isPending || updateAlertSetting.isPending}
            >
              {(createAlertSetting.isPending || updateAlertSetting.isPending) ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              {editingSetting ? 'Update' : 'Create'} Alert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Care Alert</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this care alert? The recipient will no longer be notified when you miss doses.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
