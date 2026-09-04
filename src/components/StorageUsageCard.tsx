import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { HardDrive } from 'lucide-react';
import { useMyStorageUsage } from '@/hooks/useStorageUsage';
import { useSubscription } from '@/hooks/useSubscription';
import {
  PATIENT_STORAGE_GB,
  DURABILITY_POINTS,
  PATIENT_AUDIO_POINT,
  formatBytes,
  storagePercent,
} from '@/lib/storage-constants';

export const StorageUsageCard = () => {
  const { bytes, isLoading } = useMyStorageUsage();
  const { isPremium } = useSubscription();

  const allowance = isPremium ? PATIENT_STORAGE_GB.premium : PATIENT_STORAGE_GB.free;
  const pct = storagePercent(bytes, allowance);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HardDrive className="h-4 w-4 text-primary" />
          Storage
        </CardTitle>
        <CardDescription>
          Documents, lab reports and transcripts stored in your Health Vault.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-baseline justify-between text-sm mb-2">
            <span className="font-medium">
              {isLoading ? '—' : formatBytes(bytes)} used
            </span>
            <span className="text-muted-foreground">
              of {allowance < 1 ? `${allowance * 1000} MB` : `${allowance} GB`}
            </span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>

        <ul className="space-y-1.5 text-xs text-muted-foreground">
          {[...DURABILITY_POINTS, PATIENT_AUDIO_POINT].map((point) => (
            <li key={point} className="flex gap-2">
              <span aria-hidden className="text-primary">
                •
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};
