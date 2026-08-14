import { useEffect, useRef, useState } from 'react';
import { Loader2, Palette, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { uploadTenantLogo } from '@/lib/tenant-logo';
import type { AdminTenantDetail, TenantBrandingInput } from '@/hooks/useAdminTenantDetail';

interface Props {
  tenant: AdminTenantDetail;
  onSave: (input: TenantBrandingInput) => Promise<unknown>;
  isSaving: boolean;
}

/**
 * Admin-side mirror of the tenant's own branding card, so we can set a logo on
 * their behalf. Branding is a name/logo overlay only — the OneCare palette and
 * type system are not tenant-configurable (enterprise-hospital-tenancy-plan §3).
 */
export function AdminTenantBrandingCard({ tenant, onSave, isSaving }: Props) {
  const [logoUrl, setLogoUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLogoUrl(tenant.brand_logo_url || tenant.logo_url || '');
  }, [tenant.id, tenant.brand_logo_url, tenant.logo_url]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsUploading(true);
    try {
      const url = await uploadTenantLogo(tenant.id, file);
      setLogoUrl(url);
      await onSave({ logo_url: url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not upload the logo');
    } finally {
      setIsUploading(false);
    }
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          Branding
        </CardTitle>
        <CardDescription>
          Name and logo shown on the tenant's sign-up address, alongside the OneCare mark. The
          tenant can change this themselves; whatever is saved last applies to both sides.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Logo</Label>
          <div className="flex flex-wrap items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Current logo"
                className="h-12 w-12 rounded-lg border object-contain p-1"
              />
            ) : (
              <div className="h-12 w-12 rounded-lg border gradient-primary" />
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={isUploading || isSaving}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Upload logo
            </Button>
            {logoUrl && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLogoUrl('')}
                disabled={isUploading || isSaving}
              >
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">PNG, JPG or SVG up to 2MB.</p>
          <Label htmlFor={`logo-${tenant.id}`} className="pt-2 block">
            Or paste a logo URL
          </Label>
          <Input
            id={`logo-${tenant.id}`}
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://…/logo.png"
          />
        </div>


        <div className="space-y-2">
          <Label>Preview</Label>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo preview" className="h-8 w-8 object-contain" />
              ) : (
                <div className="h-8 w-8 rounded-lg gradient-primary" />
              )}
              <span className="font-display font-semibold">{tenant.name} by OneCare</span>
            </div>
          </div>
        </div>

        <Button
          onClick={() => onSave({ logo_url: logoUrl.trim() })}
          disabled={isSaving}
        >
          {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save branding
        </Button>
      </CardContent>
    </Card>
  );
}
