import { AlertTriangle, ArrowUpRight, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useEntitlements } from '@/hooks/useEntitlements';
import { EXISTING_UNAFFECTED, type LimitKind } from '@/lib/limit-errors';

/**
 * One banner for every plan limit.
 *
 * It says how much of the allowance is used and, at or over the limit, that
 * only new additions are paused: "Existing patients and records are
 * unaffected." Nothing is ever hidden or locked by a limit; an account over its
 * limit (because the limit was introduced after it grew) keeps everything.
 */

export type LimitBannerState = 'ok' | 'near' | 'at' | 'over';

/** Show from 80% of the allowance. A null limit is unlimited; a limit of 0 is "no plan", which has its own message elsewhere. */
export function limitBannerState(used: number, limit: number | null): LimitBannerState {
  if (limit === null || limit <= 0) return 'ok';
  if (used > limit) return 'over';
  if (used === limit) return 'at';
  return used / limit >= 0.8 ? 'near' : 'ok';
}

const NOUN: Record<LimitKind, { one: string; many: string; title: string; verb: string }> = {
  patients: { one: 'patient', many: 'patients', title: 'Patient limit', verb: 'patients' },
  seats: { one: 'team seat', many: 'team seats', title: 'Team seat limit', verb: 'team members' },
};

export function limitBannerCopy(
  kind: LimitKind,
  state: Exclude<LimitBannerState, 'ok'>,
  used: number,
  limit: number,
): { title: string; body: string } {
  const n = NOUN[kind];
  const unaffected = kind === 'patients' ? EXISTING_UNAFFECTED : 'Existing members and their access are unaffected.';
  if (state === 'near') {
    const left = limit - used;
    return {
      title: `Approaching ${n.title.toLowerCase()}`,
      body: `Only ${left} ${left === 1 ? n.one : n.many} remaining.`,
    };
  }
  if (state === 'at') {
    return {
      title: `${n.title} reached`,
      body: `You cannot add new ${n.verb} until a slot frees up or you upgrade. ${unaffected}`,
    };
  }
  return {
    title: `Over the ${n.title.toLowerCase()}`,
    body: `You have ${used.toLocaleString('en-US')} of ${limit.toLocaleString('en-US')}. New ${n.verb} are paused until you are back within the limit or you upgrade. ${unaffected}`,
  };
}

export interface LimitBannerProps {
  kind: LimitKind;
  used: number;
  /** null = unlimited (nothing is shown). */
  limit: number | null;
  /** e.g. "Upgrade to Individual for up to 150 patients." */
  upgradeHint?: string | null;
  onUpgrade?: () => void;
}

export function LimitBanner({ kind, used, limit, upgradeHint, onUpgrade }: LimitBannerProps) {
  const state = limitBannerState(used, limit);
  if (state === 'ok' || limit === null) return null;

  const blocked = state === 'at' || state === 'over';
  const { title, body } = limitBannerCopy(kind, state, used, limit);
  const pct = Math.min((used / limit) * 100, 100);

  return (
    <div
      role={blocked ? 'alert' : 'status'}
      data-testid={`limit-banner-${kind}`}
      data-state={state}
      className={`rounded-lg p-4 mb-4 ${
        blocked ? 'bg-destructive/10 border border-destructive/30' : 'bg-amber-500/10 border border-amber-500/30'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
            blocked ? 'bg-destructive/20' : 'bg-amber-500/20'
          }`}
        >
          {blocked ? (
            <AlertTriangle className="h-5 w-5 text-destructive" />
          ) : (
            <Users className="h-5 w-5 text-amber-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className={`font-medium ${blocked ? 'text-destructive' : 'text-amber-700 dark:text-amber-400'}`}>
              {title}
            </p>
            <span className="text-sm font-medium">
              {used} / {limit}
            </span>
          </div>
          <Progress
            value={pct}
            className={`h-1.5 mt-2 ${blocked ? '[&>div]:bg-destructive' : '[&>div]:bg-amber-500'}`}
          />
          <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {body}
              {upgradeHint ? ` ${upgradeHint}` : ''}
            </p>
            {onUpgrade && (
              <Button size="sm" className="gradient-primary border-0 h-8" onClick={onUpgrade}>
                <ArrowUpRight className="h-3 w-3 mr-1" />
                Upgrade Plan
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The banner wired to the signed-in person's entitlements. `used` can be
 * passed when the page already has its own count on screen, so the banner and
 * the list never disagree; otherwise the count comes from the database.
 */
export function EntitlementBanner({
  kind,
  used,
  upgradeHint,
  practiceId,
}: {
  kind: LimitKind;
  used?: number;
  upgradeHint?: string | null;
  /** For seats: only draw when the entitlements describe this practice. */
  practiceId?: string;
}) {
  const navigate = useNavigate();
  const { entitlements, ready } = useEntitlements();
  // Nothing is drawn until the answer is in: a default shown as fact is what
  // made limit warnings flash up and withdraw.
  if (!ready || !entitlements) return null;
  if (practiceId && entitlements.practiceId !== practiceId) return null;

  const limit = kind === 'patients' ? entitlements.patientLimit : entitlements.seatLimit;
  const count = used ?? (kind === 'patients' ? entitlements.patientCount : entitlements.seatCount);
  return (
    <LimitBanner
      kind={kind}
      used={count}
      limit={limit}
      upgradeHint={upgradeHint}
      onUpgrade={() => navigate('/clinician/pricing')}
    />
  );
}
