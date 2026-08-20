import { useState } from 'react';
import { Building2, Shield, Stethoscope, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSharingHistory } from '@/hooks/useSharingHistory';

const PAGE = 15;

/**
 * The record of who has had this patient's data.
 *
 * Kept in Settings rather than on Care Circle deliberately. Care Circle answers
 * "who can see me now", which is the question a patient asks often. This
 * answers "who has ever seen me, and what did they get" — asked rarely, usually
 * with a reason, and worth being complete rather than glanceable.
 *
 * It is append-only by construction: doctor events come from share_events,
 * hospital ones from the connection timestamps. Nothing here can be edited away
 * from inside the app.
 */
export function SharingHistorySection() {
  const { entries, isLoading } = useSharingHistory();
  const [shown, setShown] = useState(PAGE);

  return (
    <Card id="sharing-history">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4" />
          Sharing history
        </CardTitle>
        <CardDescription>
          Every time you gave someone access to your health record, changed what they could see, or
          stopped sharing. This is a permanent record — it cannot be edited or deleted, by you or by
          anyone else.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You have not shared your record with anyone yet.
          </p>
        ) : (
          <>
            <ul className="space-y-3">
              {entries.slice(0, shown).map((entry) => (
                <li key={entry.id} className="border-b last:border-0 pb-3 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-muted flex items-center justify-center">
                        {entry.kind === 'hospital' ? (
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm">
                          {entry.label}{' '}
                          <span className="font-medium">{entry.who}</span>
                        </p>
                        {entry.shared && entry.shared.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {entry.shared.map((item) => (
                              <Badge key={item} variant="outline" className="text-[10px]">
                                {item}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {entry.reason && (
                          <p className="mt-1 text-xs text-muted-foreground">{entry.reason}</p>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(entry.at), 'd MMM yyyy')}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            {entries.length > shown && (
              <div className="pt-3">
                <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>
                  Show earlier ({entries.length - shown} more)
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
