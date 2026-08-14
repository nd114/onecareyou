import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { tenantHostUrl, tenantSlugFromHost } from '@/lib/tenant-host';

/**
 * Deprecated path-based institution entry (/i/:slug).
 * Branded intake now lives on the tenant's own host (lmc.onecare.you), so this
 * route only forwards old links. On a host that already resolves a tenant
 * (or local/preview hosts) we stay put and let the root route render.
 */
export default function LegacyInstitutionRedirect() {
  const { slug } = useParams<{ slug: string }>();

  useEffect(() => {
    if (!slug) {
      window.location.replace('/');
      return;
    }
    // Already on the right tenant host — just go to the root intake page.
    if (tenantSlugFromHost() === slug) {
      window.location.replace('/');
      return;
    }
    window.location.replace(tenantHostUrl(slug));
  }, [slug]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
