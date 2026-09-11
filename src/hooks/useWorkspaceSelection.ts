import { useCallback, useEffect, useState } from 'react';

const storageKey = (userId: string) => `onecare:workspace:${userId}`;

/**
 * Which of a clinician's practice memberships is active right now.
 *
 * Was: every reader of `practice_members` picked `memberships[0]`, ordered
 * however the query happened to come back, and called it current. A
 * clinician with a personal practice plus one or more hospital posts had no
 * way to choose, and "first" silently decided which capabilities, patients,
 * schedule and Practice screens they saw — including whether they even saw
 * themselves as a tenant admin at a hospital they own.
 *
 * `usePractice` and `useClinicianProfile` both read this so they agree on
 * "current" without depending on each other. Kept in this browser for this
 * account rather than on the server: it is a workspace preference, not
 * clinical data, and switching devices asking again is the acceptable side
 * of that trade-off, not a server round trip nobody else needs to see.
 */
export function useWorkspaceSelection(userId: string | undefined) {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setSelectedWorkspaceId(null);
      return;
    }
    try {
      setSelectedWorkspaceId(localStorage.getItem(storageKey(userId)));
    } catch {
      // A private window or blocked storage should not crash the app — it
      // just means a selector is offered again this session.
      setSelectedWorkspaceId(null);
    }
  }, [userId]);

  const selectWorkspace = useCallback(
    (practiceId: string) => {
      setSelectedWorkspaceId(practiceId);
      if (!userId) return;
      try {
        localStorage.setItem(storageKey(userId), practiceId);
      } catch {
        // Same as above: the choice still applies for this session.
      }
    },
    [userId],
  );

  return { selectedWorkspaceId, selectWorkspace };
}
