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
 * Checked most-specific first: a platform admin who also happens to be a
 * clinician belongs on the console, not in a patient list.
 */
export function homeRouteFor(roles: HomeRouteRoles): string {
  if (roles.isAdmin) return '/admin';
  if (roles.isTenantAdmin) return '/clinician/practice';
  if (roles.isClinician) return '/clinician/today';
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
