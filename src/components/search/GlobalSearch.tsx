import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Lock, Mic, Search, User, ArrowRight } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import {
  useGlobalSearch,
  type SearchResultKind,
  type SearchSources,
} from '@/hooks/useGlobalSearch';
import { useClinicianCapabilities } from '@/hooks/useClinicianCapabilities';
import { useClinicianPatients } from '@/hooks/useClinicianPatients';
import { useAuth } from '@/contexts/AuthContext';
import { usePractice } from '@/hooks/usePractice';
import { usePracticeTenant } from '@/hooks/usePracticeTenant';
import { useClinicianSubscription, hasFeatureAccess } from '@/hooks/useClinicianSubscription';
import {
  buildDestinations,
  buildQuickActions,
  matchQuickActions,
  type QuickAction,
  readRecentPaths,
  recentDestinations,
  rememberPath,
} from '@/lib/destinations';
import { cn } from '@/lib/utils';

/**
 * Finding a patient or a page by typing, instead of by remembering where it is.
 *
 * Split in two on purpose. This outer part is always mounted — it owns the
 * header button and the keyboard shortcut, so the two can never open different
 * dialogs. The results live in a body that only exists while the dialog is
 * open (Radix does not mount a closed dialog's content), so nothing is fetched
 * for somebody who never searches, and each audience's body calls only its own
 * hooks: the patient side never asks for a clinician's panel.
 */

const ICONS: Record<SearchResultKind, typeof User> = {
  patient: User,
  page: ArrowRight,
  document: FileText,
};

type Audience = 'clinician' | 'patient';

interface GlobalSearchProps {
  audience: Audience;
  /** Compact, for a crowded header. */
  iconOnly?: boolean;
  className?: string;
}

/** Cmd+K on a Mac, Ctrl+K elsewhere — and nothing else that happens to include K. */
export function isSearchShortcut(event: KeyboardEvent): boolean {
  if (event.repeat) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  // Shift and Alt variants belong to other people: Ctrl+Shift+K opens
  // Firefox's web console, and taking it would break a developer tool.
  if (event.shiftKey || event.altKey) return false;
  // Lower-cased so Caps Lock does not make the shortcut stop working.
  return event.key.toLowerCase() === 'k';
}

export function GlobalSearch({ audience, iconOnly = false, className }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isSearchShortcut(event)) return;
      // Ours wherever it is pressed, including inside a text box — otherwise the
      // one place somebody reaches for search is the one place it does not
      // answer.
      event.preventDefault();
      setOpen((wasOpen) => !wasOpen);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <Button
        variant="ghost"
        size={iconOnly ? 'icon' : 'sm'}
        onClick={() => setOpen(true)}
        // Screen readers get the full name even when the button is just a glyph.
        aria-label="Search"
        className={cn(!iconOnly && 'gap-2 text-muted-foreground', className)}
      >
        <Search className="h-4 w-4" />
        {!iconOnly && (
          <>
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden md:inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium">
              <span className="text-xs">⌘</span>K
            </kbd>
          </>
        )}
      </Button>

      {/*
        shouldFilter={false} because useGlobalSearch has already matched and
        ranked. Left on, cmdk would match the typed query against each item's
        `value` — a uuid — and hide every result; and where it did agree, it
        would reorder past the accent- and typo-tolerant ranking search.ts did.
      */}
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        commandProps={{ shouldFilter: false }}
        title={audience === 'clinician' ? 'Search patients, pages and settings' : 'Search your record, pages and settings'}
      >
        {audience === 'clinician' ? (
          <ClinicianSearchBody onClose={() => setOpen(false)} />
        ) : (
          <PatientSearchBody onClose={() => setOpen(false)} />
        )}
      </CommandDialog>
    </>
  );
}

interface BodyProps {
  onClose: () => void;
}

function ClinicianSearchBody({ onClose }: BodyProps) {
  const { can, loading: capsLoading } = useClinicianCapabilities();
  const quickActions = useMemo(
    () => buildQuickActions({ can, loading: capsLoading }),
    [can, capsLoading],
  );
  const { patients } = useClinicianPatients();
  const { currentPractice } = usePractice();
  const { tenant } = usePracticeTenant(currentPractice?.id);
  const { tier } = useClinicianSubscription();
  const hasPractice = Boolean(currentPractice);
  const isHospital = (tenant?.tenant_type ?? 'practice') === 'hospital';
  const canManageTeam = hasFeatureAccess(tier, 'team_management');

  const sources = useMemo<SearchSources>(
    () => ({
      // Same context ClinicianPractice builds for its hub, so a practice
      // section is offered here exactly when the hub offers it.
      pages: buildDestinations({
        audience: 'clinician',
        can,
        practice: {
          hasPractice,
          isHospital,
          isAdmin: can('manage_team'),
          canManageTeam,
          canManageBilling: can('manage_billing'),
          canManageSettings: can('manage_settings'),
          canRoutePatients: can('assign_patients'),
        },
      }),
      patients,
      documents: false,
    }),
    [can, patients, hasPractice, isHospital, canManageTeam],
  );

  return (
    <SearchBody
      sources={sources}
      quickActions={quickActions}
      onClose={onClose}
      placeholder="Search patients, pages and settings…"
      hint="Type a patient name, or where you want to go."
    />
  );
}

