import { useEffect, useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['Female', 'Male', 'Other', 'Prefer not to say'];

/** Lets the patient correct their own biodata without redoing onboarding. */
export function EditProfileDialog() {
  const { user, profile, refreshProfile } = useAuth();
  const p = profile as Record<string, unknown> | null;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone_number: '',
    date_of_birth: '',
    gender: '',
    blood_type: '',
    height: '',
    weight: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
  });

  useEffect(() => {
    if (!p) return;
    setForm({
      name: (p.name as string) ?? '',
      phone_number: (p.phone_number as string) ?? '',
      date_of_birth: (p.date_of_birth as string) ?? '',
      gender: (p.gender as string) ?? '',
      blood_type: (p.blood_type as string) ?? '',
      height: p.height != null ? String(p.height) : '',
      weight: p.weight != null ? String(p.weight) : '',
      emergency_contact_name: (p.emergency_contact_name as string) ?? '',
      emergency_contact_phone: (p.emergency_contact_phone as string) ?? '',
    });
  }, [profile]);

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!user) return;
    if (!form.name.trim()) {
      toast.error('Please enter your name');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        name: form.name.trim(),
        phone_number: form.phone_number.trim() || null,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        blood_type: form.blood_type || null,
        height: form.height ? Number(form.height) : null,
        weight: form.weight ? Number(form.weight) : null,
        emergency_contact_name: form.emergency_contact_name.trim() || null,
        emergency_contact_phone: form.emergency_contact_phone.trim() || null,
      } as never)
      .eq('user_id', user.id);
    setSaving(false);

    if (error) {
      toast.error(error.message || 'Could not save your details');
      return;
    }
    toast.success('Profile updated');
    await refreshProfile();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full mt-2">
          <Pencil className="h-4 w-4 mr-2" />
          Edit health profile
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit your health profile</DialogTitle>
          <DialogDescription>
            These details are yours. Anyone you have connected with sees the updated version.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Full name</Label>
            <Input
              id="profile-name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="profile-phone">Phone</Label>
              <Input
                id="profile-phone"
                value={form.phone_number}
                onChange={(e) => set('phone_number', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-dob">Date of birth</Label>
              <Input
                id="profile-dob"
                type="date"
                value={form.date_of_birth}
                onChange={(e) => set('date_of_birth', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v) => set('gender', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {GENDERS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Blood type</Label>
              <Select value={form.blood_type} onValueChange={(v) => set('blood_type', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {BLOOD_TYPES.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="profile-height">Height (cm)</Label>
              <Input
                id="profile-height"
                type="number"
                value={form.height}
                onChange={(e) => set('height', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-weight">Weight (kg)</Label>
              <Input
                id="profile-weight"
                type="number"
                value={form.weight}
                onChange={(e) => set('weight', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="profile-ec-name">Emergency contact</Label>
              <Input
                id="profile-ec-name"
                value={form.emergency_contact_name}
                onChange={(e) => set('emergency_contact_name', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-ec-phone">Their phone</Label>
              <Input
                id="profile-ec-phone"
                value={form.emergency_contact_phone}
                onChange={(e) => set('emergency_contact_phone', e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Allergies and health conditions are managed in the guided health review.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
