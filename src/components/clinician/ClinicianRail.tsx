import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Building2,
  CalendarDays,
  Heart,
  Inbox,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  CLINICIAN_PILLARS,
  getClinicianPillarForRoute,
  isNavTabActive,
  visibleTabs,
  type ClinicianPillarKey,
} from '@/lib/nav-ia';
import { useClinicianCapabilities } from '@/hooks/useClinicianCapabilities';
import { cn } from '@/lib/utils';

const COLLAPSE_KEY = 'onecare-clinician-rail-collapsed';

const PILLAR_ICONS: Record<ClinicianPillarKey, typeof Inbox> = {
  today: Inbox,
  patients: Users,
  communicate: CalendarDays,
  practice: Building2,
};

/**
 * The desktop alternative to the stacked pillar + sub-tab bars.
 *
 * Every destination a role can open is on screen at once, so switching section
 * is one click rather than two, and the page keeps the full height of the
 * monitor. Collapsing leaves the icons, never nothing — a rail that disappears
 * has no way back.
 *
 * Only rendered from lg up; phones keep their bottom bar.
 */
export function ClinicianRail() {
  const { pathname, hash } = useLocation();
  const { can, loading: capsLoading } = useClinicianCapabilities();
  const activePillar = getClinicianPillarForRoute(pathname);

  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(COLLAPSE_KEY) === 'true',
  );

  // The page's own offset comes from a class on <html>, so the rail's width and
  // the content's start can never disagree.
  useEffect(() => {
    document.documentElement.classList.toggle('clinician-rail-collapsed', collapsed);
    localStorage.setItem(COLLAPSE_KEY, String(collapsed));
    return () => document.documentElement.classList.remove('clinician-rail-collapsed');
  }, [collapsed]);

  const pillars = CLINICIAN_PILLARS.map((pillar) => ({
    ...pillar,
    tabs: capsLoading ? pillar.tabs : visibleTabs(pillar.tabs, can),
  })).filter((pillar) => pillar.tabs.length > 0);

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        aria-label="Clinician navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-[60] hidden lg:flex flex-col border-r',
          'bg-[hsl(var(--console-rail,var(--muted)))] border-[hsl(var(--console-rail-border,var(--border)))]',
          collapsed ? 'w-[4.5rem]' : 'w-60',
        )}
      >
        <div className={cn('flex h-16 items-center border-b border-border/60 px-3', collapsed && 'justify-center')}>
          <Link
            to="/clinician/today"
            aria-label="OneCare home"
            className="flex items-center gap-2 overflow-hidden"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl gradient-primary">
              <Heart className="h-5 w-5 text-primary-foreground" />
            </div>
            {!collapsed && (
              <div className="flex flex-col items-start leading-tight">
                <span className="font-display text-lg font-bold">OneCare</span>
                <span className="-mt-1 text-[10px] text-muted-foreground">for Clinicians</span>
              </div>
            )}
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {pillars.map((pillar) => {
            const Icon = PILLAR_ICONS[pillar.key];
            const isActiveSection = activePillar === pillar.key;

            if (collapsed) {
              return (
                <Tooltip key={pillar.key}>
                  <TooltipTrigger asChild>
                    <Link
                      to={pillar.primary}
                      className={cn(
                        'mb-1 flex h-10 items-center justify-center rounded-lg transition-colors',
                        isActiveSection
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{pillar.label}</TooltipContent>
                </Tooltip>
              );
            }

            return (
              <div key={pillar.key} className="mb-4">
                <div className="flex items-center gap-2 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                  {pillar.label}
                </div>
                <div className="space-y-0.5">
                  {pillar.tabs.map((tab) => {
                    const isActive = isNavTabActive(tab, pillar.tabs, pathname, hash);
                    return (
                      <Link
                        key={tab.to}
                        to={tab.to}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'block rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        {tab.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-border/60 p-2">
          {/* One click to dictation from wherever they are — the reason the rail
              earns its width on a clinic monitor. */}
          {(capsLoading || can('edit_clinical')) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link to="/clinician/scribe" className="block">
                  <Button
                    variant="secondary"
                    className={cn('w-full', collapsed ? 'px-0' : 'justify-start gap-2')}
                    aria-label="Start a visit note"
                  >
                    <Mic className="h-4 w-4" />
                    {!collapsed && 'Visit note'}
                  </Button>
                </Link>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right">Visit note</TooltipContent>}
            </Tooltip>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed((prev) => !prev)}
            className={cn('mt-1 w-full text-muted-foreground', collapsed ? 'px-0' : 'justify-start gap-2')}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && 'Collapse'}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
