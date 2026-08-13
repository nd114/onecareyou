import { useMemo, useState } from 'react';
import { UserPlus, Loader2, Plus, X, AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useClinicianPatientRecords, type ClinicianPatientRecord } from '@/hooks/useClinicianPatientRecords';
import { findDuplicateCandidates, dedupReasonLabel } from '@/lib/patient-dedup';
import { toast } from 'sonner';

interface Props {
  trigger?: React.ReactNode;
  onAdded?: () => void;
}

export function AddManagedPatientDialog({ trigger, onAdded }: Props) {
  const { records, addRecord } = useClinicianPatientRecords();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedDuplicate, setConfirmedDuplicate] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [bloodType, setBloodType] = useState('');
  const [notes, setNotes] = useState('');
  const [sharingModel, setSharingModel] = useState('clinician_managed');
  const [allergies, setAllergies] = useState<string[]>([]);
  const [newAllergy, setNewAllergy] = useState('');
  const [conditions, setConditions] = useState<string[]>([]);
  const [newCondition, setNewCondition] = useState('');

  const duplicates = useMemo(
    () => findDuplicateCandidates(
      { patient_name: name, patient_email: email, patient_phone: phone, date_of_birth: dob },
      records as ClinicianPatientRecord[],
    ).slice(0, 3),
    [name, email, phone, dob, records],
  );

  const reset = () => {
    setName(''); setEmail(''); setPhone(''); setDob(''); setGender('');
    setBloodType(''); setNotes(''); setSharingModel('clinician_managed');
    setAllergies([]); setNewAllergy(''); setConditions([]); setNewCondition('');
    setConfirmedDuplicate(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (next) reset();
    setOpen(next);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Patient name is required');
      return;
    }
    if (duplicates.length > 0 && !confirmedDuplicate) {
      toast.error('Review the possible duplicate first');
      return;
    }
    setIsSubmitting(true);
    try {
      await addRecord.mutateAsync({
        patient_name: name.trim(),
        patient_email: email.trim() || null,
        patient_phone: phone.trim() || null,
        date_of_birth: dob || null,
        gender: gender || null,
        blood_type: bloodType || null,
        notes: notes.trim() || null,
        allergies,
        health_conditions: conditions,
        medications: [],
        vitals_history: [],
        tags: [],
        practice_id: null,
        linked_user_id: null,
        provider_share_id: null,
        invitation_status: 'not_invited',
        data_sharing_model: sharingModel,
        import_source: 'manual_entry',
      } as any);
      setOpen(false);
      onAdded?.();
    } catch {
      // error surfaced by hook
    } finally {
      setIsSubmitting(false);
    }
  };

  const addItem = (
    list: string[], setter: (v: string[]) => void, value: string, clear: (v: string) => void,
  ) => {
    const trimmed = value.trim();
    if (!trimmed || list.includes(trimmed)) { clear(''); return; }
    setter([...list, trimmed]);
    clear('');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="gap-1.5">
            <UserPlus className="h-4 w-4" />
            Add Patient
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Patient Manually</DialogTitle>
          <DialogDescription>
            Create a chart for a patient who isn't on OneCare yet. You can invite them to claim it later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="amp-name">Full name *</Label>
            <Input id="amp-name" value={name} onChange={(e) => { setName(e.target.value); setConfirmedDuplicate(false); }} placeholder="Patient name" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amp-email">Email</Label>
              <Input id="amp-email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setConfirmedDuplicate(false); }} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amp-phone">Phone</Label>
              <Input id="amp-phone" value={phone} onChange={(e) => { setPhone(e.target.value); setConfirmedDuplicate(false); }} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amp-dob">Date of birth</Label>
              <Input id="amp-dob" type="date" value={dob} onChange={(e) => { setDob(e.target.value); setConfirmedDuplicate(false); }} />
            </div>
            <div className="space-y-1.5">
              <Label>Sex</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                  <SelectItem value="unspecified">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Blood type</Label>
              <Select value={bloodType} onValueChange={setBloodType}>
                <SelectTrigger><SelectValue placeholder="Unknown" /></SelectTrigger>
                <SelectContent>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data sharing model</Label>
              <Select value={sharingModel} onValueChange={setSharingModel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="clinician_managed">Clinician managed</SelectItem>
                  <SelectItem value="patient_owned">Patient owned</SelectItem>
                  <SelectItem value="shared">Shared</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Allergies */}
          <div className="space-y-1.5">
            <Label>Allergies</Label>
            <div className="flex gap-2">
              <Input
                value={newAllergy}
                onChange={(e) => setNewAllergy(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(allergies, setAllergies, newAllergy, setNewAllergy); } }}
                placeholder="e.g. Penicillin"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => addItem(allergies, setAllergies, newAllergy, setNewAllergy)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {allergies.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {allergies.map((a) => (
                  <Badge key={a} variant="secondary" className="gap-1">
                    {a}
                    <button type="button" onClick={() => setAllergies(allergies.filter((x) => x !== a))} aria-label={`Remove ${a}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Conditions */}
          <div className="space-y-1.5">
            <Label>Health conditions</Label>
            <div className="flex gap-2">
              <Input
                value={newCondition}
                onChange={(e) => setNewCondition(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(conditions, setConditions, newCondition, setNewCondition); } }}
                placeholder="e.g. Hypertension"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => addItem(conditions, setConditions, newCondition, setNewCondition)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {conditions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {conditions.map((c) => (
                  <Badge key={c} variant="secondary" className="gap-1">
                    {c}
                    <button type="button" onClick={() => setConditions(conditions.filter((x) => x !== c))} aria-label={`Remove ${c}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="amp-notes">Clinical notes</Label>
            <Textarea id="amp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Presenting complaint, history, plan…" />
          </div>

          {duplicates.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">Possible duplicate record</p>
                  <p className="text-muted-foreground text-xs">
                    Update the existing chart instead of creating a second one, unless these are genuinely different people.
                  </p>
                </div>
              </div>
              <ul className="space-y-1">
                {duplicates.map((m) => (
                  <li key={m.record.id} className="text-xs flex items-center justify-between gap-2 rounded-md bg-background/60 px-2 py-1.5">
                    <span className="truncate">{m.record.patient_name}</span>
                    <Badge variant="outline" className="text-[10px] flex-shrink-0">{dedupReasonLabel(m.reason)}</Badge>
                  </li>
                ))}
              </ul>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmedDuplicate}
                  onChange={(e) => setConfirmedDuplicate(e.target.checked)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                This is a different patient — add anyway
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSubmitting || !name.trim() || (duplicates.length > 0 && !confirmedDuplicate)}>
            {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : 'Add patient'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
