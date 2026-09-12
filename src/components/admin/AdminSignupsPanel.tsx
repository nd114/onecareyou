import { Loader2, UserPlus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAdminSignups } from '@/hooks/useAdminInsights';
import { formatDay } from '@/lib/format-date';

/**
 * Who arrived, most recent first.
 *
 * This used to hold five hundred accounts behind a search box and two filters,
 * which made it a way to page through everyone who has ever signed up. That is
 * the browsing the console's privacy rule rules out (see admin-guide.md §2):
 * looking a person up is what Accounts is for, and it asks for a name first.
 *
 * What is left is the part that was actually a founder signal — the handful of
 * people who just arrived, for a welcome or a call. It is deliberately short
 * and has nothing to type into.
 */
const SHOWN = 8;

export function AdminSignupsPanel() {
  const { signups, isLoading } = useAdminSignups(SHOWN);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          Just arrived
        </CardTitle>
        <CardDescription>
          The {SHOWN} newest accounts. To find anyone else, search for them in Accounts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : signups.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Nobody has signed up yet.</p>
        ) : (
          <div className="space-y-1">
            {signups.map((s) => (
              <div
                key={s.user_id}
                className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 hover:bg-muted/60 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.name || s.email || 'Account'}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={s.is_clinician ? 'default' : 'secondary'} className="font-normal">
                    {s.is_clinician ? 'Clinician' : 'Patient'}
                  </Badge>
                  <span className="text-xs text-muted-foreground tabular-nums hidden sm:inline">
                    {formatDay(s.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
