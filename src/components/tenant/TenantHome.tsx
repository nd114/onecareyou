import { Loader2 } from 'lucide-react';
import Landing from '@/pages/Landing';
import InstitutionSignUp from '@/pages/InstitutionSignUp';
import { tenantSlugFromHost } from '@/lib/tenant-host';
import { useInstitutionBranding } from '@/hooks/useInstitutionBranding';

/**
 * Root route resolver.
 * On a tenant subdomain (lmc.onecare.you) the tenant is resolved from the
 * database and its branded intake page is rendered in place — no redirect.
 * Unknown subdomains fall back to the marketing site.
 */
export function TenantHome() {
  const slug = tenantSlugFromHost();
  const { institution, isLoading } = useInstitutionBranding(slug);

  if (!slug) return <Landing />;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!institution) return <Landing />;

  return <InstitutionSignUp institution={institution} slug={slug} />;
}

export default TenantHome;
