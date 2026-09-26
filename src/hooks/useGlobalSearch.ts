import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useClinicianCapabilities } from '@/hooks/useClinicianCapabilities';
import { useClinicianPatients } from '@/hooks/useClinicianPatients';
import { searchItems, didYouMean } from '@/lib/search';
import {
  CLINICIAN_PILLARS,
  PATIENT_PILLARS,
  navTargets,
  type NavTarget,
} from '@/lib/nav-ia';

/**
 * One search box for pages, patients and documents.
 *
 * ## Nothing here decides access
 *
 * A search that surfaces a row somebody could not otherwise open is a leak with
 * a helpful face, so no source in this file re-derives who may see what:
 *
 *   - **Pages** come from `navTargets`, filtered by the same `can(...)` the
 *     navigation itself uses. Offering a page the sidebar hides would be a way
 *     around the role.
 *   - **Patients** are filtered out of the list `useClinicianPatients` has
 *     already loaded — private `provider_shares` plus consent-checked hospital
 *     assignments. That list is what the Patients screen renders, so search can
 *     only ever narrow it. A second server-side patient search would mean a
 *     second copy of the access rules, which is how the two drift apart.
 *   - **Documents** go to `search_documents`, which is SECURITY INVOKER: the
 *     caller's own RLS decides which rows exist to be matched. The query text
 *     never widens the result set.
 *
 * So the server answers for anything it holds, and the client only ever filters
 * what it was already given. Neither path can be talked into more than the
 * person already had.
 */

export type SearchResultKind = 'page' | 'patient' | 'document';

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  label: string;
  /** Second line — the pillar, the patient's email, the document's category. */
  detail?: string | null;
  /** Where selecting it goes. */
  to: string;
  /** Ranking within its own kind. */
  score: number;
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

export interface GlobalSearchOptions {
  /**
   * Which side of the product is searching. A patient searches their own
   * record; a clinician searches the patients they can reach.
   */
  audience: 'clinician' | 'patient';
  /** Skip all work while the dialog is shut. */
  enabled?: boolean;
}

export function useGlobalSearch(query: string, options: GlobalSearchOptions) {
  const { audience, enabled = true } = options;
  const { user } = useAuth();
  const { can } = useClinicianCapabilities();

  const trimmed = query.trim();
  const settled = useDebouncedValue(trimmed, 200);

  // A patient's own record is reached through the patient pillars; a clinician's
  // panel through the clinician ones. `can` is irrelevant on the patient side —
  // patient tabs carry no capability — so passing it through is harmless.
  const pages = useMemo<NavTarget[]>(
    () => navTargets(audience === 'clinician' ? CLINICIAN_PILLARS : PATIENT_PILLARS, can),
    [audience, can],
  );

  // Only the clinician side has a panel to search. Calling this on the patient
  // side would fetch a clinician's shares for somebody who has none.
  const { patients } = useClinicianPatients();
  const panel = audience === 'clinician' ? patients : [];

  const pageResults = useMemo<SearchResult[]>(() => {
    if (!trimmed) return [];
    return searchItems(pages, trimmed, (page) => [page.label, page.group], {
      limit: PER_GROUP_LIMIT,
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
    if (!trimmed || panel.length === 0) return [];
    return searchItems(
      panel,
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
      // The same route the Patients list uses, so opening from search lands on
      // the page that writes the access-log entry (useRecordAccessLog) rather
      // than logging separately from here and counting twice.
      to: `/clinician/patients/${item.invite_code}`,
      score,
    }));
  }, [panel, trimmed]);

  // Patient side only, for now, and for a plain reason: `search_documents`
  // returns no owning patient, so a clinician's hit has nowhere to go — the
  // Vault it lives in is a patient's. Sending them to the patient list instead
  // would be a result that looks like a shortcut and is not one. Giving the
  // function a patient reference means dropping and recreating it (a RETURNS
  // TABLE column cannot be added in place), which belongs in its own change.
  const wantsDocuments = audience === 'patient';

  const { data: documents = [], isFetching: documentsFetching } = useQuery({
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
    enabled: enabled && wantsDocuments && !!user && settled.length >= MIN_SERVER_QUERY,
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
    if (pageResults.length || patientResults.length || documents.length) return null;
    return (
      didYouMean(panel, trimmed, (patient) => [patient.patient_name]) ??
      didYouMean(pages, trimmed, (page) => [page.label])
    );
  }, [trimmed, pageResults.length, patientResults.length, documents.length, panel, pages]);

  const groups = useMemo(
    () =>
      [
        { kind: 'patient' as const, heading: 'Patients', results: patientResults },
        { kind: 'page' as const, heading: 'Pages', results: pageResults },
        { kind: 'document' as const, heading: 'Documents', results: documents },
      ].filter((group) => group.results.length > 0),
    [patientResults, pageResults, documents],
  );

  return {
    groups,
    suggestion,
    /** True while the server half is still catching up with the typing. */
    isSearching: documentsFetching || settled !== trimmed,
    hasQuery: trimmed.length > 0,
    isEmpty: trimmed.length > 0 && groups.length === 0,
  };
}
