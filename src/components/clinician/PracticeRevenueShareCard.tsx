import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Coins, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePractice } from '@/hooks/usePractice';
import { usePracticeTenant } from '@/hooks/usePracticeTenant';
import { PRICE_INFO } from '@/lib/pricing-constants';

interface RevenueShareSummary {
  connected_patients: number;
  paying_patients: number;
  revenue_share_pct: number;
}

/**
 * Read-only revenue-share summary for institutional partners. Numbers are an
 * estimate from currently connected patients — the invoice is the source of truth.
 */
export const PracticeRevenueShareCard = () => {
  const { currentPractice } = usePractice();
  const { tenant, isLoading } = usePracticeTenant(currentPractice?.id);

  // Counts come from the database because a tenant admin cannot read patients'
  // subscription rows directly, and "paying" is the number the share is owed on.
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['practice-revenue-share', currentPractice?.id],
    enabled: !!currentPractice?.id,
    queryFn: async () => {
      // Cast: newer than the generated types file (see useAuditLog).
      const { data, error } = await (supabase as any).rpc(
        'practice_revenue_share_summary',
        { _practice_id: currentPractice!.id },
      );
      if (error) throw error;
      return ((data ?? []) as RevenueShareSummary[])[0] ?? null;
    },
  });

  const pct = Number(tenant?.revenue_share_pct ?? 0);
  if (!currentPractice || (!isLoading && pct <= 0)) return null;

  const premiumMonthly = PRICE_INFO.premium_monthly.price;
  const connected = Number(summary?.connected_patients ?? 0);
  const paying = Number(summary?.paying_patients ?? 0);
  const estimate = (premiumMonthly * pct * paying) / 100;

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
        {isLoading || loadingSummary ? (
          <div className="flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Connected patients', value: String(connected) },
                { label: 'On a paid plan', value: String(paying) },
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
              Your {pct}% share is counted on connected patients who hold a paid plan, at the
              monthly premium price. Statements and payouts are issued monthly (coming soon).
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};
