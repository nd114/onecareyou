import { useEffect, useState } from 'react';
import { Loader2, Palette } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AdminTenantDetail, TenantBrandingInput } from '@/hooks/useAdminTenantDetail';

interface Props {
  tenant: AdminTenantDetail;
  onSave: (input: TenantBrandingInput) => Promise<unknown>;
  isSaving: boolean;
}

/**
 * Admin-side mirror of the tenant's own branding card, so we can set a logo and
 * colours on their behalf. Both sides write the same columns.
 */
export function AdminTenantBrandingCard({ tenant, onSave, isSaving }: Props) {
  const [logoUrl, setLogoUrl] = useState('');
  const [primary, setPrimary] = useState('#0d9488');
  const [accent, setAccent] = useState('#0284c7');

  useEffect(() => {
    setLogoUrl(tenant.brand_logo_url || tenant.logo_url || '');
    setPrimary(tenant.primary_color || '#0d9488');
    setAccent(tenant.brand_accent_color || '#0284c7');
  }, [tenant.id, tenant.brand_logo_url, tenant.logo_url, tenant.primary_color, tenant.brand_accent_color]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          Branding
        </CardTitle>
        <CardDescription>
          Logo and colours used on the tenant's sign-up address and patient-facing surfaces. The
          tenant can change these themselves; whatever is saved last applies to both sides.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor={`logo-${tenant.id}`}>Logo URL</Label>
          <Input
            id={`logo-${tenant.id}`}
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://…/logo.png"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`primary-${tenant.id}`}>Primary colour</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                id={`primary-${tenant.id}`}
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                className="h-10 w-10 rounded border cursor-pointer"
              />
              <Input
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`accent-${tenant.id}`}>Accent colour</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                id={`accent-${tenant.id}`}
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="h-10 w-10 rounded border cursor-pointer"
              />
              <Input
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Preview</Label>
          <div className="rounded-lg border p-4" style={{ borderColor: primary }}>
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo preview" className="h-8 w-8 object-contain" />
              ) : (
                <div className="h-8 w-8 rounded-lg" style={{ background: primary }} />
              )}
              <span className="font-semibold" style={{ color: primary }}>
                {tenant.name}
              </span>
            </div>
            <div className="flex gap-2 mt-3">
              <div className="h-2 w-20 rounded-full" style={{ background: primary }} />
              <div className="h-2 w-12 rounded-full" style={{ background: accent }} />
            </div>
          </div>
        </div>

        <Button
          onClick={() =>
            onSave({ logo_url: logoUrl.trim(), primary_color: primary, accent_color: accent })
          }
          disabled={isSaving}
        >
          {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save branding
        </Button>
      </CardContent>
    </Card>
  );
}
