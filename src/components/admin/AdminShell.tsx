import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  BookOpen,
  Briefcase,
  FileText,
  Gauge,
  Heart,
  LayoutGrid,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Upload,
  Users,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminAttention, useAdminPulse } from '@/hooks/useAdminToday';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/** Remembered across visits — a founder who collapses the rail once wants it to stay collapsed. */
const COLLAPSE_KEY = 'onecare-admin-rail-collapsed';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Gauge;
  /** 'exact' for /admin itself, which prefixes every other route. */
  match?: 'exact';
  badge?: number;
}

/**
 * The console shell.
 *
 * Eleven destinations had outgrown a row of tabs, so navigation moved into a
 * rail that stays put. The rail also carries the platform's vital signs: four
 * readouts in fixed positions, always on screen whichever section is open.
 * Position and colour do the reading — a number only takes a colour when it
 * means something is wrong — so the founder can take the state of the platform
 * in without parsing a word of it, the way a monitor is read rather than a
 * report.
 */
export function AdminShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(COLLAPSE_KEY) === 'true',
  );

  // On <html> so portalled sheets, dialogs, dropdowns and toasts get the
  // console palette too — they render outside this component's tree.
  useEffect(() => {
    document.documentElement.classList.add('admin-surface');
    return () => document.documentElement.classList.remove('admin-surface');
  }, []);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, String(collapsed));
  }, [collapsed]);

  return (
    <TooltipProvider delayDuration={200}>
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        {/* Desktop rail */}
        <aside
          className={cn(
            'hidden lg:flex shrink-0 flex-col border-r sticky top-0 h-screen transition-[width] duration-200 ease-out',
            collapsed ? 'w-[68px]' : 'w-[248px]',
          )}
          style={{
            backgroundColor: 'hsl(var(--console-rail))',
            borderColor: 'hsl(var(--console-rail-border))',
          }}
        >
          <RailContents collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          {/* Topbar */}
          <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-xl">
            <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden -ml-2" aria-label="Menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-[268px] p-0"
                  style={{ backgroundColor: 'hsl(var(--console-rail))' }}
                >
                  <SheetTitle className="sr-only">Console navigation</SheetTitle>
                  <SheetDescription className="sr-only">
                    Platform vitals and every section of the console.
                  </SheetDescription>
                  <RailContents onNavigate={() => setMobileOpen(false)} />
                </SheetContent>
              </Sheet>

              <div className="min-w-0 flex-1">
                <h1 className="text-sm font-semibold tracking-tight truncate">{title}</h1>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {actions}
                <ThemeToggle />
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-7">
            <div className="mx-auto w-full max-w-6xl">
              {description && (
                <p className="text-sm text-muted-foreground mb-6 max-w-2xl">{description}</p>
              )}
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}

