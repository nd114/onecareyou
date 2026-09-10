import { Loader2 } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminRole } from '@/hooks/useAdminRole';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { homeRouteFor } from '@/lib/home-route';
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
 *
 * All of that is for people who are *not* signed in. Somebody who already has
 * an account and clicks the logo is asking to go home, and home is their own
 * screen — not the marketing page, and certainly not a sign-up form for an
 * account they already hold. That was the behaviour before: a signed-in
 * patient landed on the front door of a building they were inside.
 */
export function TenantHome({
  audience = 'patient',
  mode = 'sign-up',
}: { audience?: Audience; mode?: Mode } = {}) {
  const slug = tenantSlugFromHost();
  const { institution, isLoading } = useInstitutionBranding(slug);
  const { user, loading: authLoading } = useAuth();
  const { isClinician, isTenantAdmin, isLoading: clinicianLoading } = useClinicianProfile();
  const { isAdmin, isLoading: adminLoading } = useAdminRole();

  // Somebody signed in who has arrived at a hospital's own staff address may be
  // there to ask to join it. Only send them to their own screen once we know
  // they already belong to this hospital.
  const { data: belongsHere, isLoading: membershipLoading } = useQuery({
    queryKey: ['tenant-home-membership', user?.id, institution?.id],
    enabled: !!user && audience === 'staff' && !!institution?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('practice_members')
        .select('id')
        .eq('user_id', user!.id)
        .eq('practice_id', institution!.id)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });

  const staffJoinGate = !!user && audience === 'staff' && !!slug;
  const rolesLoading =
    authLoading || clinicianLoading || adminLoading || (staffJoinGate && (isLoading || membershipLoading));

  // Wait for the roles before deciding, or a clinician is bounced to the
  // patient dashboard for a frame and then moved again.
  if (user && rolesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Signed in, at this hospital's staff door, and not one of its people yet:
  // the branded page renders its own "Join {hospital}" step.
  if (user && staffJoinGate && institution && belongsHere === false) {
    return <InstitutionStaffSignUp institution={institution} slug={slug} initialMode={mode} />;
  }

  if (user) {
    return <Navigate to={homeRouteFor({ isAdmin, isTenantAdmin, isClinician })} replace />;
  }


  // Off a tenant host there is nothing to brand — fall back to the generic
  // OneCare pages for whichever door was asked for.
  const fallback =
    mode === 'sign-in' ? (
      <SignIn audience={audience === 'staff' ? 'clinician' : 'patient'} />
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
