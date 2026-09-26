import { useCallback, useEffect, useState } from 'react';
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
import { useGlobalSearch, type SearchResultKind } from '@/hooks/useGlobalSearch';
import { cn } from '@/lib/utils';

/**
 * Finding a patient or a page by typing, instead of by remembering where it is.
 *
 * Both triggers live here — the keyboard shortcut and the button phones get,
 * since there is no keyboard to press on a ward round — so the two can never
 * open different dialogs.
 *
 * What is offered is decided in useGlobalSearch, which draws only on what the
 * caller already had: pages the navigation would show them, patients already on
 * their list, documents their own RLS returns.
 */

const ICONS: Record<SearchResultKind, typeof User> = {
  patient: User,
  page: ArrowRight,
  document: FileText,
};

interface GlobalSearchProps {
  audience: 'clinician' | 'patient';
  /** Compact, for a crowded header. */
  iconOnly?: boolean;
  className?: string;
}

export function GlobalSearch({ audience, iconOnly = false, className }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const { groups, suggestion, isSearching, hasQuery, isEmpty } = useGlobalSearch(query, {
    audience,
    enabled: open,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      // Cmd+K is ours wherever it is pressed, including inside a text box —
      // otherwise the one place somebody reaches for search is the one place it
      // does not answer.
      event.preventDefault();
      setOpen((wasOpen) => !wasOpen);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // A dialog that reopens holding the last search is a dialog that shows stale
  // results for a moment before catching up.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const go = useCallback(
    (to: string) => {
      setOpen(false);
      navigate(to);
    },
    [navigate],
  );

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
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={
            audience === 'clinician'
              ? 'Search patients and pages…'
              : 'Search your record and pages…'
          }
        />
        <CommandList>
          {!hasQuery && (
            <CommandEmpty>
              {audience === 'clinician'
                ? 'Type a patient name, or the name of a page.'
                : 'Type what you are looking for.'}
            </CommandEmpty>
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
                    // Kind is part of the key: a page and a patient can share a
                    // route, and cmdk needs them distinct.
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
      </CommandDialog>
    </>
  );
}
