import { useEffect, useState } from 'react';
import { Building2, Loader2, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMyInstitutionShares, type InstitutionInfo } from '@/hooks/usePracticeShares';

export const INTAKE_SLUG_KEY = 'onecare.institution_slug';

/**
 * Completes intake for someone who signed up at a hospital's own address
 * (e.g. lmc.onecare.you). We never connect silently — the patient consents here.
 */
export function InstitutionIntakeCard() {
  const { activeShares, isLoading, lookupInstitution, connect, isConnecting } =
    useMyInstitutionShares();
  const [institution, setInstitution] = useState<InstitutionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const storedSlug =
    typeof window === 'undefined'
      ? null
      : localStorage.getItem(INTAKE_SLUG_KEY) || sessionStorage.getItem(INTAKE_SLUG_KEY);

  useEffect(() => {
    let cancelled = false;
    if (!storedSlug || isLoading) return;

    (async () => {
      try {
        const found = await lookupInstitution(storedSlug);
        if (cancelled) return;
        if (!found) {
          localStorage.removeItem(INTAKE_SLUG_KEY);
          sessionStorage.removeItem(INTAKE_SLUG_KEY);
          return;
        }
        const alreadyConnected = activeShares.some((s) => s.practice_id === found.id);
        if (alreadyConnected) {
          localStorage.removeItem(INTAKE_SLUG_KEY);
          sessionStorage.removeItem(INTAKE_SLUG_KEY);
          return;
        }
        setInstitution(found);
      } catch {
        // A failed lookup is not worth surfacing — the card simply stays hidden.
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedSlug, isLoading, activeShares.length]);

  const clearSlug = () => {
    localStorage.removeItem(INTAKE_SLUG_KEY);
    sessionStorage.removeItem(INTAKE_SLUG_KEY);
  };

  const handleConnect = async () => {
    if (!institution) return;
    await connect({ practiceId: institution.id, shareAll: true });
    clearSlug();
    setInstitution(null);
  };

  if (!institution || dismissed) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        {institution.logo_url ? (
          <img
            src={institution.logo_url}
            alt={`${institution.name} logo`}
            className="h-11 w-11 rounded-lg border bg-background object-contain p-1 shrink-0"
          />
        ) : (
          <div className="h-11 w-11 rounded-lg border flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">Connect with {institution.name}?</p>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-start gap-1">
            <ShieldCheck className="h-3.5 w-3.5 mt-px shrink-0" />
            You joined through their sign-up address. Connecting shares your full record — vitals,
            medications, documents, conditions and allergies, including what you add from now on —
            and they assign the clinician who looks after you. You can restrict any of it, or
            disconnect, at any time in Care Circle.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              clearSlug();
              setDismissed(true);
            }}
          >
            Not now
          </Button>
          <Button size="sm" onClick={handleConnect} disabled={isConnecting}>
            {isConnecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Connect
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
