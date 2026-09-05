/**
 * Where "home" is, once you are signed in.
 *
 * The logo and the Home link both point at `/`, and `/` rendered the marketing
 * page — or, on a tenant subdomain, a *sign-up form* — regardless of whether
 * anyone was signed in. So a patient who clicked the logo was shown the front
 * door of a building they were already inside, and a hospital's staff were
 * shown a registration page for an account they already had.
 *
 * The routing existed; it just lived only in SignIn's redirect effect. It is
 * here now so every caller agrees, because two copies of "where does this
 * person belong" is how they end up disagreeing.
 */

export interface HomeRouteRoles {
  /** Platform administrator. */
  isAdmin?: boolean;
  /** Owner or admin of a hospital tenant. */
  isTenantAdmin?: boolean;
  /** Any clinician, whether independent or on a hospital's staff. */
  isClinician?: boolean;
}

/**
 * A platform admin belongs on the console, and then clinical work wins over
 * administrative work.
 *
 * The order used to put `isTenantAdmin` above `isClinician`, so a clinician who
 * owns their practice — which is what most practice owners are — was dropped on
 * the admin page every morning. An external review caught it, and it is the
 * same mistake the practice page itself used to make: optimising for the rare
 * task. Somebody running a clinic changes the billing currency perhaps twice a
 * year and sees patients every day.
 *
 * A tenant admin who is *not* a clinician — a practice manager, an
 * administrator — still lands on Practice, because for them it is the daily
 * work rather than the occasional errand.
 */
export function homeRouteFor(roles: HomeRouteRoles): string {
  if (roles.isAdmin) return '/admin';
  if (roles.isClinician) return '/clinician/today';
  if (roles.isTenantAdmin) return '/clinician/practice';
  return '/dashboard';
}

/**
 * Whether a signed-in person should be moved off the route they asked for.
 *
 * True for the public doors — the marketing root, sign-in and sign-up. Every
 * other public page (pricing, about, the privacy policy) stays readable while
 * signed in, because wanting to re-read the privacy policy is not a mistake.
 */
const PUBLIC_DOORS = new Set([
  '/',
  '/sign-in',
  '/sign-up',
  '/staff',
  '/clinician/sign-in',
]);

export function isPublicDoor(pathname: string): boolean {
  return PUBLIC_DOORS.has(pathname);
}
