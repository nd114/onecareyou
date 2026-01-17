import { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Bell } from 'lucide-react';
import { useAlertRules, CreateAlertRuleData } from '@/hooks/useAlertRules';

interface Patient {
  id: string;
  user_id: string;
  patient_name: string;
  patient_email?: string;
}

interface CreateAlertRuleDialogProps {
  trigger: React.ReactNode;
  patients: Patient[];
  selectedPatientId?: string;
}

const VITAL_TYPES = [
  { value: 'blood_pressure', label: 'Blood Pressure' },
  { value: 'heart_rate', label: 'Heart Rate' },
  { value: 'blood_glucose', label: 'Blood Glucose' },
  { value: 'weight', label: 'Weight' },
  { value: 'temperature', label: 'Temperature' },
  { value: 'oxygen_saturation', label: 'Oxygen Saturation' },
];

const CONDITIONS = [
  { value: 'above', label: 'Above' },
  { value: 'below', label: 'Below' },
  { value: 'outside_range', label: 'Outside Range' },
];

const ALERT_METHODS = [
  { value: 'email', label: 'Email' },
  { value: 'push', label: 'Push Notification' },
];

export function CreateAlertRuleDialog({ trigger, patients, selectedPatientId }: CreateAlertRuleDialogProps) {
  const [open, setOpen] = useState(false);
  const { createAlertRule } = useAlertRules();
  
  const [formData, setFormData] = useState({
    patient_user_id: selectedPatientId || '',
    vital_type: '',
    condition: 'above',
    threshold_value: '',
    threshold_secondary: '',
    alert_method: 'email',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const selectedPatient = patients.find(p => p.user_id === formData.patient_user_id);
    
    await createAlertRule.mutateAsync({
      patient_user_id: formData.patient_user_id,
      share_id: selectedPatient?.id,
      vital_type: formData.vital_type,
      condition: formData.condition,
      threshold_value: parseFloat(formData.threshold_value),
      threshold_secondary: formData.condition === 'outside_range' && formData.threshold_secondary 
        ? parseFloat(formData.threshold_secondary) 
        : undefined,
      alert_method: formData.alert_method,
    });

    setFormData({
      patient_user_id: selectedPatientId || '',
      vital_type: '',
      condition: 'above',
      threshold_value: '',
      threshold_secondary: '',
      alert_method: 'email',
    });
    setOpen(false);
  };

  const getThresholdLabel = () => {
    switch (formData.condition) {
      case 'above': return 'Alert when above';
      case 'below': return 'Alert when below';
      case 'outside_range': return 'Minimum value';
      default: return 'Threshold';
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Create Alert Rule</DialogTitle>
          <DialogDescription>
            Set up automatic notifications when patient vitals exceed thresholds
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Patient Selection */}
          {!selectedPatientId && (
            <div className="space-y-2">
              <Label>Select Patient *</Label>
              <Select
                value={formData.patient_user_id}
                onValueChange={(value) => setFormData({ ...formData, patient_user_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a patient" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map(patient => (
                    <SelectItem key={patient.id} value={patient.user_id}>
                      {patient.patient_name || 'Unknown Patient'}
                      {patient.patient_email && ` (${patient.patient_email})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Vital Type */}
          <div className="space-y-2">
            <Label>Vital Type *</Label>
            <Select
              value={formData.vital_type}
              onValueChange={(value) => setFormData({ ...formData, vital_type: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select vital type" />
              </SelectTrigger>
              <SelectContent>
                {VITAL_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Condition */}
          <div className="space-y-2">
            <Label>Condition *</Label>
            <Select
              value={formData.condition}
              onValueChange={(value) => setFormData({ ...formData, condition: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITIONS.map(cond => (
                  <SelectItem key={cond.value} value={cond.value}>
                    {cond.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Threshold Value(s) */}
          <div className={`grid gap-4 ${formData.condition === 'outside_range' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div className="space-y-2">
              <Label htmlFor="threshold_value">{getThresholdLabel()} *</Label>
              <Input
                id="threshold_value"
                type="number"
                step="0.1"
                value={formData.threshold_value}
                onChange={(e) => setFormData({ ...formData, threshold_value: e.target.value })}
                placeholder="e.g., 140"
                required
              />
            </div>
            {formData.condition === 'outside_range' && (
              <div className="space-y-2">
                <Label htmlFor="threshold_secondary">Maximum value *</Label>
                <Input
                  id="threshold_secondary"
                  type="number"
                  step="0.1"
                  value={formData.threshold_secondary}
                  onChange={(e) => setFormData({ ...formData, threshold_secondary: e.target.value })}
                  placeholder="e.g., 180"
                  required
                />
              </div>
            )}
          </div>

          {/* Alert Method */}
          <div className="space-y-2">
            <Label>Alert Method</Label>
            <Select
              value={formData.alert_method}
              onValueChange={(value) => setFormData({ ...formData, alert_method: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALERT_METHODS.map(method => (
                  <SelectItem key={method.value} value={method.value}>
                    {method.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="gradient-primary border-0"
              disabled={createAlertRule.isPending || !formData.patient_user_id || !formData.vital_type || !formData.threshold_value}
            >
              {createAlertRule.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Bell className="h-4 w-4 mr-2" />
                  Create Rule
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
