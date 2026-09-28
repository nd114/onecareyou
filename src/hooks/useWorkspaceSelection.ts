import { useCallback, useSyncExternalStore } from 'react';

const storageKey = (userId: string) => `onecare:workspace:${userId}`;

/**
 * Every mounted reader of the choice, so one switch reaches all of them.
 *
 * This hook is called separately by usePractice, useClinicianProfile and
 * useClinicianCapabilities. It used to keep the choice in each caller's own
 * useState — so switching through the selector (usePractice's copy) left the
 * other two holding the old workspace until something remounted them. The
 * screens followed the switch; `can(...)`, every RequireCapability gate and
 * "is this person a tenant admin" did not. One store, many readers.
 */
const listeners = new Set<() => void>();

/**
 * Where a choice lives when localStorage refuses it — a private window or
 * blocked storage. The choice then lasts for the session rather than not at
 * all, which is what the per-instance state used to give.
 */
const memory = new Map<string, string>();

function readSelection(userId: string | undefined): string | null {
  if (!userId) return null;
  // `memory` holds a choice only while storage is refusing writes (see
  // selectWorkspace), so it never shadows a choice storage accepted. It is
  // consulted first because storage that refuses writes can still answer reads
  // (a full quota, or a private window that allows getItem and throws on
  // setItem), and would answer with the workspace from before the switch.
  const remembered = memory.get(userId);
  if (remembered !== undefined) return remembered;
  try {
    return localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab choosing a workspace for this account changes this tab's
  // answer too; `storage` only fires in the *other* tabs, which is why the
  // same-tab case goes through `listeners` instead.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith('onecare:workspace:')) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

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
 * Kept in this browser for this account rather than on the server: it is a
 * workspace preference, not clinical data, and switching devices asking again
 * is the acceptable side of that trade-off.
 *
 * Read synchronously during render (useSyncExternalStore), so a capability
 * gate never answers for the wrong workspace for a tick before correcting.
 */
export function useWorkspaceSelection(userId: string | undefined) {
  const selectedWorkspaceId = useSyncExternalStore(
    subscribe,
    () => readSelection(userId),
    () => null,
  );

  const selectWorkspace = useCallback(
    (practiceId: string) => {
      if (!userId) return;
      try {
        localStorage.setItem(storageKey(userId), practiceId);
        // Storage has it, so storage is the answer again, including when
        // another tab or a site-data clear later changes it.
        memory.delete(userId);
      } catch {
        // Storage refused; the choice still applies for this session.
        memory.set(userId, practiceId);
      }
      for (const listener of listeners) listener();
    },
    [userId],
  );

  return { selectedWorkspaceId, selectWorkspace };
}
