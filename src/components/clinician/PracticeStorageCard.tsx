import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { HardDrive } from 'lucide-react';
import { usePractice } from '@/hooks/usePractice';
import { usePracticeStorageUsage } from '@/hooks/useStorageUsage';
import { useClinicianSubscription } from '@/hooks/useClinicianSubscription';
import {
  CLINICIAN_STORAGE_GB,
  STORAGE_PACKS,
  DURABILITY_POINTS,
  formatBytes,
  storagePercent,
} from '@/lib/storage-constants';

export const PracticeStorageCard = () => {
  const { currentPractice } = usePractice();
  const { tier } = useClinicianSubscription();
  const { bytes, isLoading } = usePracticeStorageUsage(currentPractice?.id);

  const allowance = CLINICIAN_STORAGE_GB[tier] ?? CLINICIAN_STORAGE_GB.trial;
  const pct = storagePercent(bytes, allowance);
  const nearLimit = pct >= 80;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <HardDrive className="h-4 w-4 text-primary" />
              Storage &amp; durability
            </CardTitle>
            <CardDescription>
              Pooled across your team: documents, dictation transcripts and imported records.
            </CardDescription>
          </div>
          {nearLimit && <Badge variant="destructive">Near limit</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex items-baseline justify-between text-sm mb-2">
            <span className="font-medium">{isLoading ? '—' : formatBytes(bytes)} used</span>
            <span className="text-muted-foreground">
              of {allowance} GB included on your plan
            </span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>

        <div>
          <p className="text-sm font-medium mb-2">Need more room?</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {STORAGE_PACKS.map((pack) => (
              <div key={pack.gb} className="rounded-lg border p-3">
                <p className="text-sm font-semibold">{pack.label}</p>
                <p className="text-xs text-muted-foreground">${pack.price}/month</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Storage packs are added to your plan — no per-GB surprises. Contact us to add one
            (self-serve packs coming soon).
          </p>
        </div>

        <div>
          <p className="text-sm font-medium mb-2">How we protect it</p>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {DURABILITY_POINTS.map((point) => (
              <li key={point} className="flex gap-2">
                <span aria-hidden className="text-primary">
                  •
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
