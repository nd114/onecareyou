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

export function PracticeBrandingCard() {
  const { user } = useAuth();
  const { currentPractice, updatePractice, canManagePractice } = usePractice();
  const [primaryColor, setPrimaryColor] = useState(currentPractice?.primary_color || '#0d9488');
  const [accentColor, setAccentColor] = useState((currentPractice as any)?.brand_accent_color || '#0284c7');
  const [logoUrl, setLogoUrl] = useState((currentPractice as any)?.brand_logo_url || currentPractice?.logo_url || '');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (!currentPractice || !canManagePractice) return null;

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be less than 2MB');
      return;
    }

    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${currentPractice.id}/logo.${ext}`;
      const { error } = await supabase.storage
        .from('clinician-avatars')
        .upload(path, file, { upsert: true });
      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('clinician-avatars')
        .getPublicUrl(path);
      setLogoUrl(`${publicUrl}?t=${Date.now()}`);
      toast.success('Logo uploaded');
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload logo');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updatePractice.mutateAsync({
        practiceId: currentPractice.id,
        updates: {
          primary_color: primaryColor,
          logo_url: logoUrl || null,
        } as any,
      });
      // Also update brand-specific columns
      await (supabase.from('practices' as any).update({
        brand_accent_color: accentColor,
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

        {/* Colors */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="primary-color">Primary Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                id="primary-color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-10 rounded border cursor-pointer"
              />
              <Input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#0d9488"
                className="font-mono text-sm"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="accent-color">Accent Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                id="accent-color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-10 w-10 rounded border cursor-pointer"
              />
              <Input
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                placeholder="#0284c7"
                className="font-mono text-sm"
              />
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-2">
          <Label>Preview</Label>
          <div className="p-4 rounded-lg border" style={{ borderColor: primaryColor }}>
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo preview" className="h-8 w-8 object-contain" />
              ) : (
                <div className="h-8 w-8 rounded-lg" style={{ background: primaryColor }} />
              )}
              <span className="font-semibold" style={{ color: primaryColor }}>
                {currentPractice.name}
              </span>
            </div>
            <div className="flex gap-2 mt-3">
              <div className="h-2 w-20 rounded-full" style={{ background: primaryColor }} />
              <div className="h-2 w-12 rounded-full" style={{ background: accentColor }} />
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
