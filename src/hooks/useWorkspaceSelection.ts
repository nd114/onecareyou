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
function readSelection(userId: string | undefined): string | null {
  if (!userId) return null;
  try {
    return localStorage.getItem(storageKey(userId));
  } catch {
    // A private window or blocked storage should not crash the app — it
    // just means a selector is offered again this session.
    return null;
  }
}

export function useWorkspaceSelection(userId: string | undefined) {
  // Read on the first render rather than in an effect. useClinicianCapabilities
  // asks which workspace is current in order to answer `can(...)`, and a single
  // tick of "nothing chosen" resolves to the wrong membership — briefly gating
  // routes on another tenant's role before the effect corrects it.
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(() =>
    readSelection(userId),
  );

  // Still an effect, for the account changing under the same mount. Re-setting
  // an identical value is a no-op, so the common case does not re-render.
  useEffect(() => {
    setSelectedWorkspaceId(readSelection(userId));
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
