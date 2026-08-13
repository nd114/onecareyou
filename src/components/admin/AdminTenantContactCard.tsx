import { useEffect, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AdminTenantDetail } from '@/hooks/useAdminTenantDetail';
import { useAdminOps } from '@/hooks/useAdminOps';

/**
 * Contact and address details for a tenant. We set these up front so the record
 * of truth exists from day one; the tenant's own settings read the same row.
 */
export function AdminTenantContactCard({ tenant }: { tenant: AdminTenantDetail }) {
  const { setTenantContact, isSavingContact } = useAdminOps();
  const [form, setForm] = useState({
    address: '',
    city: '',
    state: '',
    zip_code: '',
    country: '',
    phone: '',
    email: '',
    npi: '',
  });

  useEffect(() => {
    setForm({
      address: tenant.address ?? '',
      city: tenant.city ?? '',
      state: tenant.state ?? '',
      zip_code: tenant.zip_code ?? '',
      country: tenant.country ?? '',
      phone: tenant.phone ?? '',
      email: tenant.email ?? '',
      npi: tenant.npi ?? '',
    });
  }, [tenant]);

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const fields: Array<[keyof typeof form, string, string?]> = [
    ['address', 'Street address'],
    ['city', 'City'],
    ['state', 'State / region'],
    ['zip_code', 'Postcode'],
    ['country', 'Country'],
    ['phone', 'Phone'],
    ['email', 'Contact email', 'email'],
    ['npi', 'NPI / licence number'],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Contact and address
        </CardTitle>
        <CardDescription>
          Single record of truth. Blank fields leave the current value untouched, and the tenant
          sees exactly what is saved here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map(([key, label, type]) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={`tenant-${key}`}>{label}</Label>
              <Input
                id={`tenant-${key}`}
                type={type ?? 'text'}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            </div>
          ))}
        </div>
        <Button
          size="sm"
          disabled={isSavingContact}
          onClick={() => setTenantContact({ practiceId: tenant.id, ...form })}
        >
          {isSavingContact && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save details
        </Button>
      </CardContent>
    </Card>
  );
}
