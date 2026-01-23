import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { 
  CreditCard, 
  Users, 
  Sparkles, 
  Clock, 
  ArrowUpRight,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Crown,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useNavigate } from 'react-router-dom';
import { useClinicianSubscription, CLINICIAN_TIER_INFO, ClinicianTier } from '@/hooks/useClinicianSubscription';

interface SubscriptionManagementCardProps {
  patientCount?: number;
}

export function SubscriptionManagementCard({ patientCount = 0 }: SubscriptionManagementCardProps) {
  const navigate = useNavigate();
  const { 
    subscription, 
    loading, 
    checkingStatus,
    checkSubscription,
    createCheckout, 
    openCustomerPortal,
    isSubscribed,
    isTrial,
    tier,
    patientLimit,
  } = useClinicianSubscription();

  const tierInfo = tier && tier !== 'expired' ? CLINICIAN_TIER_INFO[tier as keyof typeof CLINICIAN_TIER_INFO] : null;
  const usagePercentage = patientLimit > 0 ? Math.min((patientCount / patientLimit) * 100, 100) : 0;
  const isNearLimit = usagePercentage >= 80;
  const isAtLimit = patientCount >= patientLimit;

  const getTierBadgeVariant = (tier: ClinicianTier) => {
    switch (tier) {
      case 'enterprise': return 'default';
      case 'pro': return 'default';
      case 'solo': return 'secondary';
      case 'trial': return 'outline';
      case 'expired': return 'destructive';
      default: return 'outline';
    }
  };

  const getTierIcon = (tier: ClinicianTier) => {
    switch (tier) {
      case 'enterprise': return <Crown className="h-3 w-3" />;
      case 'pro': return <Sparkles className="h-3 w-3" />;
      default: return null;
    }
  };

  if (checkingStatus) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden">
      {tier === 'enterprise' && (
        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-primary/20 to-transparent pointer-events-none" />
      )}
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscription
          </div>
          <Badge variant={getTierBadgeVariant(tier)} className="flex items-center gap-1">
            {getTierIcon(tier)}
            {tierInfo?.name || 'Expired'}
          </Badge>
        </CardTitle>
        <CardDescription>
          Manage your plan and patient capacity
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Section */}
        {tier === 'expired' ? (
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Trial Expired</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your trial has ended. Subscribe to continue managing patients.
                </p>
              </div>
            </div>
          </div>
        ) : isTrial && subscription?.trial_ends_at ? (
          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-700 dark:text-amber-400">Trial Period</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your trial ends {formatDistanceToNow(new Date(subscription.trial_ends_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          </div>
        ) : isSubscribed && subscription?.subscription_end ? (
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-green-700 dark:text-green-400">Active Subscription</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Renews {format(new Date(subscription.subscription_end), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Patient Usage */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>Patient Usage</span>
            </div>
            <span className={isAtLimit ? 'text-destructive font-medium' : isNearLimit ? 'text-amber-600 font-medium' : ''}>
              {patientCount} / {patientLimit === 999999 ? 'Unlimited' : patientLimit}
            </span>
          </div>
          {patientLimit !== 999999 && (
            <Progress 
              value={usagePercentage} 
              className={`h-2 ${isAtLimit ? '[&>div]:bg-destructive' : isNearLimit ? '[&>div]:bg-amber-500' : ''}`}
            />
          )}
          {isAtLimit && tier !== 'enterprise' && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              You've reached your patient limit. Upgrade to add more.
            </p>
          )}
          {isNearLimit && !isAtLimit && tier !== 'enterprise' && (
            <p className="text-xs text-amber-600">
              You're approaching your patient limit. Consider upgrading soon.
            </p>
          )}
        </div>

        {/* Current Plan Features */}
        {tierInfo && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Plan Features</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              {tierInfo.features.slice(0, 4).map((feature, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                  {feature}
                </li>
              ))}
              {tierInfo.features.length > 4 && (
                <li className="text-xs text-primary cursor-pointer hover:underline" onClick={() => navigate('/clinician/pricing')}>
                  +{tierInfo.features.length - 4} more features
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          {tier === 'expired' || isTrial ? (
            <>
              <Button 
                className="flex-1 gradient-primary border-0"
                onClick={() => navigate('/clinician/pricing')}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                View Plans
              </Button>
              {tier !== 'expired' && (
                <Button 
                  variant="outline" 
                  onClick={() => createCheckout('solo')}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Subscribe Now'}
                </Button>
              )}
            </>
          ) : isSubscribed ? (
            <>
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={openCustomerPortal}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CreditCard className="h-4 w-4 mr-2" />
                )}
                Manage Billing
              </Button>
              {tier !== 'enterprise' && (
                <Button 
                  className="flex-1 gradient-primary border-0"
                  onClick={() => navigate('/clinician/pricing')}
                >
                  <ArrowUpRight className="h-4 w-4 mr-2" />
                  Upgrade
                </Button>
              )}
            </>
          ) : (
            <Button 
              className="flex-1 gradient-primary border-0"
              onClick={() => navigate('/clinician/pricing')}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              View Plans
            </Button>
          )}
        </div>

        {/* Refresh Status */}
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full text-xs text-muted-foreground"
          onClick={checkSubscription}
          disabled={checkingStatus}
        >
          {checkingStatus ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : null}
          Refresh subscription status
        </Button>
      </CardContent>
    </Card>
  );
}
