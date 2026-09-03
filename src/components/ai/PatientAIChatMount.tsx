import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AIChatFAB } from './AIChatFAB';

/**
 * Where the patient assistant is available.
 *
 * This was an allowlist of routes, which meant every new patient screen
 * silently lost the assistant until somebody remembered to add it — /billing
 * had already fallen off. An assistant that is supposed to be ambient cannot
 * be opt-in per page.
 *
 * It is now the other way round: available on every signed-in patient screen
 * except the ones where it would be in the way. A new screen gets it by
 * default, which is the behaviour we actually want.
 */

/**
 * Places the assistant does not belong.
 *
 * - Clinician and admin surfaces have their own assistant with a different
 *   remit; the patient one must never appear there.
 * - Onboarding and install are single-purpose flows where a floating button
 *   competes with the one action the screen is asking for.
 * - Auth screens have no record to talk about yet.
 */
const NOT_HERE = [
  '/clinician',
  '/admin',
  '/practice-admin',
  '/onboarding',
  '/install',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/subscription-success',
  '/beta',
];

/** Public marketing routes, which are exact rather than prefixes. */
const PUBLIC_EXACT = new Set([
  '/',
  '/about',
  '/features',
  '/how-it-works',
  '/pricing',
  '/contact',
  '/help',
  '/careers',
  '/for-clinicians',
  '/ehr-comparison',
  '/privacy',
  '/terms',
  '/data-processing',
  '/disclaimer',
  '/sitemap',
]);

export function PatientAIChatMount() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  if (!user) return null;
  if (PUBLIC_EXACT.has(pathname)) return null;
  if (NOT_HERE.some((p) => pathname === p || pathname.startsWith(p + '/'))) return null;

  return <AIChatFAB />;
}
