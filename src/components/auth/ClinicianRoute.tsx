import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { usePracticeAdminAccess } from '@/hooks/usePracticeAdmin';
import { Loader2 } from 'lucide-react';

interface ClinicianRouteProps {
  children: React.ReactNode;
}

/**
 * Guards clinician-only routes. Redirects:
 *  - unauthenticated users to /sign-in
 *  - authenticated non-clinicians (patients) to /dashboard
 */
export function ClinicianRoute({ children }: ClinicianRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { isClinician, isLoading: profileLoading } = useClinicianProfile();
  const { isAdministrative, isLoading: adminLoading } = usePracticeAdminAccess();
  const location = useLocation();

  if (authLoading || profileLoading || adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }

  if (!isClinician) {
    // Administrative accounts have their own surface — never the patient one.
    return <Navigate to={isAdministrative ? '/practice' : '/dashboard'} replace />;
  }

  return <>{children}</>;
}
