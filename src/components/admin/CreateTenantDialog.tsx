import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
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
import { useAdminOps } from '@/hooks/useAdminOps';

const TIERS = ['trial', 'solo', 'pro', 'enterprise'];

/** Platform admins create a practice or hospital tenant and optionally invite its owner. */
export function CreateTenantDialog() {
  const { createTenant, isCreating, inviteOwner } = useAdminOps();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    tenant_type: 'hospital' as 'practice' | 'hospital',
    slug: '',
    city: '',
    country: '',
    subscription_tier: 'enterprise',
    storage_limit_gb: '250',
    revenue_share_pct: '0',
    patient_limit: '5000',
    member_limit: '250',
    owner_email: '',
  });

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    const practiceId = await createTenant({
      name: form.name,
      tenant_type: form.tenant_type,
      slug: form.slug.trim() || undefined,
      city: form.city.trim() || undefined,
      country: form.country.trim() || undefined,
      subscription_tier: form.subscription_tier,
      storage_limit_gb: Number(form.storage_limit_gb) || 25,
      revenue_share_pct: Number(form.revenue_share_pct) || 0,
      patient_limit: Number(form.patient_limit) || 25,
      member_limit: Number(form.member_limit) || 5,
    });

    if (form.owner_email.trim()) {
      await inviteOwner({ practiceId, email: form.owner_email.trim() });
    }

    setOpen(false);
    setForm((f) => ({ ...f, name: '', slug: '', city: '', owner_email: '' }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          New tenant
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New tenant</DialogTitle>
          <DialogDescription>
            Set up a practice or hospital. The tenant stays empty until the owner accepts their
            invitation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tenant-name">Name</Label>
            <Input
              id="tenant-name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="St. Andrew's General Hospital"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.tenant_type}
                onValueChange={(v) => set('tenant_type', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hospital">Hospital</SelectItem>
                  <SelectItem value="practice">Practice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select
                value={form.subscription_tier}
                onValueChange={(v) => set('subscription_tier', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIERS.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenant-slug">Hospital code (optional)</Label>
            <Input
              id="tenant-slug"
              value={form.slug}
              onChange={(e) => set('slug', e.target.value.toLowerCase())}
              placeholder="st-andrews"
            />
            <p className="text-xs text-muted-foreground">
              Patients use this code to connect. Lowercase letters, numbers and hyphens.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tenant-city">City</Label>
              <Input id="tenant-city" value={form.city} onChange={(e) => set('city', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-country">Country</Label>
              <Input
                id="tenant-country"
                value={form.country}
                onChange={(e) => set('country', e.target.value)}
                placeholder="US"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tenant-storage">Storage (GB)</Label>
              <Input
                id="tenant-storage"
                type="number"
                min="1"
                value={form.storage_limit_gb}
                onChange={(e) => set('storage_limit_gb', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-revshare">Revenue share (%)</Label>
              <Input
                id="tenant-revshare"
                type="number"
                min="0"
                max="100"
                value={form.revenue_share_pct}
                onChange={(e) => set('revenue_share_pct', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tenant-patients">Patient limit</Label>
              <Input
                id="tenant-patients"
                type="number"
                min="1"
                value={form.patient_limit}
                onChange={(e) => set('patient_limit', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-members">Team limit</Label>
              <Input
                id="tenant-members"
                type="number"
                min="1"
                value={form.member_limit}
                onChange={(e) => set('member_limit', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenant-owner">Invite owner by email (optional)</Label>
            <Input
              id="tenant-owner"
              type="email"
              value={form.owner_email}
              onChange={(e) => set('owner_email', e.target.value)}
              placeholder="admin@hospital.org"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isCreating || form.name.trim().length < 2}>
            {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create tenant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
