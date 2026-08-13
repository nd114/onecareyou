import { MapPin } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AdminTenantDetail } from '@/hooks/useAdminTenantDetail';

/**
 * Read-only view of the tenant's contact and address details. The tenant enters
 * these themselves during set-up and can update them later, so we only observe.
 */
export function AdminTenantContactCard({ tenant }: { tenant: AdminTenantDetail }) {
  const rows: Array<[string, string | null]> = [
    ['Street address', tenant.address],
    ['City', tenant.city],
    ['State / region', tenant.state],
    ['Postcode', tenant.zip_code],
    ['Country', tenant.country],
    ['Phone', tenant.phone],
    ['Contact email', tenant.email],
    ['NPI / licence number', tenant.npi],
  ];

  const isEmpty = rows.every(([, value]) => !value);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Contact and address
        </CardTitle>
        <CardDescription>
          Provided by the tenant when they set up their practice, and editable by them at any time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isEmpty && (
          <p className="text-sm text-muted-foreground">
            The tenant hasn't submitted these details yet.
          </p>
        )}
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium text-right break-all">{value || '—'}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
