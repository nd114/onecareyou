import { useState } from 'react';
import { Loader2, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDay } from '@/lib/format-date';
import {
  useSetScribeMemberCap,
  type PracticeAccountOverview,
  type ScribeMemberUsage,
  type useAddonCheckout,
} from '@/hooks/usePracticeAccount';
import { AddonNotConfigured, minutes, pct } from './shared';

type Checkout = ReturnType<typeof useAddonCheckout>;

export function AccountScribeTab({ overview, checkout }: { overview: PracticeAccountOverview; checkout: Checkout }) {
  const { scribe } = overview;
  const total = scribe.pool_minutes + scribe.pack_minutes_remaining;
  const over = scribe.pool_minutes > 0 && scribe.used_minutes > scribe.pool_minutes;
  const period =
    scribe.period_start && scribe.period_end
      ? `${formatDay(scribe.period_start)} to ${formatDay(scribe.period_end)}`
      : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scribe minutes</CardTitle>
          <CardDescription>
            Minutes are shared by the whole practice; you decide how to divide them.
            {period ? ` This period: ${period}.` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">Practice pool</span>
              <span className="text-xs text-muted-foreground" data-testid="scribe-pool-figures">
                {minutes(scribe.used_minutes)} of {minutes(scribe.pool_minutes)} used
              </span>
            </div>
            <Progress
              value={pct(scribe.used_minutes, scribe.pool_minutes)}
              className={`mt-1.5 h-1.5 ${over ? '[&>div]:bg-destructive' : ''}`}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Left from packs</p>
              <p className="mt-0.5 text-xl font-semibold" data-testid="scribe-pack-remaining">
                {minutes(scribe.pack_minutes_remaining)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Available in total</p>
              <p className="mt-0.5 text-xl font-semibold">{minutes(total)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => checkout.start('scribe_pack', 1)} disabled={checkout.pending !== null}>
              {checkout.pending === 'scribe_pack' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShoppingCart className="mr-2 h-4 w-4" />
              )}
              Buy a minutes pack
            </Button>
          </div>
          {checkout.notConfigured && <AddonNotConfigured subject="Scribe minutes pack" />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who is using them</CardTitle>
          <CardDescription>
            Leave a cap empty and that person draws on the shared pool without a personal limit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scribe.per_member.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">Nobody has used the scribe this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Used</TableHead>
                    <TableHead className="min-w-[230px]">Cap (minutes)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scribe.per_member.map((m) => (
                    <CapRow key={m.user_id} member={m} practiceId={overview.practice.id} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CapRow({ member, practiceId }: { member: ScribeMemberUsage; practiceId: string }) {
  const save = useSetScribeMemberCap(practiceId);
  const saved = member.cap_minutes === null ? '' : String(member.cap_minutes);
  const [draft, setDraft] = useState(saved);
  const trimmed = draft.trim();
  const parsed = trimmed === '' ? null : Number(trimmed);
  const valid = parsed === null || (Number.isInteger(parsed) && parsed >= 0);
  const dirty = trimmed !== saved;

  return (
    <TableRow data-testid={`scribe-row-${member.user_id}`}>
      <TableCell className="font-medium">{member.name}</TableCell>
      <TableCell className="whitespace-nowrap text-sm">{minutes(member.used_minutes)}</TableCell>
      <TableCell>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && dirty) save.mutate({ userId: member.user_id, capMinutes: parsed });
          }}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            placeholder="No cap"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={`Scribe cap in minutes for ${member.name}`}
            aria-invalid={!valid}
            className="h-8 w-28"
          />
          <Button type="submit" size="sm" variant="outline" className="h-8" disabled={!valid || !dirty || save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
        </form>
      </TableCell>
    </TableRow>
  );
}
