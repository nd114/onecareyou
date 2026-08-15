import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, Info, Loader2 } from 'lucide-react';
import { useMyInstitutionShares } from '@/hooks/usePracticeShares';
import { HospitalProfileSheet } from '@/components/patient/HospitalProfileSheet';

/**
 * Settings answers "who holds my care?" plainly. Without this, the only trace of
 * the hospital a patient belongs to was buried in the Care Circle sharing list.
 */
export const MyHospitalCard = () => {
  const { activeShares, isLoading } = useMyInstitutionShares();
  const [profileFor, setProfileFor] = useState<{ id: string; name: string } | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          My hospital
        </CardTitle>
        <CardDescription>
          The hospitals and clinics that hold your care with OneCare
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : activeShares.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You are not connected to a hospital yet. If your hospital gave you a code, you can
              connect from your Care Circle.
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link to="/care-circle">Connect my hospital</Link>
            </Button>
          </div>
        ) : (
          activeShares.map((share) => (
            <div
              key={share.id}
              className="flex items-start justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {share.institution?.name ?? 'Hospital'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[share.institution?.city, share.institution?.country]
                    .filter(Boolean)
                    .join(', ') || 'Connected'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="secondary" className="text-[10px]">
                  This is my hospital
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setProfileFor({
                      id: share.practice_id,
                      name: share.institution?.name ?? 'Hospital',
                    })
                  }
                >
                  <Info className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Details</span>
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>

      <HospitalProfileSheet
        practiceId={profileFor?.id ?? null}
        fallbackName={profileFor?.name}
        open={!!profileFor}
        onOpenChange={(o) => !o && setProfileFor(null)}
      />
    </Card>
  );
};
