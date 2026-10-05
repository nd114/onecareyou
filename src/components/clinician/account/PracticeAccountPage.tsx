import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePractice } from '@/hooks/usePractice';
import { useAddonCheckout, usePracticeAccountOverview } from '@/hooks/usePracticeAccount';
import { AccountOverviewTab } from './AccountOverviewTab';
import { AccountPeopleTab } from './AccountPeopleTab';
import { AccountScribeTab } from './AccountScribeTab';
import { AccountAddonsTab } from './AccountAddonsTab';
import { AccountPartnershipTab } from './AccountPartnershipTab';

type TabId = 'overview' | 'people' | 'scribe' | 'addons' | 'partnership';

/**
 * The owner's configuration and operations page: seats, who has clinical
 * access, scribe minutes, add-ons and the partner programme.
 *
 * Who sees what: owners and admins see every tab. Somebody who only looks
 * after the money (manage_billing) sees the overview and the add-ons, which is
 * the part that is theirs. Anyone else gets nothing at all, not an error. The
 * database functions behind it refuse them too; this only keeps the page from
 * offering what would be refused.
 *
 * It shows seat counts and member names. It never shows patient data or
 * member email addresses.
 */
export function PracticeAccountPage({
  isAdmin,
  canManageBilling,
}: {
  isAdmin: boolean;
  canManageBilling: boolean;
}) {
  const { currentPractice } = usePractice();
  const { overview, isLoading, unavailable, error, refetch } = usePracticeAccountOverview(
    isAdmin || canManageBilling ? currentPractice?.id : null,
  );
  const checkout = useAddonCheckout(currentPractice?.id);
  const [params, setParams] = useSearchParams();

  if (!currentPractice || !(isAdmin || canManageBilling)) return null;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    ...(isAdmin ? [{ id: 'people' as const, label: 'People & access' }, { id: 'scribe' as const, label: 'Scribe' }] : []),
    { id: 'addons', label: 'Add-ons' },
    ...(isAdmin ? [{ id: 'partnership' as const, label: 'Partnership' }] : []),
  ];
  const requested = params.get('tab');
  const active: TabId = tabs.some((t) => t.id === requested) ? (requested as TabId) : 'overview';

  if (isLoading) {
    return (
      <div className="flex justify-center py-10" data-testid="account-loading">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (unavailable) {
    return (
      <Card data-testid="account-unavailable">
        <CardContent className="flex items-start gap-3 py-6 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">The account overview is not available yet</p>
            <p className="mt-1 text-muted-foreground">
              This is being switched on for your practice. Nothing is wrong with your account, and your
              patients and team are unaffected. Please check back shortly.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !overview) {
    return (
      <Card data-testid="account-error">
        <CardContent className="flex flex-col gap-3 py-6 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
            <p>We could not load the account overview. Nothing has changed.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs
      value={active}
      onValueChange={(v) => {
        const next = new URLSearchParams(params);
        if (v === 'overview') next.delete('tab');
        else next.set('tab', v);
        setParams(next, { replace: true });
      }}
    >
      {/* Scrolls sideways on a phone rather than wrapping into two rows. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList className="mb-4 w-max">
          {tabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value="overview" className="mt-0">
        <AccountOverviewTab overview={overview} />
      </TabsContent>
      {isAdmin && (
        <TabsContent value="people" className="mt-0">
          <AccountPeopleTab overview={overview} />
        </TabsContent>
      )}
      {isAdmin && (
        <TabsContent value="scribe" className="mt-0">
          <AccountScribeTab overview={overview} checkout={checkout} />
        </TabsContent>
      )}
      <TabsContent value="addons" className="mt-0">
        <AccountAddonsTab overview={overview} checkout={checkout} />
      </TabsContent>
      {isAdmin && (
        <TabsContent value="partnership" className="mt-0">
          <AccountPartnershipTab overview={overview} />
        </TabsContent>
      )}
    </Tabs>
  );
}