/** Patient tabs carry no capability requirement, so nothing is ever withheld here. */
const PATIENT_SOURCES: SearchSources = {
  pages: buildDestinations({ audience: 'patient' }),
  patients: [],
  documents: true,
};

function PatientSearchBody({ onClose }: BodyProps) {
  return (
    <SearchBody
      sources={PATIENT_SOURCES}
      onClose={onClose}
      placeholder="Search your record, pages and settings…"
      hint="Type what you are looking for, or where you want to go."
    />
  );
}

interface SearchBodyProps extends BodyProps {
  sources: SearchSources;
  quickActions?: QuickAction[];
  placeholder: string;
  hint: string;
}

function SearchBody({ sources, quickActions = [], onClose, placeholder, hint }: SearchBodyProps) {
  // Lives here rather than in GlobalSearch so that closing the dialog unmounts
  // it: a reopened search starts empty instead of flashing the last query's
  // results before catching up.
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { groups, suggestion, isSearching, hasQuery, isEmpty, documentsFailed } = useGlobalSearch(
    query,
    sources,
  );

  // Where they went last, shown before they type. Read through the current
  // destination list so it can only ever contain places they can open now.
  const recents = useMemo(
    () => recentDestinations(sources.pages, readRecentPaths(user?.id)),
    [sources.pages, user?.id],
  );

  const visibleActions = useMemo(() => matchQuickActions(quickActions, query), [quickActions, query]);

  const go = useCallback(
    (to: string, remember = false) => {
      // Only destinations are remembered: never a patient or a document, so
      // nothing about who they treated is written to the browser.
      if (remember) rememberPath(user?.id, to);
      onClose();
      navigate(to);
    },
    [navigate, onClose, user?.id],
  );

  return (
    <>
      <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} />
      <CommandList>
        {visibleActions.length > 0 && (
          <CommandGroup heading="Quick actions">
            {visibleActions.map((action) => (
              <CommandItem
                key={`action:${action.id}`}
                value={`action:${action.id}`}
                disabled={!!action.lockedReason}
                onSelect={() => go(action.to, false)}
                className="gap-2"
              >
                {action.lockedReason ? (
                  <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Mic className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{action.label}</span>
                {action.lockedReason && (
                  <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">
                    {action.lockedReason}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!hasQuery && recents.length === 0 && visibleActions.length === 0 && <CommandEmpty>{hint}</CommandEmpty>}

        {!hasQuery && recents.length > 0 && (
          <CommandGroup heading="Recent">
            {recents.map((destination) => (
              <CommandItem
                key={`recent:${destination.to}`}
                value={`recent:${destination.to}`}
                onSelect={() => go(destination.to, true)}
                className="gap-2"
              >
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{destination.label}</span>
                <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">
                  {destination.group}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* A polite live region, so a screen reader hears that results are
            still on their way and, afterwards, that a source failed. */}
        <div role="status" aria-live="polite" className="sr-only">
          {isSearching ? 'Searching…' : documentsFailed ? 'Documents could not be searched.' : ''}
        </div>
        {isSearching && groups.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground" aria-hidden="true">
            Searching…
          </div>
        )}
        {documentsFailed && hasQuery && (
          <div className="px-4 py-2 text-xs text-muted-foreground">
            Documents could not be searched right now. Pages are still shown.
          </div>
        )}

        {isEmpty && !isSearching && (
          <CommandEmpty>
            {suggestion ? `No matches. Did you mean ${suggestion}?` : 'No matches.'}
          </CommandEmpty>
        )}

        {groups.map((group) => (
          <CommandGroup key={group.kind} heading={group.heading}>
            {group.results.map((result) => {
              const Icon = ICONS[result.kind];
              return (
                <CommandItem
                  // Kind is part of the key: a page and a patient can share an
                  // id, and cmdk needs them distinct.
                  key={`${result.kind}:${result.id}`}
                  value={`${result.kind}:${result.id}`}
                  onSelect={() => go(result.to, result.kind === 'page')}
                  className="gap-2"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{result.label}</span>
                  {result.detail && (
                    <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">
                      {result.detail}
                    </span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </>
  );
}
