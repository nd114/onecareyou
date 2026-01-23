import { AlertTriangle, ArrowUpRight, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useNavigate } from 'react-router-dom';
import { useClinicianSubscription, CLINICIAN_TIER_INFO } from '@/hooks/useClinicianSubscription';

interface PatientLimitBannerProps {
  patientCount: number;
}

export function PatientLimitBanner({ patientCount }: PatientLimitBannerProps) {
  const navigate = useNavigate();
  const { tier, patientLimit, isTrial } = useClinicianSubscription();

  // Don't show for enterprise (unlimited)
  if (tier === 'enterprise' || patientLimit === 999999) {
    return null;
  }

  const usagePercentage = patientLimit > 0 ? Math.min((patientCount / patientLimit) * 100, 100) : 0;
  const isNearLimit = usagePercentage >= 80;
  const isAtLimit = patientCount >= patientLimit;

  // Only show banner when near limit (80%+)
  if (!isNearLimit) {
    return null;
  }

  const tierInfo = tier && tier !== 'expired' ? CLINICIAN_TIER_INFO[tier as keyof typeof CLINICIAN_TIER_INFO] : null;
  
  // Determine upgrade suggestion
  const getUpgradeSuggestion = () => {
    if (isTrial || tier === 'trial') return { tier: 'solo', name: 'Solo', limit: 25 };
    if (tier === 'solo') return { tier: 'pro', name: 'Pro', limit: 100 };
    if (tier === 'pro') return { tier: 'enterprise', name: 'Enterprise', limit: 'unlimited' };
    return null;
  };

  const upgrade = getUpgradeSuggestion();

  return (
    <div className={`rounded-lg p-4 mb-4 ${
      isAtLimit 
        ? 'bg-destructive/10 border border-destructive/30' 
        : 'bg-amber-500/10 border border-amber-500/30'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isAtLimit ? 'bg-destructive/20' : 'bg-amber-500/20'
        }`}>
          {isAtLimit ? (
            <AlertTriangle className="h-5 w-5 text-destructive" />
          ) : (
            <Users className="h-5 w-5 text-amber-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className={`font-medium ${isAtLimit ? 'text-destructive' : 'text-amber-700 dark:text-amber-400'}`}>
              {isAtLimit ? 'Patient Limit Reached' : 'Approaching Patient Limit'}
            </p>
            <span className="text-sm font-medium">
              {patientCount} / {patientLimit}
            </span>
          </div>
          <Progress 
            value={usagePercentage} 
            className={`h-1.5 mt-2 ${isAtLimit ? '[&>div]:bg-destructive' : '[&>div]:bg-amber-500'}`}
          />
          <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {isAtLimit 
                ? 'You cannot add new patients until you upgrade.' 
                : `Only ${patientLimit - patientCount} patient slot${patientLimit - patientCount === 1 ? '' : 's'} remaining.`}
              {upgrade && ` Upgrade to ${upgrade.name} for ${typeof upgrade.limit === 'number' ? `${upgrade.limit} patients` : 'unlimited patients'}.`}
            </p>
            <Button 
              size="sm" 
              className="gradient-primary border-0 h-8"
              onClick={() => navigate('/clinician/pricing')}
            >
              <ArrowUpRight className="h-3 w-3 mr-1" />
              Upgrade Plan
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
