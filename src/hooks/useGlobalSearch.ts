import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { searchItems, didYouMean, normaliseForSearch } from '@/lib/search';
import type { Destination } from '@/lib/destinations';

/**
 * Matching and ranking for the search box. Deliberately fetches nothing of its
 * own except documents: the pages and patients it searches are handed in by the
 * caller, which is what keeps it from deciding access.
 *
 * ## Nothing here decides access
 *
 * A search that surfaces a row somebody could not otherwise open is a leak with
 * a helpful face, so no source here re-derives who may see what:
 *
 *   - **Pages** arrive already filtered by `navTargets` — the same pillars and
 *     the same `can(...)` the navigation itself uses.
 *   - **Patients** arrive as the list `useClinicianPatients` already loaded:
 *     private `provider_shares` plus consent-checked hospital assignments, the
 *     list the Patients screen renders. Search can only narrow it.
 *   - **Documents** go to `search_documents`, which is SECURITY INVOKER and
 *     matches only the caller's own documents (`user_id = auth.uid()`). RLS
 *     alone would also admit documents other people shared with the caller,
 *     and every hit here opens the caller's own Vault.
 *
 * ## Why the sources are inputs
 *
 * The first version called useClinicianPatients and useClinicianCapabilities
 * itself, unconditionally. So every patient page fetched a clinician's share
 * list for somebody who has none and threw it away, and every clinician page
 * refetched the whole panel on load whether or not search was ever opened. The
 * caller now fetches, and only from inside the open dialog.
 */

export type SearchResultKind = 'page' | 'patient' | 'document';

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  label: string;
  /** Second line — the pillar, the hospital or email, the document's category. */
  detail?: string | null;
  /** Where selecting it goes. */
  to: string;
  /** Ranking within its own kind. */
  score: number;
}

/** The shape of a patient on a clinician's list, as far as search needs it. */
export interface SearchablePatient {
  user_id: string;
  patient_name: string;
  patient_email: string | null;
  hospital_name: string | null;
  invite_code: string;
}

interface DocumentRow {
  id: string;
  title: string | null;
  file_name: string | null;
  category: string | null;
  score: number;
}

/** Enough characters to be a search rather than an enumeration of the table. */
const MIN_SERVER_QUERY = 2;

/** A palette is a shortcut, not a report. Long lists defeat the point. */
const PER_GROUP_LIMIT = 6;

/** Settings alone has half a dozen sections; a query for it should show them all. */
const DESTINATION_LIMIT = 8;

export interface SearchSources {
  pages: Destination[];
  /** A clinician's panel. Empty on the patient side, which has no panel. */
  patients: readonly SearchablePatient[];
  /**
   * Patient side only, for now, and for a plain reason: `search_documents`
   * returns no owning patient, so a clinician's hit has nowhere to go — the
   * Vault it lives in is a patient's. Sending them to the patient list instead
   * would look like a shortcut and not be one. Giving the function a patient
   * reference means dropping and recreating it (a RETURNS TABLE column cannot
   * be added in place), which belongs in its own change.
   */
  documents: boolean;
}

export function useGlobalSearch(query: string, sources: SearchSources) {
  const { user } = useAuth();
  const { pages, patients, documents: wantsDocuments } = sources;

  const trimmed = query.trim();
  const settled = useDebouncedValue(trimmed, 200);

  const pageResults = useMemo<SearchResult[]>(() => {
    if (!trimmed) return [];
    return searchItems(pages, trimmed, (page) => [page.label, ...page.keywords, page.group], {
      limit: DESTINATION_LIMIT,
    }).map(({ item, score }) => ({
      kind: 'page' as const,
      id: item.to,
      label: item.label,
      detail: item.group,
      to: item.to,
      score,
    }));
  }, [pages, trimmed]);

  const patientResults = useMemo<SearchResult[]>(() => {
    if (!trimmed || patients.length === 0) return [];
    return searchItems(
      patients,
      trimmed,
      // Name first so a name match outranks an address that merely contains the
      // same letters.
      (patient) => [patient.patient_name, patient.patient_email],
      { limit: PER_GROUP_LIMIT },
    ).map(({ item, score }) => ({
      kind: 'patient' as const,
      id: item.user_id,
      label: item.patient_name,
      detail: item.hospital_name ?? item.patient_email,
      // The route the Patients list itself navigates to, so opening from search
      // lands on the page whose useRecordAccessLog writes the access-log entry
      // — rather than logging from here as well and counting twice.
      to: `/clinician/patients/${item.invite_code}`,
      score,
    }));
  }, [patients, trimmed]);

  const {
    data: documentResults = [],
    isFetching: documentsFetching,
    isError: documentsFailed,
  } = useQuery({
    queryKey: ['global-search-documents', user?.id ?? null, settled],
    queryFn: async (): Promise<SearchResult[]> => {
      const { data, error } = await supabase.rpc('search_documents', {
        query: settled,
        max_results: PER_GROUP_LIMIT,
      });
      if (error) throw error;
      return ((data ?? []) as DocumentRow[]).map((row) => ({
        kind: 'document' as const,
        id: row.id,
        label: row.title || row.file_name || 'Untitled document',
        detail: row.category,
        to: '/health-vault',
        score: row.score,
      }));
    },
    enabled: wantsDocuments && !!user && settled.length >= MIN_SERVER_QUERY,
    // The same query inside one sitting should not go back to the server.
    staleTime: 30_000,
  });

  /**
   * Only ever a whole page or patient name that exists, and only when nothing
   * matched — offering a correction beside results teaches people to distrust
   * the results.
   */
  const suggestion = useMemo(() => {
    if (!trimmed) return null;
    if (pageResults.length || patientResults.length || documentResults.length) return null;
    return (
      didYouMean(patients, trimmed, (patient) => [patient.patient_name]) ??
      didYouMean(pages, trimmed, (page) => [page.label])
    );
  }, [trimmed, pageResults.length, patientResults.length, documentResults.length, patients, pages]);

  /**
   * Somebody typing a destination's own name ("settings", "billing") wants to
   * go there, so those lead. Otherwise patients and records come first: a name
   * is far more often a person than a page, and a stray page match should not
   * push the person they typed down the list.
   */
  const destinationNamed = useMemo(() => {
    const wanted = normaliseForSearch(trimmed);
    return !!wanted && pageResults.some((r) => normaliseForSearch(r.label) === wanted);
  }, [pageResults, trimmed]);

  const groups = useMemo(() => {
    const go = { kind: 'page' as const, heading: 'Go to', results: pageResults };
    const patientsGroup = { kind: 'patient' as const, heading: 'Patients', results: patientResults };
    const docsGroup = { kind: 'document' as const, heading: 'Documents', results: documentResults };
    return (destinationNamed ? [go, patientsGroup, docsGroup] : [patientsGroup, go, docsGroup]).filter(
      (group) => group.results.length > 0,
    );
  }, [patientResults, pageResults, documentResults, destinationNamed]);

  // Only a server source can lag behind the typing; the in-memory ones answer
  // on the keystroke. Without the `wantsDocuments` guard the clinician side sat
  // in "searching" for every debounce window with no request to wait for.
  const waitingOnServer =
    wantsDocuments && (documentsFetching || (settled !== trimmed && trimmed.length >= MIN_SERVER_QUERY));

  return {
    groups,
    suggestion,
    isSearching: waitingOnServer,
    /** Documents could not be searched; pages and patients still answered. */
    documentsFailed,
    hasQuery: trimmed.length > 0,
    isEmpty: trimmed.length > 0 && groups.length === 0,
  };
}
