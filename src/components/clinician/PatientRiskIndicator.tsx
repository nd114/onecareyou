import { useMemo } from 'react';
import { AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  assessPatientRisk,
  explainRiskLevel,
  type RiskLevel,
  type RiskSeverity,
  type RiskVital,
} from '@/lib/patient-risk';
import { resolveVitalConfig } from '@/types/health';
import { cn } from '@/lib/utils';

interface PatientRiskIndicatorProps {
  vitals: RiskVital[];
  adherenceRate?: number;
  className?: string;
  showDetails?: boolean;
}

const LEVEL = {
  high: {
    label: 'High Risk',
    chip: 'bg-severity-high/10 text-severity-high border-severity-high/20',
    Icon: AlertTriangle,
  },
  medium: {
    label: 'Moderate',
    chip: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    Icon: AlertCircle,
  },
  low: {
    label: 'Stable',
    chip: 'bg-status-success/10 text-status-success border-status-success/20',
    Icon: CheckCircle,
  },
} satisfies Record<RiskLevel, { label: string; chip: string; Icon: typeof AlertTriangle }>;

const DOT: Record<RiskSeverity, string> = {
  high: 'bg-severity-high',
  medium: 'bg-amber-500',
  low: 'bg-blue-500',
};

const CARD: Record<RiskSeverity, string> = {
  high: 'border-severity-high/30 bg-severity-high/5',
  medium: 'border-amber-500/30 bg-amber-500/5',
  low: 'border-border bg-muted/30',
};

/**
 * How worrying this patient is, and why.
 *
 * The assessment itself lives in src/lib/patient-risk.ts as a pure function —
 * it was inline here, which is how it came to score blood pressure on the
 * systolic alone, compare a Fahrenheit temperature against a Celsius range, and
 * report a patient getting better as a risk factor. This renders it.
 */
export function PatientRiskIndicator({
  vitals,
  adherenceRate,
  className,
  showDetails = false,
}: PatientRiskIndicatorProps) {
  const risk = useMemo(() => assessPatientRisk(vitals, adherenceRate), [vitals, adherenceRate]);
  const { label, chip, Icon } = LEVEL[risk.level];

  if (!showDetails) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={cn('gap-1 font-medium cursor-help', chip, className)}>
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            {risk.factors.length === 0 ? (
              <p className="text-sm">Every recorded reading is within its normal range.</p>
            ) : (
              <div className="space-y-1">
                {risk.factors.slice(0, 3).map((factor, i) => (
                  <p key={i} className="text-sm flex items-start gap-1.5">
                    <span className={cn('h-2 w-2 rounded-full mt-1.5 flex-shrink-0', DOT[factor.severity])} />
                    {factor.headline}
                  </p>
                ))}
                {risk.factors.length > 3 && (
                  <p className="text-xs text-muted-foreground">
                    +{risk.factors.length - 3} more — open the patient to see them all
                  </p>
                )}
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={cn('gap-1 font-medium', chip)}>
          <Icon className="h-3.5 w-3.5" />
          {label}
        </Badge>
        {risk.factors.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {risk.factors.length} finding{risk.factors.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* The rule that produced the level, against this patient's counts. It
          was two lines of code and nowhere on screen, so "High risk" above two
          moderate findings and nothing critical looked like the badge knew
          something it had not shown. A score a clinician cannot check is one
          they learn to skip. */}
      <p className="text-sm">{explainRiskLevel(risk)}</p>

      {risk.factors.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Every recorded reading is within its normal range, and doses are being taken.
        </p>
      ) : (
        <div className="space-y-2">
          {/* Each finding carries the range it breached and when it was taken —
              a number with no reference is not something to act on. */}
          {risk.factors.map((factor, i) => (
            <div key={i} className={cn('p-2.5 rounded-lg border text-sm', CARD[factor.severity])}>
              <div className="flex items-start gap-2">
                <span className={cn('h-2 w-2 rounded-full mt-1.5 flex-shrink-0', DOT[factor.severity])} />
                <div className="min-w-0">
                  <p className="font-medium">{factor.headline}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{factor.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Nothing was concluded about these, which is not the same as their
          being fine. Left unsaid, a cholesterol with no reference band leaves
          the badge reading Stable and the clinician none the wiser. */}
      {risk.unassessed.length > 0 && (
        <p className="text-xs text-muted-foreground border-t pt-2">
          Not assessed: {risk.unassessed.map((t) => resolveVitalConfig(t).label).join(', ')} — no reference range here, so
          nothing above covers {risk.unassessed.length === 1 ? 'it' : 'them'}.
        </p>
      )}
    </div>
  );
}
