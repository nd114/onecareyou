import { useState } from 'react';
import { Loader2, Mail, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAdminOps } from '@/hooks/useAdminOps';
import type { AdminTenantRow } from '@/hooks/useAdminTenants';

const TIERS = ['trial', 'solo', 'pro', 'enterprise'];

/** Per-tenant admin controls: edit plan and limits, or invite the tenant owner. */
export function AdminTenantRowActions({ tenant }: { tenant: AdminTenantRow }) {
  const { updateTenant, isUpdating, inviteOwner, isInviting } = useAdminOps();
  const [editOpen, setEditOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [form, setForm] = useState({
    name: tenant.name,
    tenant_type: (tenant.tenant_type ?? 'practice') as 'practice' | 'hospital',
    subscription_tier: tenant.subscription_tier ?? 'trial',
    storage_limit_gb: String(tenant.storage_limit_gb ?? 25),
    revenue_share_pct: String(tenant.revenue_share_pct ?? 0),
    is_active: true,
  });

  const handleSave = async () => {
    await updateTenant({
      practice_id: tenant.id,
      name: form.name,
      tenant_type: form.tenant_type,
      subscription_tier: form.subscription_tier,
      storage_limit_gb: Number(form.storage_limit_gb),
      revenue_share_pct: Number(form.revenue_share_pct),
      is_active: form.is_active,
    });
    setEditOpen(false);
  };

  const handleInvite = async () => {
    await inviteOwner({ practiceId: tenant.id, email: email.trim() });
    setInviteOpen(false);
    setEmail('');
  };

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={() => setInviteOpen(true)}>
        <Mail className="h-4 w-4" />
        <span className="sr-only">Invite owner</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
        <Settings2 className="h-4 w-4" />
        <span className="sr-only">Edit tenant</span>
      </Button>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {tenant.name}</DialogTitle>
            <DialogDescription>Plan, storage allowance and revenue share.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`name-${tenant.id}`}>Name</Label>
              <Input
                id={`name-${tenant.id}`}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={form.tenant_type}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, tenant_type: v as 'practice' | 'hospital' }))
                  }
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
                  onValueChange={(v) => setForm((f) => ({ ...f, subscription_tier: v }))}
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor={`storage-${tenant.id}`}>Storage (GB)</Label>
                <Input
                  id={`storage-${tenant.id}`}
                  type="number"
                  min="1"
                  value={form.storage_limit_gb}
                  onChange={(e) => setForm((f) => ({ ...f, storage_limit_gb: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`rev-${tenant.id}`}>Revenue share (%)</Label>
                <Input
                  id={`rev-${tenant.id}`}
                  type="number"
                  min="0"
                  max="100"
                  value={form.revenue_share_pct}
                  onChange={(e) => setForm((f) => ({ ...f, revenue_share_pct: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`slug-${tenant.id}`}>Hospital code</Label>
              <div className="flex gap-2">
                <Input
                  id={`slug-${tenant.id}`}
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  placeholder="e.g. st-marys"
                />
                <Button
                  variant="outline"
                  onClick={() => setTenantSlug({ practiceId: tenant.id, slug: slug.trim() })}
                  disabled={isSavingSlug || slug.trim().length < 3 || slug.trim() === (tenant.slug ?? '')}
                >
                  {isSavingSlug && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save code
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Patients connect with this code.{' '}
                {slug.trim().length >= 3 && (
                  <>
                    Reserved address:{' '}
                    <span className="font-mono">{slug.trim()}.onecare.you</span> (live once the
                    wildcard DNS record is in place).
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">
                  Inactive tenants can no longer be found by patients.
                </p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </div>

          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isUpdating}>
              {isUpdating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite owner</DialogTitle>
            <DialogDescription>
              The person you invite becomes owner of {tenant.name} once they accept from their
              OneCare account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`invite-${tenant.id}`}>Email</Label>
            <Input
              id={`invite-${tenant.id}`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@hospital.org"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={isInviting || !email.includes('@')}>
              {isInviting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
