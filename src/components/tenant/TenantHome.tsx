import { Loader2 } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import Landing from '@/pages/Landing';
import InstitutionSignUp from '@/pages/InstitutionSignUp';
import InstitutionStaffSignUp from '@/pages/InstitutionStaffSignUp';
import { tenantSlugFromHost } from '@/lib/tenant-host';
import { useInstitutionBranding } from '@/hooks/useInstitutionBranding';

/**
 * Root route resolver.
 * On a tenant subdomain (lmc.onecare.you) the tenant is resolved from the
 * database and its branded intake page is rendered in place — no redirect.
 * Unknown subdomains fall back to the marketing site.
 *
 * The same address serves both audiences: `/` is patient intake and `/staff` is
 * clinician registration, so a hospital publishes one link for each and both
 * arrive somewhere that looks like the hospital.
 */
export function TenantHome({ audience = 'patient' }: { audience?: 'patient' | 'staff' } = {}) {
  const slug = tenantSlugFromHost();
  const { institution, isLoading } = useInstitutionBranding(slug);

  // Off a tenant host there is nothing to brand: patients get the marketing
  // site, staff get the generic clinician sign-up.
  if (!slug) return audience === 'staff' ? <Navigate to="/clinician/sign-up" replace /> : <Landing />;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!institution) {
    return audience === 'staff' ? <Navigate to="/clinician/sign-up" replace /> : <Landing />;
  }

  return audience === 'staff' ? (
    <InstitutionStaffSignUp institution={institution} slug={slug} />
  ) : (
    <InstitutionSignUp institution={institution} slug={slug} />
  );
}

export default TenantHome;
