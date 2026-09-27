import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

/**
 * Clinician workspace appearance.
 *
 * Two choices, both the clinician's own and both instant:
 *  - surface: the warm brand cream, or the console's paper/chalk ladder that the
 *    founder console already uses (high contrast, so amber and rose triage
 *    badges carry).
 *  - desktop navigation: the familiar top pillars + sub-tabs, or a left rail.
 *    Measured, the rail gives back the sub-tab row — 49px — on pages that have
 *    one, and nothing on pages that don't. The header stays, because it carries
 *    search, notifications and the account menu. It was first described as
 *    returning ~130px, which assumed the header went too.
 *
 * Phones and small tablets are untouched either way — the bottom bar and
 * hamburger stay, because a rail or a tab row is not what a thumb wants on a
 * ward round.
 *
 * Stored per device in localStorage rather than on the profile: this is "how I
 * like *this* screen", and a doctor's phone and their clinic monitor are not the
 * same screen.
 */

export type ClinicianSurface = 'warm' | 'console';
export type ClinicianNavLayout = 'tabs' | 'rail';

const SURFACE_KEY = 'onecare-clinician-surface';
const LAYOUT_KEY = 'onecare-clinician-layout';
/** Same-tab listeners: `storage` only fires in *other* tabs. */
const EVENT = 'onecare-clinician-appearance';

function read<T extends string>(key: string, allowed: T[], fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(key) as T | null;
  return stored && allowed.includes(stored) ? stored : fallback;
}

export function getClinicianSurface(): ClinicianSurface {
  return read(SURFACE_KEY, ['warm', 'console'], 'warm');
}

export function getClinicianNavLayout(): ClinicianNavLayout {
  return read(LAYOUT_KEY, ['tabs', 'rail'], 'tabs');
}

export function useClinicianAppearance() {
  const [surface, setSurfaceState] = useState<ClinicianSurface>(getClinicianSurface);
  const [navLayout, setNavLayoutState] = useState<ClinicianNavLayout>(getClinicianNavLayout);

  useEffect(() => {
    const sync = () => {
      setSurfaceState(getClinicianSurface());
      setNavLayoutState(getClinicianNavLayout());
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setSurface = useCallback((next: ClinicianSurface) => {
    localStorage.setItem(SURFACE_KEY, next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const setNavLayout = useCallback((next: ClinicianNavLayout) => {
    localStorage.setItem(LAYOUT_KEY, next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { surface, navLayout, setSurface, setNavLayout };
}

/**
 * Puts the chosen surface and layout classes on <html> for as long as a
 * clinician screen is mounted, and takes them off on the way out.
 *
 * On <html> rather than on a wrapper because dialogs, sheets, dropdowns and
 * toasts portal to the end of <body>: scoped to a wrapper they would sit outside
 * it and come out with the wrong tokens.
 */
export function useApplyClinicianAppearance(enabled = true) {
  const { surface, navLayout } = useClinicianAppearance();

  // A layout effect, not a plain one. A plain effect runs after the browser has
  // painted, so every clinician page was drawn once without the classes and
  // then again with them: about a quarter of a second of the warm surface, and
  // with the rail on, the whole page jumping 240px sideways on every load. A
  // layout effect lands before that first paint.
  useLayoutEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;

    // Only take off what this effect put on. `admin-surface` has a second
    // owner — AdminShell puts it on the founder console — and removing it
    // unconditionally on the way out meant a warm-surface clinician screen
    // could strip a class it never added.
    const added: string[] = [];
    const add = (name: string) => {
      if (root.classList.contains(name)) return;
      root.classList.add(name);
      added.push(name);
    };

    if (surface === 'console') add('admin-surface');
    if (navLayout === 'rail') add('clinician-rail');

    return () => {
      for (const name of added) root.classList.remove(name);
    };
  }, [enabled, surface, navLayout]);

  return { surface, navLayout };
}
