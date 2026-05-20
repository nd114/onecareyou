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
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { useClinicianGuidance, CreateGuidanceData } from '@/hooks/useClinicianGuidance';

interface Patient {
  id: string;
  user_id: string;
  patient_name: string;
  patient_email?: string;
}

interface CreateGuidanceDialogProps {
  trigger: React.ReactNode;
  patients: Patient[];
  selectedPatientId?: string;
}

const CATEGORIES = [
  { value: 'medication', label: 'Medication' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'general', label: 'General' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

// Built-in starter templates. A full DB-backed template library is planned (see roadmap).
const TEMPLATES = [
  {
    label: 'BP monitoring',
    category: 'monitoring',
    priority: 'normal',
    title: 'Daily blood pressure check',
    instruction: 'Please measure your blood pressure each morning before taking medications. Sit quietly for 5 minutes first, feet flat on the floor. Log both readings in OneCare. Contact us if systolic > 160 or diastolic > 100.',
  },
  {
    label: 'New medication start',
    category: 'medication',
    priority: 'high',
    title: 'Starting a new medication',
    instruction: 'Begin taking your new medication as prescribed. Watch for side effects in the first 7 days: dizziness, nausea, rash. Log any side effects in OneCare. Do not stop the medication without contacting us first.',
  },
  {
    label: 'Pre-appointment prep',
    category: 'appointment',
    priority: 'normal',
    title: 'Prepare for your upcoming visit',
    instruction: 'Bring an updated medication list, recent home BP/glucose logs, and a list of any questions or symptoms you want to discuss. Fast for 8 hours if labs are scheduled.',
  },
  {
    label: 'Lifestyle — low sodium',
    category: 'lifestyle',
    priority: 'normal',
    title: 'Low-sodium diet guidance',
    instruction: 'Aim for less than 2,000 mg sodium per day. Avoid processed foods, canned soups, deli meats, and added table salt. Read labels carefully. Use herbs and spices for flavor.',
  },
];

export function CreateGuidanceDialog({ trigger, patients, selectedPatientId }: CreateGuidanceDialogProps) {
  const [open, setOpen] = useState(false);
  const { createGuidance } = useClinicianGuidance();
  
  const [formData, setFormData] = useState({
    patient_user_id: selectedPatientId || '',
    title: '',
    instruction: '',
    category: 'general',
    priority: 'normal',
    due_date: '',
    auto_resend_enabled: false,
    resend_interval_hours: 24,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const selectedPatient = patients.find(p => p.user_id === formData.patient_user_id);
    
    await createGuidance.mutateAsync({
      patient_user_id: formData.patient_user_id,
      share_id: selectedPatient?.id,
      title: formData.title,
      instruction: formData.instruction,
      category: formData.category,
      priority: formData.priority,
      due_date: formData.due_date || undefined,
      auto_resend_enabled: formData.auto_resend_enabled,
      resend_interval_hours: formData.resend_interval_hours,
    });

    setFormData({
      patient_user_id: selectedPatientId || '',
      title: '',
      instruction: '',
      category: 'general',
      priority: 'normal',
      due_date: '',
      auto_resend_enabled: false,
      resend_interval_hours: 24,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send New Guidance</DialogTitle>
          <DialogDescription>
            Create instructions for your patient to follow
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Quick templates */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              Quick templates
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map((tpl) => (
                <Badge
                  key={tpl.label}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10 hover:border-primary text-xs"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      title: tpl.title,
                      instruction: tpl.instruction,
                      category: tpl.category,
                      priority: tpl.priority,
                    })
                  }
                >
                  {tpl.label}
                </Badge>
              ))}
            </div>
          </div>

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

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Take morning medication"
              required
            />
          </div>

          {/* Instruction */}
          <div className="space-y-2">
            <Label htmlFor="instruction">Instructions *</Label>
            <Textarea
              id="instruction"
              value={formData.instruction}
              onChange={(e) => setFormData({ ...formData, instruction: e.target.value })}
              placeholder="Detailed instructions for the patient..."
              rows={4}
              required
            />
          </div>

          {/* Category & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={(value) => setFormData({ ...formData, priority: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(pri => (
                    <SelectItem key={pri.value} value={pri.value}>
                      {pri.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Due Date */}
          <div className="space-y-2">
            <Label htmlFor="due_date">Due Date (Optional)</Label>
            <Input
              id="due_date"
              type="date"
              value={formData.due_date}
              onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              min={new Date().toISOString().split('T')[0]}
            />
          </div>

          {/* Auto-resend */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <p className="font-medium text-sm">Auto-resend if not acknowledged</p>
              <p className="text-xs text-muted-foreground">
                Automatically resend after specified hours
              </p>
            </div>
            <Switch
              checked={formData.auto_resend_enabled}
              onCheckedChange={(checked) => setFormData({ ...formData, auto_resend_enabled: checked })}
            />
          </div>

          {formData.auto_resend_enabled && (
            <div className="space-y-2">
              <Label htmlFor="resend_interval">Resend Interval (hours)</Label>
              <Input
                id="resend_interval"
                type="number"
                min={1}
                max={168}
                value={formData.resend_interval_hours || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  // Allow empty string for clearing, otherwise parse as number
                  if (value === '') {
                    setFormData({ ...formData, resend_interval_hours: 0 });
                  } else {
                    const num = parseInt(value, 10);
                    if (!isNaN(num)) {
                      setFormData({ ...formData, resend_interval_hours: Math.max(1, Math.min(168, num)) });
                    }
                  }
                }}
                onBlur={(e) => {
                  // On blur, ensure a valid value (min 1)
                  if (!formData.resend_interval_hours || formData.resend_interval_hours < 1) {
                    setFormData({ ...formData, resend_interval_hours: 1 });
                  }
                }}
                placeholder="1-168"
              />
              <p className="text-xs text-muted-foreground">Enter a value between 1 and 168 hours (1 week)</p>
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="gradient-primary border-0"
              disabled={createGuidance.isPending || !formData.patient_user_id || !formData.title || !formData.instruction}
            >
              {createGuidance.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Guidance
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
