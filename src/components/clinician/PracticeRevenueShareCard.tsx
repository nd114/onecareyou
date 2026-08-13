import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Coins, Loader2 } from 'lucide-react';
import { usePractice } from '@/hooks/usePractice';
import { usePracticeTenant } from '@/hooks/usePracticeTenant';
import { usePracticeSharedPatients } from '@/hooks/usePracticeShares';
import { PRICE_INFO } from '@/lib/pricing-constants';

/**
 * Read-only revenue-share summary for institutional partners. Numbers are an
 * estimate from currently connected patients — the invoice is the source of truth.
 */
export const PracticeRevenueShareCard = () => {
  const { currentPractice } = usePractice();
  const { tenant, isLoading } = usePracticeTenant(currentPractice?.id);
  const { activeShares, isLoading: loadingShares } = usePracticeSharedPatients(
    currentPractice?.id,
  );

  const pct = Number(tenant?.revenue_share_pct ?? 0);
  if (!currentPractice || (!isLoading && pct <= 0)) return null;

  const premiumMonthly = PRICE_INFO?.monthly?.price ?? 0;
  const connected = activeShares.length;
  const estimate = (premiumMonthly * pct * connected) / 100;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="h-4 w-4 text-primary" />
              Revenue share
            </CardTitle>
            <CardDescription>
              Your share of premium subscriptions from patients connected to{' '}
              {currentPractice.name}.
            </CardDescription>
          </div>
          <Badge variant="secondary">{pct}%</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading || loadingShares ? (
          <div className="flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Connected patients', value: String(connected) },
                { label: 'Share rate', value: `${pct}%` },
                {
                  label: 'Est. monthly',
                  value: `$${estimate.toFixed(2)}`,
                },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-lg font-semibold mt-0.5">{stat.value}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Estimate assumes every connected patient holds a premium plan. Statements and
              payouts are issued monthly (coming soon).
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};
