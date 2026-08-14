import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Palette, Upload, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePractice } from '@/hooks/usePractice';
import { uploadTenantLogo } from '@/lib/tenant-logo';


export function PracticeBrandingCard() {
  const { user } = useAuth();
  const { currentPractice, updatePractice, canManagePractice } = usePractice();
  const [logoUrl, setLogoUrl] = useState((currentPractice as any)?.brand_logo_url || currentPractice?.logo_url || '');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (!currentPractice || !canManagePractice) return null;

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;

    setIsUploading(true);
    try {
      const url = await uploadTenantLogo(currentPractice.id, file);
      setLogoUrl(url);
      toast.success('Logo uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload logo');
    } finally {
      setIsUploading(false);
    }
  };


  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updatePractice.mutateAsync({
        practiceId: currentPractice.id,
        updates: { logo_url: logoUrl || null } as any,
      });
      // brand_logo_url is what the branded sign-up address reads.
      await (supabase.from('practices' as any).update({
        brand_logo_url: logoUrl || null,
      }).eq('id', currentPractice.id) as any);
      toast.success('Branding saved');
    } catch {
      toast.error('Failed to save branding');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          Practice Branding
        </CardTitle>
        <CardDescription>
          Customize how your practice appears to patients
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Logo */}
        <div className="space-y-2">
          <Label>Practice Logo</Label>
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <div className="relative">
                <img src={logoUrl} alt="Practice logo" className="h-16 w-16 object-contain rounded-lg border" />
                <button
                  onClick={() => setLogoUrl('')}
                  className="absolute -top-1 -right-1 p-0.5 rounded-full bg-destructive text-destructive-foreground"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="h-16 w-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center">
                <Upload className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div>
              <label htmlFor="logo-upload" className="cursor-pointer">
                <Button variant="outline" size="sm" asChild disabled={isUploading}>
                  <span>
                    {isUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    Upload Logo
                  </span>
                </Button>
              </label>
              <input id="logo-upload" type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 2MB</p>
            </div>
          </div>
        </div>

        {/* Branding is a name and logo overlay only — the OneCare palette,
            typography and layout stay as they are, so there is no colour to
            pick here. See docs/enterprise-hospital-tenancy-plan.md §3. */}
        <p className="text-xs text-muted-foreground">
          Your name and logo appear on your hospital's sign-up address and
          alongside the OneCare mark. Colours, type and layout stay consistent
          across OneCare so patients recognise the app they already trust.
        </p>

        {/* Preview — the lockup exactly as a patient meets it. */}
        <div className="space-y-2">
          <Label>Preview</Label>
          <div className="p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo preview" className="h-8 w-8 object-contain" />
              ) : (
                <div className="h-8 w-8 rounded-lg gradient-primary" />
              )}
              <span className="font-display font-semibold">
                {currentPractice.name} by OneCare
              </span>
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={isSaving} className="w-full gradient-primary border-0">
          {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Save Branding
        </Button>
      </CardContent>
    </Card>
  );
}
