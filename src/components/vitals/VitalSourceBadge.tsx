import { Badge } from '@/components/ui/badge';
import { Database, User, Smartphone, Stethoscope } from 'lucide-react';
import { VitalSource } from '@/hooks/useVitals';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface VitalSourceBadgeProps {
  source: VitalSource;
  className?: string;
}

export function VitalSourceBadge({ source, className }: VitalSourceBadgeProps) {
  const config = {
    manual: {
      label: 'You',
      icon: User,
      variant: 'secondary' as const,
      tooltip: 'Recorded by you in OneCare',
    },
    clinician: {
      label: 'Clinician',
      icon: Stethoscope,
      variant: 'outline' as const,
      tooltip: 'Recorded by your clinician during a visit. It is their record of what they measured, so ask them if it needs changing.',
    },
    ehr_import: {
      label: 'EHR',
      icon: Database,
      variant: 'outline' as const,
      tooltip: 'Imported from your healthcare provider (read-only)',
    },
    device: {
      label: 'Device',
      icon: Smartphone,
      variant: 'secondary' as const,
      tooltip: 'Synced from connected device',
    },
  };

  const { label, icon: Icon, variant, tooltip } = config[source] || config.manual;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={variant} className={`gap-1 text-xs ${className}`}>
            <Icon className="h-3 w-3" />
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
