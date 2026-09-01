import { Loader2 } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import Landing from '@/pages/Landing';
import SignIn from '@/pages/SignIn';
import InstitutionSignUp from '@/pages/InstitutionSignUp';
import InstitutionStaffSignUp from '@/pages/InstitutionStaffSignUp';
import { tenantSlugFromHost } from '@/lib/tenant-host';
import { useInstitutionBranding } from '@/hooks/useInstitutionBranding';

type Audience = 'patient' | 'staff';
type Mode = 'sign-up' | 'sign-in';

/**
 * Root route resolver.
 * On a tenant subdomain (lmc.onecare.you) the tenant is resolved from the
 * database and its branded page is rendered in place — no redirect.
 * Unknown subdomains fall back to the marketing site / generic pages.
 *
 * The same address serves both audiences and both directions: `/` is patient
 * intake, `/staff` is clinician registration, and `/sign-in` /
 * `/clinician/sign-in` land on the same branded card with the sign-in tab
 * selected. Every tenant gets this automatically — nothing per-hospital to set.
 */
export function TenantHome({
  audience = 'patient',
  mode = 'sign-up',
}: { audience?: Audience; mode?: Mode } = {}) {
  const slug = tenantSlugFromHost();
  const { institution, isLoading } = useInstitutionBranding(slug);

  // Off a tenant host there is nothing to brand — fall back to the generic
  // OneCare pages for whichever door was asked for.
  const fallback =
    mode === 'sign-in' ? (
      <SignIn />
    ) : audience === 'staff' ? (
      <Navigate to="/clinician/sign-up" replace />
    ) : (
      <Landing />
    );

  if (!slug) return fallback;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!institution) return fallback;

  return audience === 'staff' ? (
    <InstitutionStaffSignUp institution={institution} slug={slug} initialMode={mode} />
  ) : (
    <InstitutionSignUp institution={institution} slug={slug} initialMode={mode} />
  );
}

export default TenantHome;
