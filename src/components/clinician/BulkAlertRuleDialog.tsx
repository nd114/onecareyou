import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Bell, Search } from 'lucide-react';
import { useAlertRules } from '@/hooks/useAlertRules';

interface Patient {
  id: string;
  user_id: string;
  patient_name: string;
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
  { value: 'outside_range', label: 'Outside range' },
];

const ALERT_METHODS = [
  { value: 'email', label: 'Email' },
  { value: 'push', label: 'Push notification' },
];

/**
 * One threshold, applied across a panel.
 *
 * A clinician watching thirty hypertensives wants "tell me if any systolic goes
 * over 150" once, not thirty passes through the single-patient dialog. Setting
 * them one at a time is how a panel ends up with inconsistent thresholds, and
 * the gaps are invisible — which is worse than having no rule at all, because
 * the clinician believes they are covered.
 *
 * The count of who this will apply to is kept in front of the clinician the
 * whole time, and existing thresholds for the same vital are replaced rather
 * than duplicated. Two rules on one measurement means two alerts for one
 * reading, which teaches people to ignore alerts.
 */
export function BulkAlertRuleDialog({
  trigger,
  patients,
}: {
  trigger: React.ReactNode;
  patients: Patient[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { createAlertRulesForPatients, alertRules } = useAlertRules();

  const [form, setForm] = useState({
    vital_type: '',
    condition: 'above',
    threshold_value: '',
    threshold_secondary: '',
    alert_method: 'push',
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => p.patient_name.toLowerCase().includes(q));
  }, [patients, search]);

  // How many of the chosen patients already have a threshold on this vital —
  // shown up front, because "replace" is a decision, not a surprise.
  const replacing = useMemo(() => {
    if (!form.vital_type) return 0;
    return [...selected].filter((userId) =>
      alertRules.some((r) => r.patient_user_id === userId && r.vital_type === form.vital_type),
    ).length;
  }, [selected, form.vital_type, alertRules]);

  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.user_id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((p) => next.delete(p.user_id));
      else visible.forEach((p) => next.add(p.user_id));
      return next;
    });
  };

  const canSubmit =
    selected.size > 0 &&
    form.vital_type !== '' &&
    form.threshold_value !== '' &&
    (form.condition !== 'outside_range' || form.threshold_secondary !== '') &&
    !createAlertRulesForPatients.isPending;

  const handleSubmit = async () => {
    await createAlertRulesForPatients.mutateAsync({
      patients: patients
        .filter((p) => selected.has(p.user_id))
        .map((p) => ({ user_id: p.user_id, share_id: p.id })),
      vital_type: form.vital_type,
      condition: form.condition,
      threshold_value: Number(form.threshold_value),
      threshold_secondary: form.threshold_secondary ? Number(form.threshold_secondary) : undefined,
      alert_method: form.alert_method,
    });
    setOpen(false);
    setSelected(new Set());
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-500" />
            Set one alert across several patients
          </DialogTitle>
          <DialogDescription>
            The same threshold applied to everyone you choose. Anyone who already has a threshold
            for this measurement has it replaced, not added to.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Patients</Label>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleAll}>
                {allVisibleSelected ? 'Clear' : 'Select all'}
              </Button>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search by name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="max-h-56 overflow-y-auto rounded-lg border divide-y">
              {visible.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No patients match.</p>
              ) : (
                visible.map((patient) => (
                  <label
                    key={patient.user_id}
                    className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={selected.has(patient.user_id)}
                      onCheckedChange={(checked) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(patient.user_id);
                          else next.delete(patient.user_id);
                          return next;
                        })
                      }
                    />
                    <span className="text-sm truncate">{patient.patient_name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="bulk-vital">Measurement</Label>
              <Select
                value={form.vital_type}
                onValueChange={(v) => setForm((f) => ({ ...f, vital_type: v }))}
              >
                <SelectTrigger id="bulk-vital">
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  {VITAL_TYPES.map((v) => (
                    <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="bulk-condition">Tell me when it is</Label>
              <Select
                value={form.condition}
                onValueChange={(v) => setForm((f) => ({ ...f, condition: v }))}
              >
                <SelectTrigger id="bulk-condition"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="bulk-threshold">
                  {form.condition === 'outside_range' ? 'Lower' : 'Value'}
                </Label>
                <Input
                  id="bulk-threshold"
                  type="number"
                  value={form.threshold_value}
                  onChange={(e) => setForm((f) => ({ ...f, threshold_value: e.target.value }))}
                />
              </div>
              {form.condition === 'outside_range' && (
                <div>
                  <Label htmlFor="bulk-threshold-2">Upper</Label>
                  <Input
                    id="bulk-threshold-2"
                    type="number"
                    value={form.threshold_secondary}
                    onChange={(e) => setForm((f) => ({ ...f, threshold_secondary: e.target.value }))}
                  />
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="bulk-method">How to tell me</Label>
              <Select
                value={form.alert_method}
                onValueChange={(v) => setForm((f) => ({ ...f, alert_method: v }))}
              >
                <SelectTrigger id="bulk-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALERT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{selected.size} selected</Badge>
            {replacing > 0 && (
              <span className="text-xs">
                {replacing} already {replacing === 1 ? 'has' : 'have'} a threshold here — it will be
                replaced
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {createAlertRulesForPatients.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Set alert
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
