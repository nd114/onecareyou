import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Check, Copy, Hash, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePractice } from '@/hooks/usePractice';
import { usePracticeTenant } from '@/hooks/usePracticeTenant';

/**
 * Owners/admins set the code patients type into Care Circle to share with the
 * institution. Also the basis for the future <code>.onecare.you</code> subdomain.
 */
export const HospitalCodeCard = () => {
  const { currentPractice, currentMembership } = usePractice();
  const { tenant, isLoading, checkAvailability, setSlug, isSaving } = usePracticeTenant(
    currentPractice?.id,
  );

  const canManage =
    currentMembership?.role === 'owner' || currentMembership?.role === 'admin';

  const [value, setValue] = useState('');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setValue(tenant?.slug ?? '');
  }, [tenant?.slug]);

  // The hospital code is an identifier people read off a card and type on a
  // phone, so it is capped at 7 characters — matching set_institution_slug.
  const normalised = value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 7);
  const validLength = normalised.length >= 3 && normalised.length <= 7;
  const changed = normalised !== (tenant?.slug ?? '');

  useEffect(() => {
    if (!changed || !validLength) {
      setAvailable(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const ok = await checkAvailability(normalised);
        if (!cancelled) setAvailable(ok);
      } catch {
        if (!cancelled) setAvailable(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setChecking(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalised, changed]);

  const copy = async () => {
    if (!tenant?.slug) return;
    await navigator.clipboard.writeText(tenant.slug);
    toast.success(`${label} copied`);
  };

  // Every practice gets a code, not just hospitals: a solo clinician needs one
  // too so their patients can add them from Care Circle without an invitation.
  if (!currentPractice) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Hash className="h-4 w-4 text-primary" />
              {label}
            </CardTitle>
            <CardDescription>
              Patients type this code into their Care Circle to share their record with{' '}
              {currentPractice.name}.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="capitalize">
            {tenant?.tenant_type ?? 'practice'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {tenant?.slug && (
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
                <div>
                  <p className="font-mono text-sm font-medium">{tenant.slug}</p>
                  <p className="text-xs text-muted-foreground">
                    Live at {tenant.slug}.onecare.you
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={copy}>
                  <Copy className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Copy</span>
                </Button>
              </div>
            )}

            {canManage ? (
              <div className="space-y-2">
                <Label htmlFor="hospital-slug">
                  {tenant?.slug ? 'Change code' : 'Choose a code'}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="hospital-slug"
                    value={value}
                    placeholder="e.g. oclmc"
                    maxLength={7}
                    onChange={(e) => setValue(e.target.value)}
                  />
                  <Button
                    onClick={async () => {
                      await setSlug(normalised);
                      setAvailable(null);
                    }}
                    disabled={
                      isSaving || !changed || !validLength || available === false
                    }
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, numbers and hyphens. 3–7 characters — short enough for a
                  patient to read off a card and type in.
                </p>
                {checking && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Checking availability…
                  </p>
                )}
                {!checking && available === true && (
                  <p className="text-xs text-primary flex items-center gap-1">
                    <Check className="h-3 w-3" /> {normalised} is available
                  </p>
                )}
                {!checking && available === false && (
                  <p className="text-xs text-destructive">That code is already taken.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Only practice owners and admins can change the hospital code.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
