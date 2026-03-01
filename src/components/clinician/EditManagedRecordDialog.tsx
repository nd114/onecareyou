import { useState } from 'react';
import { Pencil, Loader2, Plus, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
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
import { toast } from 'sonner';

interface Props {
  record: ClinicianPatientRecord;
}

export function EditManagedRecordDialog({ record }: Props) {
  const { updateRecord, deleteRecord } = useClinicianPatientRecords();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState(record.patient_name);
  const [email, setEmail] = useState(record.patient_email || '');
  const [phone, setPhone] = useState(record.patient_phone || '');
  const [dob, setDob] = useState(record.date_of_birth || '');
  const [gender, setGender] = useState(record.gender || '');
  const [bloodType, setBloodType] = useState(record.blood_type || '');
  const [notes, setNotes] = useState(record.notes || '');
  const [sharingModel, setSharingModel] = useState(record.data_sharing_model);

  // Allergies
  const [allergies, setAllergies] = useState<string[]>(record.allergies || []);
  const [newAllergy, setNewAllergy] = useState('');

  // Health conditions
  const [conditions, setConditions] = useState<string[]>(record.health_conditions || []);
  const [newCondition, setNewCondition] = useState('');

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Patient name is required');
      return;
    }
    setIsSubmitting(true);
    try {
      await updateRecord.mutateAsync({
        id: record.id,
        patient_name: name.trim(),
        patient_email: email || null,
        patient_phone: phone || null,
        date_of_birth: dob || null,
        gender: gender || null,
        blood_type: bloodType || null,
        notes: notes || null,
        data_sharing_model: sharingModel,
        allergies,
        health_conditions: conditions,
      } as any);
      setOpen(false);
    } catch {
      // error handled by hook
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${record.patient_name}'s record? This cannot be undone.`)) return;
    setIsSubmitting(true);
    try {
      await deleteRecord.mutateAsync(record.id);
      setOpen(false);
    } catch {
      // error handled by hook
    } finally {
      setIsSubmitting(false);
    }
  };

  const addItem = (list: string[], setter: (v: string[]) => void, value: string, clearFn: (v: string) => void) => {
    if (!value.trim()) return;
    setter([...list, value.trim()]);
    clearFn('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs gap-1.5 h-7">
          <Pencil className="h-3 w-3" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Patient Record</DialogTitle>
          <DialogDescription>Update {record.patient_name}'s managed record.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Identity */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} type="email" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div>
              <Label>Date of Birth</Label>
              <Input value={dob} onChange={e => setDob(e.target.value)} type="date" />
            </div>
            <div>
              <Label>Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Blood Type</Label>
              <Select value={bloodType} onValueChange={setBloodType}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sharing Model</Label>
              <Select value={sharingModel} onValueChange={setSharingModel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="clinician_managed">Clinician Managed</SelectItem>
                  <SelectItem value="collaborative">Collaborative</SelectItem>
                  <SelectItem value="patient_managed">Patient Managed</SelectItem>
                  <SelectItem value="view_only">View Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Allergies */}
          <div>
            <Label>Allergies</Label>
            <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
              {allergies.map((a, i) => (
                <Badge key={i} variant="secondary" className="gap-1 pr-1">
                  {a}
                  <button onClick={() => setAllergies(allergies.filter((_, j) => j !== i))} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newAllergy} onChange={e => setNewAllergy(e.target.value)} placeholder="Add allergy..." className="flex-1"
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addItem(allergies, setAllergies, newAllergy, setNewAllergy))} />
              <Button size="sm" variant="outline" onClick={() => addItem(allergies, setAllergies, newAllergy, setNewAllergy)} disabled={!newAllergy.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Conditions */}
          <div>
            <Label>Health Conditions</Label>
            <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
              {conditions.map((c, i) => (
                <Badge key={i} variant="secondary" className="gap-1 pr-1">
                  {c}
                  <button onClick={() => setConditions(conditions.filter((_, j) => j !== i))} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newCondition} onChange={e => setNewCondition(e.target.value)} placeholder="Add condition..." className="flex-1"
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addItem(conditions, setConditions, newCondition, setNewCondition))} />
              <Button size="sm" variant="outline" onClick={() => addItem(conditions, setConditions, newCondition, setNewCondition)} disabled={!newCondition.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label>Clinical Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </div>

          {/* Actions */}
          <div className="flex justify-between pt-2">
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isSubmitting}>
              Delete Record
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>Cancel</Button>
              <Button onClick={handleSave} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
