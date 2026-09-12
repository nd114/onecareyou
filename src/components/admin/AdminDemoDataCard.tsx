import { Building2, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminDemoSeed } from '@/hooks/useAdminDemoSeed';

/** Provision or refresh the fixed demo accounts used for testing and sales walkthroughs. */
export function AdminDemoDataCard() {
  const { seedPatients, isSeedingPatients, seedHospital, isSeedingHospital } = useAdminDemoSeed();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Demo data</CardTitle>
        <CardDescription>
          Provisions a fixed set of demo accounts with a shared, known password. Safe to re-run —
          each one upserts the same accounts rather than creating new ones. Never use against a
          real hospital's tenant.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Users className="h-4 w-4 text-primary" />
            Patients &amp; clinicians
          </div>
          <p className="text-xs text-muted-foreground flex-1">
            Three clinicians, demo patients and their medications, vitals and documents.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={isSeedingPatients}
            onClick={() => seedPatients()}
          >
            {isSeedingPatients && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Seed patients &amp; clinicians
          </Button>
        </div>

        <div className="rounded-lg border p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Building2 className="h-4 w-4 text-primary" />
            Demo hospital
          </div>
          <p className="text-xs text-muted-foreground flex-1">
            A full hospital tenant with every practice role, so onboarding and permissions can be
            walked end to end.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={isSeedingHospital}
            onClick={() => seedHospital()}
          >
            {isSeedingHospital && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Seed demo hospital
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
