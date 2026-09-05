import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { pageTitleForRoute } from '@/lib/page-title';

/**
 * Keeps the browser tab honest about where you are.
 *
 * Mounted once, above the routes. A page that sets its own SEOHead mounts
 * deeper and later, so its title still wins; this only fills the gap, which
 * on the signed-in side of the app was every screen.
 */
export function RouteTitle() {
  const { pathname } = useLocation();
  const title = pageTitleForRoute(pathname);
  if (!title) return null;
  return (
    <Helmet>
      <title>{title}</title>
      {/* Nothing behind the sign-in belongs in an index. */}
      <meta name="robots" content="noindex,nofollow" />
    </Helmet>
  );
}
