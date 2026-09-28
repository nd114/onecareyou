import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Search, User, ArrowRight } from 'lucide-react';
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
import { CLINICIAN_PILLARS, PATIENT_PILLARS, navTargets } from '@/lib/nav-ia';
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
        title={audience === 'clinician' ? 'Search patients and pages' : 'Search your record'}
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
  const { can } = useClinicianCapabilities();
  const { patients } = useClinicianPatients();

  const sources = useMemo<SearchSources>(
    () => ({
      pages: navTargets(CLINICIAN_PILLARS, can),
      patients,
      documents: false,
    }),
    [can, patients],
  );

  return (
    <SearchBody
      sources={sources}
      onClose={onClose}
      placeholder="Search patients and pages…"
      hint="Type a patient name, or the name of a page."
    />
  );
}

/** Patient tabs carry no capability requirement, so nothing is ever withheld here. */
const PATIENT_SOURCES: SearchSources = {
  pages: navTargets(PATIENT_PILLARS, () => false),
  patients: [],
  documents: true,
};

function PatientSearchBody({ onClose }: BodyProps) {
  return (
    <SearchBody
      sources={PATIENT_SOURCES}
      onClose={onClose}
      placeholder="Search your record and pages…"
      hint="Type what you are looking for."
    />
  );
}

interface SearchBodyProps extends BodyProps {
  sources: SearchSources;
  placeholder: string;
  hint: string;
}

function SearchBody({ sources, onClose, placeholder, hint }: SearchBodyProps) {
  // Lives here rather than in GlobalSearch so that closing the dialog unmounts
  // it: a reopened search starts empty instead of flashing the last query's
  // results before catching up.
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { groups, suggestion, isSearching, hasQuery, isEmpty } = useGlobalSearch(query, sources);

  const go = useCallback(
    (to: string) => {
      onClose();
      navigate(to);
    },
    [navigate, onClose],
  );

  return (
    <>
      <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} />
      <CommandList>
        {!hasQuery && <CommandEmpty>{hint}</CommandEmpty>}

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
                  onSelect={() => go(result.to)}
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
