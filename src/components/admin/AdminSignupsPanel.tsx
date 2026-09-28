import { useState } from 'react';
import { Loader2, Search, UserPlus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { MIN_PERSON_SEARCH_LENGTH, useAdminSignups } from '@/hooks/useAdminInsights';
import { formatDay } from '@/lib/format-date';

/**
 * Who arrived, most recent first — once you name them.
 *
 * This used to hold five hundred accounts behind a search box and two filters,
 * which made it a way to page through everyone who has ever signed up. It was
 * then cut to the eight newest with nothing to type into, which still named
 * the newest people on the platform to anyone who opened the console. The
 * console's privacy rule (admin-guide.md §2, 20261006000000) is search, don't
 * browse, so this now asks for a name or email first, as Accounts does, and
 * admin_recent_signups returns nothing without one (20261009050000).
 */
const SHOWN = 8;

export function AdminSignupsPanel() {
  const [search, setSearch] = useState('');
  const { signups, isLoading, needsSearch } = useAdminSignups(search, SHOWN);
  const remaining = MIN_PERSON_SEARCH_LENGTH - search.trim().length;

  return (
    <Card>
      <CardHeader className="pb-3 gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            Just arrived
          </CardTitle>
          <CardDescription>
            Check on someone who has just signed up: the {SHOWN} newest accounts matching a name
            or email.
          </CardDescription>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email"
            className="pl-9"
            aria-label="Search recent signups"
          />
        </div>
      </CardHeader>
      <CardContent>
        {needsSearch ? (
          <p className="text-sm text-muted-foreground py-2">
            {search.trim().length === 0 ? (
              <>Nobody is listed until you search ({MIN_PERSON_SEARCH_LENGTH}+ characters).</>
            ) : remaining > 0 ? (
              <>
                Keep typing — {remaining} more character{remaining === 1 ? '' : 's'} to search.
              </>
            ) : (
              <>Searching…</>
            )}
          </p>
        ) : isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : signups.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Nobody matches that search.</p>
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
