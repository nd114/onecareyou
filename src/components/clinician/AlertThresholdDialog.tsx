import { useState } from 'react';
import { 
  Bell, 
  Plus, 
  Trash2, 
  ToggleLeft, 
  ToggleRight,
  Heart,
  Activity,
  Droplets,
  Scale,
  Thermometer
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAlertRules, AlertRule } from '@/hooks/useAlertRules';

interface AlertThresholdDialogProps {
  patientUserId: string;
  shareId: string;
  patientName: string;
  trigger?: React.ReactNode;
}

const VITAL_TYPES = [
  { value: 'blood_pressure', label: 'Blood Pressure', icon: Heart, unit: 'mmHg', hasSecondary: true },
  { value: 'heart_rate', label: 'Heart Rate', icon: Activity, unit: 'bpm', hasSecondary: false },
  { value: 'blood_glucose', label: 'Blood Glucose', icon: Droplets, unit: 'mg/dL', hasSecondary: false },
  { value: 'weight', label: 'Weight', icon: Scale, unit: 'kg', hasSecondary: false },
  { value: 'temperature', label: 'Temperature', icon: Thermometer, unit: '°C', hasSecondary: false },
  { value: 'oxygen_saturation', label: 'Oxygen Saturation', icon: Activity, unit: '%', hasSecondary: false },
];

const CONDITIONS = [
  { value: 'above', label: 'Above' },
  { value: 'below', label: 'Below' },
  { value: 'outside_range', label: 'Outside Range' },
];

export function AlertThresholdDialog({ 
  patientUserId, 
  shareId, 
  patientName,
  trigger 
}: AlertThresholdDialogProps) {
  const [open, setOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // Form state
  const [vitalType, setVitalType] = useState('');
  const [condition, setCondition] = useState('above');
  const [thresholdValue, setThresholdValue] = useState('');
  const [thresholdSecondary, setThresholdSecondary] = useState('');
  const [alertMethod, setAlertMethod] = useState('email');

  const { 
    alertRules, 
    createAlertRule, 
    deleteAlertRule, 
    toggleAlertRule,
    isLoading 
  } = useAlertRules(patientUserId);

  const patientRules = alertRules.filter(r => r.patient_user_id === patientUserId);

  const resetForm = () => {
    setVitalType('');
    setCondition('above');
    setThresholdValue('');
    setThresholdSecondary('');
    setAlertMethod('email');
    setIsCreating(false);
  };

  const handleCreate = async () => {
    if (!vitalType || !thresholdValue) return;

    await createAlertRule.mutateAsync({
      patient_user_id: patientUserId,
      share_id: shareId,
      vital_type: vitalType,
      condition,
      threshold_value: parseFloat(thresholdValue),
      threshold_secondary: thresholdSecondary ? parseFloat(thresholdSecondary) : undefined,
      alert_method: alertMethod,
    });

    resetForm();
  };

  const getVitalConfig = (type: string) => {
    return VITAL_TYPES.find(v => v.value === type) || { 
      label: type.replace('_', ' '), 
      icon: Activity, 
      unit: '', 
      hasSecondary: false 
    };
  };

  const formatRuleDescription = (rule: AlertRule) => {
    const config = getVitalConfig(rule.vital_type);
    if (rule.condition === 'outside_range' && rule.threshold_secondary) {
      return `${rule.threshold_value}–${rule.threshold_secondary} ${config.unit}`;
    }
    return `${rule.condition} ${rule.threshold_value}${rule.threshold_secondary ? `/${rule.threshold_secondary}` : ''} ${config.unit}`;
  };

  const selectedVitalConfig = VITAL_TYPES.find(v => v.value === vitalType);
  const showSecondaryInput = condition === 'outside_range' || selectedVitalConfig?.hasSecondary;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Bell className="h-4 w-4 mr-2" />
            Alert Thresholds
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Alert Thresholds
          </DialogTitle>
          <DialogDescription>
            Set custom alerts for {patientName}'s vitals
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Existing Rules */}
          {patientRules.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {patientRules.map((rule) => {
                  const config = getVitalConfig(rule.vital_type);
                  const Icon = config.icon;
                  
                  return (
                    <div 
                      key={rule.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        rule.is_active ? 'bg-card' : 'bg-muted/50 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium capitalize">{config.label}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {formatRuleDescription(rule)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => toggleAlertRule.mutate({ 
                            id: rule.id, 
                            is_active: !rule.is_active 
                          })}
                        >
                          {rule.is_active ? (
                            <ToggleRight className="h-5 w-5 text-green-500" />
                          ) : (
                            <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => deleteAlertRule.mutate(rule.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Create New Rule */}
          {isCreating ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">New Alert Rule</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Vital Type</Label>
                  <Select value={vitalType} onValueChange={setVitalType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vital type" />
                    </SelectTrigger>
                    <SelectContent>
                      {VITAL_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <type.icon className="h-4 w-4" />
                            {type.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Condition</Label>
                  <Select value={condition} onValueChange={setCondition}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONDITIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>
                      {condition === 'outside_range' ? 'Min Value' : 
                       selectedVitalConfig?.hasSecondary ? 'Systolic' : 'Threshold'}
                    </Label>
                    <Input
                      type="number"
                      value={thresholdValue}
                      onChange={(e) => setThresholdValue(e.target.value)}
                      placeholder={selectedVitalConfig?.unit || ''}
                    />
                  </div>
                  {showSecondaryInput && (
                    <div className="space-y-2">
                      <Label>
                        {condition === 'outside_range' ? 'Max Value' : 'Diastolic'}
                      </Label>
                      <Input
                        type="number"
                        value={thresholdSecondary}
                        onChange={(e) => setThresholdSecondary(e.target.value)}
                        placeholder={selectedVitalConfig?.unit || ''}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Alert Method</Label>
                  <Select value={alertMethod} onValueChange={setAlertMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="push">Push Notification</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={resetForm}
                  >
                    Cancel
                  </Button>
                  <Button 
                    className="flex-1 gradient-primary border-0"
                    onClick={handleCreate}
                    disabled={!vitalType || !thresholdValue || createAlertRule.isPending}
                  >
                    Create Alert
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setIsCreating(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Alert Rule
            </Button>
          )}

          {patientRules.length === 0 && !isCreating && (
            <div className="text-center py-6 text-muted-foreground">
              <Bell className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No alerts configured</p>
              <p className="text-xs mt-1">
                Create alerts to be notified when vitals are outside expected ranges
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}