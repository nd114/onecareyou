import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'onecare-active-workspace';
const EVENT = 'onecare-workspace-change';

function getSnapshot() {
  return typeof window === 'undefined' ? null : window.localStorage.getItem(KEY);
}

function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

/** `null` means the user's first hospital; `personal` means independent work. */
export function useActiveWorkspace() {
  const workspaceId = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const setWorkspaceId = useCallback((id: string) => {
    window.localStorage.setItem(KEY, id);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { workspaceId, setWorkspaceId };
}