function RailContents({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: {
  onNavigate?: () => void;
  /** Only the desktop rail ever collapses — the mobile sheet is always full width. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const { pathname } = useLocation();
  const { items } = useAdminAttention();
  const { pulse } = useAdminPulse();

  const needsYou = items.length;
  const critical = items.filter((i) => i.severity === 'critical').length;
  const failures = (pulse?.sync_failures ?? 0) + (pulse?.signin_partner_failures ?? 0);

  const oversight: NavItem[] = [
    { to: '/admin', label: 'Today', icon: Gauge, match: 'exact', badge: needsYou },
    { to: '/admin/accounts', label: 'Accounts', icon: Users },
    { to: '/admin/revenue', label: 'Revenue', icon: Wallet },
    { to: '/admin/reliability', label: 'Reliability', icon: Activity, badge: failures },
    { to: '/admin/trust', label: 'Trust', icon: ShieldCheck },
  ];

  const workshop: NavItem[] = [
    { to: '/admin/workshop', label: 'Workshop', icon: LayoutGrid },
    { to: '/admin/careers', label: 'Careers', icon: Briefcase },
    { to: '/admin/changelog', label: 'Changelog', icon: FileText },
    { to: '/admin/docs', label: 'Docs', icon: BookOpen },
    { to: '/admin/import', label: 'Import', icon: Upload },
  ];

  const isActive = (item: NavItem) =>
    item.match === 'exact' ? pathname === item.to : pathname.startsWith(item.to);

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex items-center h-14 shrink-0 border-b"
        style={{ borderColor: 'hsl(var(--console-rail-border))' }}
      >
        <Link
          to="/admin"
          onClick={onNavigate}
          aria-label={collapsed ? 'OneCare Admin — Today' : undefined}
          className={cn(
            'flex items-center gap-2.5 min-w-0 h-full',
            collapsed ? 'flex-1 justify-center' : 'flex-1 px-4',
          )}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Heart className="h-4 w-4 text-primary-foreground" />
          </span>
          {!collapsed && (
            <>
              <span className="font-semibold tracking-tight truncate">OneCare</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground shrink-0">
                Admin
              </span>
            </>
          )}
        </Link>
        {!collapsed && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            className="mr-3 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {collapsed && onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand sidebar"
          className="flex h-8 shrink-0 items-center justify-center border-b text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          style={{ borderColor: 'hsl(var(--console-rail-border))' }}
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-4">
        <Vitals
          collapsed={collapsed}
          needsYou={needsYou}
          critical={critical}
          failures={failures}
          newAccounts={pulse?.new_accounts ?? 0}
          assistant={pulse?.assistant_conversations ?? 0}
        />

        <RailGroup label="Oversight" collapsed={collapsed}>
          {oversight.map((item) => (
            <RailLink
              key={item.to}
              item={item}
              active={isActive(item)}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </RailGroup>

        <RailGroup label="Workshop" collapsed={collapsed}>
          {workshop.map((item) => (
            <RailLink
              key={item.to}
              item={item}
              active={isActive(item)}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </RailGroup>
      </div>

      <RailAccount collapsed={collapsed} />
    </div>
  );
}

/**
 * The vitals. Four readouts, never reordered, so each is found by position.
 * Only the two that can mean trouble ever take a colour, and only when they do.
 */
function Vitals({
  needsYou,
  critical,
  failures,
  newAccounts,
  assistant,
  collapsed,
}: {
  needsYou: number;
  critical: number;
  failures: number;
  newAccounts: number;
  assistant: number;
  collapsed: boolean;
}) {
  const rows: Array<{ label: string; value: number; tone: 'neutral' | 'warn' | 'bad' }> = [
    {
      label: 'Needs you',
      value: needsYou,
      tone: critical > 0 ? 'bad' : needsYou > 0 ? 'warn' : 'neutral',
    },
    { label: 'Failures 24h', value: failures, tone: failures > 0 ? 'bad' : 'neutral' },
    { label: 'New accounts 24h', value: newAccounts, tone: 'neutral' },
    { label: 'Assistant 24h', value: assistant, tone: 'neutral' },
  ];

  // Collapsed: the numbers don't fit, but the four positions still can — a
  // dot per row, in the same order, so the rail is still scanned by position.
  if (collapsed) {
    return (
      <div
        className="flex flex-col items-center gap-2.5 pb-4 mb-2 border-b"
        style={{ borderColor: 'hsl(var(--console-rail-border))' }}
      >
        {rows.map((r) => (
          <Tooltip key={r.label}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  r.tone === 'bad' && 'bg-destructive',
                  r.tone === 'warn' && 'bg-primary',
                  r.tone === 'neutral' && 'bg-muted-foreground/50',
                )}
              />
            </TooltipTrigger>
            <TooltipContent side="right">
              {r.label}: {r.value}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    );
  }

  return (
    <div className="px-3 pb-4 mb-2 border-b" style={{ borderColor: 'hsl(var(--console-rail-border))' }}>
      <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Vitals
      </p>
      <div className="space-y-0.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-2 px-2 py-1">
            <span className="text-[13px] text-muted-foreground truncate">{r.label}</span>
            <span
              className={cn(
                'text-[13px] font-semibold tabular-nums shrink-0',
                r.tone === 'bad' && 'text-destructive',
                r.tone === 'warn' && 'text-primary',
                r.tone === 'neutral' && 'text-foreground',
              )}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RailGroup({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed: boolean;
  children: ReactNode;
}) {
  return (
    <div className="px-3 pb-3">
      {!collapsed && (
        <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
      )}
      <nav className="space-y-0.5">{children}</nav>
    </div>
  );
}

function RailLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  const link = (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        'relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        collapsed && 'justify-center px-0',
        active
          ? 'bg-card text-foreground font-medium shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-card/60',
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
      {collapsed ? (
        !!item.badge && item.badge > 0 && (
          <span className="absolute top-0.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
        )
      ) : (
        <>
          <span className="truncate">{item.label}</span>
          {!!item.badge && item.badge > 0 && (
            <span className="ml-auto shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[11px] font-semibold tabular-nums text-primary">
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </>
      )}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {!!item.badge && item.badge > 0 && ` · ${item.badge}`}
      </TooltipContent>
    </Tooltip>
  );
}

function RailAccount({ collapsed }: { collapsed: boolean }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const email = user?.email || 'Admin';

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out');
    navigate('/');
  };

  const trigger = (
    <DropdownMenuTrigger asChild>
      <button
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
          'hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          collapsed && 'justify-center px-0',
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
          {email.slice(0, 2).toUpperCase()}
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{email}</span>
        )}
      </button>
    </DropdownMenuTrigger>
  );

  return (
    <div className="border-t p-3 shrink-0" style={{ borderColor: 'hsl(var(--console-rail-border))' }}>
      <DropdownMenu>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="right">{email}</TooltipContent>
          </Tooltip>
        ) : (
          trigger
        )}
        <DropdownMenuContent align="start" side="top" className="w-56">
          <DropdownMenuLabel className="font-normal text-xs text-muted-foreground truncate">
            {email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
